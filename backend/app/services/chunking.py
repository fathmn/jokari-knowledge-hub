from dataclasses import dataclass
from typing import Optional
from app.parsers.base import ParsedDocument, ParsedSection


@dataclass
class TextChunk:
    """A chunk of text for embedding and retrieval."""
    text: str
    section_path: str
    start_offset: int
    end_offset: int
    chunk_index: int
    confidence: float = 1.0


class ChunkingService:
    """Service for splitting documents into chunks."""

    def __init__(
        self,
        max_chunk_size: int = 500,  # Target tokens (roughly 4 chars per token)
        overlap: int = 50,  # Overlap in tokens
        min_chunk_size: int = 100  # Minimum chunk size
    ):
        self.max_chars = max_chunk_size * 4
        self.overlap_chars = overlap * 4
        self.min_chars = min_chunk_size * 4

    def create_chunks(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        """Create chunks from a parsed document."""
        chunks: list[TextChunk] = []
        chunk_index = 0

        for section in parsed_doc.sections:
            section_chunks = self._chunk_section(
                section,
                chunk_index,
                parsed_doc.confidence
            )
            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)

        # If no chunks created, create one from raw text
        if not chunks and parsed_doc.raw_text:
            raw_chunks = self._split_text(
                parsed_doc.raw_text,
                "",
                0,
                parsed_doc.confidence
            )
            chunks.extend(raw_chunks)

        return chunks

    def _chunk_section(
        self,
        section: ParsedSection,
        start_index: int,
        confidence: float
    ) -> list[TextChunk]:
        """Create chunks from a single section."""
        if not section.content:
            return []

        # Build section path
        path = section.path
        if section.title:
            path = f"{path} > {section.title}" if path else section.title

        return self._split_text(
            section.content,
            path,
            start_index,
            confidence,
            base_offset=section.start_offset
        )

    def _split_text(
        self,
        text: str,
        section_path: str,
        start_index: int,
        confidence: float,
        base_offset: int = 0
    ) -> list[TextChunk]:
        """Split text into overlapping chunks."""
        chunks = []

        if len(text) <= self.max_chars:
            # Text fits in one chunk
            chunks.append(TextChunk(
                text=text.strip(),
                section_path=section_path,
                start_offset=base_offset,
                end_offset=base_offset + len(text),
                chunk_index=start_index,
                confidence=confidence
            ))
            return chunks

        # Split by paragraphs first
        paragraphs = text.split("\n\n")
        current_chunk = ""
        current_start = base_offset
        chunk_idx = start_index

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # Check if adding this paragraph exceeds limit
            if len(current_chunk) + len(para) + 2 > self.max_chars:
                # Save current chunk if substantial
                if len(current_chunk) >= self.min_chars:
                    chunks.append(TextChunk(
                        text=current_chunk.strip(),
                        section_path=section_path,
                        start_offset=current_start,
                        end_offset=current_start + len(current_chunk),
                        chunk_index=chunk_idx,
                        confidence=confidence
                    ))
                    chunk_idx += 1

                    # Start new chunk with overlap
                    overlap_text = current_chunk[-self.overlap_chars:] if len(current_chunk) > self.overlap_chars else ""
                    current_chunk = overlap_text + "\n\n" + para if overlap_text else para
                    current_start = current_start + len(current_chunk) - len(overlap_text) - len(para) - 2
                else:
                    # Current chunk too small, just add paragraph
                    current_chunk = current_chunk + "\n\n" + para if current_chunk else para
            else:
                current_chunk = current_chunk + "\n\n" + para if current_chunk else para

        # Save final chunk
        if current_chunk.strip():
            chunks.append(TextChunk(
                text=current_chunk.strip(),
                section_path=section_path,
                start_offset=current_start,
                end_offset=current_start + len(current_chunk),
                chunk_index=chunk_idx,
                confidence=confidence
            ))

        return chunks

    def generate_dummy_embedding(self, text: str) -> list[float]:
        """Generate a dummy embedding for development."""
        # Create a simple hash-based embedding
        import hashlib
        hash_bytes = hashlib.sha256(text.encode()).digest()

        # Expand to 1536 dimensions (OpenAI embedding size)
        embedding = []
        for i in range(1536):
            byte_idx = i % len(hash_bytes)
            # Normalize to [-1, 1]
            value = (hash_bytes[byte_idx] / 255.0) * 2 - 1
            embedding.append(value)

        return embedding
