from dataclasses import dataclass
import hashlib
import re

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


@dataclass
class _TextBlock:
    text: str
    start_offset: int
    end_offset: int


class ChunkingService:
    """Service for splitting documents into chunks."""

    _HEADING_PATTERN = re.compile(r"^(?:\d+(?:[.)]\d+)*[.)]?\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9/+.\- ]{2,100}$")

    def __init__(
        self,
        max_chunk_size: int = 500,
        overlap: int = 50,
        min_chunk_size: int = 100,
    ):
        self.max_chars = max_chunk_size * 4
        self.overlap_chars = overlap * 4
        self.min_chars = min_chunk_size * 4

    def create_chunks(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        """Create chunks from a parsed document."""
        chunks: list[TextChunk] = []
        chunk_index = 0

        for section in parsed_doc.sections:
            section_chunks = self._chunk_section(section, chunk_index, parsed_doc.confidence)
            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)

        if not chunks and parsed_doc.raw_text:
            raw_chunks = self._split_text(
                parsed_doc.raw_text,
                "",
                0,
                parsed_doc.confidence,
            )
            chunks.extend(raw_chunks)

        return chunks

    def _chunk_section(
        self,
        section: ParsedSection,
        start_index: int,
        confidence: float,
    ) -> list[TextChunk]:
        if not section.content:
            return []

        path = section.path
        if section.title:
            path = f"{path} > {section.title}" if path else section.title

        return self._split_text(
            section.content,
            path,
            start_index,
            confidence,
            base_offset=section.start_offset,
        )

    def _split_text(
        self,
        text: str,
        section_path: str,
        start_index: int,
        confidence: float,
        base_offset: int = 0,
    ) -> list[TextChunk]:
        normalized = text.strip()
        if not normalized:
            return []

        blocks = self._build_blocks(text, base_offset)
        if not blocks:
            blocks = [_TextBlock(text=normalized, start_offset=base_offset, end_offset=base_offset + len(normalized))]

        chunks: list[TextChunk] = []
        chunk_idx = start_index
        current_blocks: list[_TextBlock] = []

        def flush_current():
            nonlocal current_blocks, chunk_idx
            if not current_blocks:
                return

            chunk_text = "\n\n".join(block.text for block in current_blocks).strip()
            if not chunk_text:
                current_blocks = []
                return

            start_offset = current_blocks[0].start_offset
            end_offset = current_blocks[-1].end_offset
            chunks.append(
                TextChunk(
                    text=chunk_text,
                    section_path=section_path,
                    start_offset=start_offset,
                    end_offset=end_offset,
                    chunk_index=chunk_idx,
                    confidence=confidence,
                )
            )
            chunk_idx += 1
            current_blocks = []

        for block in blocks:
            if len(block.text) > self.max_chars:
                flush_current()
                for large_block in self._split_large_block(block):
                    chunks.append(
                        TextChunk(
                            text=large_block.text,
                            section_path=section_path,
                            start_offset=large_block.start_offset,
                            end_offset=large_block.end_offset,
                            chunk_index=chunk_idx,
                            confidence=confidence,
                        )
                    )
                    chunk_idx += 1
                continue

            candidate_size = self._combined_length(current_blocks + [block])
            if candidate_size <= self.max_chars or not current_blocks:
                current_blocks.append(block)
                continue

            flush_current()
            if chunks:
                overlap_block = self._build_overlap_block(chunks[-1], text, base_offset)
                if overlap_block:
                    current_blocks.append(overlap_block)

            current_blocks.append(block)

        flush_current()

        return chunks

    def _build_blocks(self, text: str, base_offset: int) -> list[_TextBlock]:
        normalized = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = normalized.split("\n")
        blocks: list[_TextBlock] = []
        current_lines: list[str] = []
        current_start: int | None = None
        search_cursor = 0

        def flush_block():
            nonlocal current_lines, current_start
            block_text = "\n".join(current_lines).strip()
            if not block_text:
                current_lines = []
                current_start = None
                return

            block_position = normalized.find(block_text, current_start if current_start is not None else search_cursor)
            if block_position < 0:
                block_position = current_start if current_start is not None else search_cursor

            blocks.append(
                _TextBlock(
                    text=block_text,
                    start_offset=base_offset + block_position,
                    end_offset=base_offset + block_position + len(block_text),
                )
            )
            current_lines = []
            current_start = None

        for index, raw_line in enumerate(lines):
            line = raw_line.strip()
            next_line = next((candidate.strip() for candidate in lines[index + 1 :] if candidate.strip()), None)

            if not line:
                flush_block()
                continue

            line_position = normalized.find(line, search_cursor)
            if line_position >= 0:
                search_cursor = line_position + len(line)

            if self._is_heading_like(line, next_line):
                flush_block()
                current_lines = [line]
                current_start = line_position if line_position >= 0 else search_cursor
                continue

            if current_start is None:
                current_start = line_position if line_position >= 0 else search_cursor

            current_lines.append(line)

        flush_block()
        return blocks

    def _split_large_block(self, block: _TextBlock) -> list[_TextBlock]:
        units = [
            part.strip()
            for part in re.split(r"(?<=[.!?])\s+|\n+", block.text)
            if part and part.strip()
        ]
        if not units:
            units = [block.text]

        pieces: list[_TextBlock] = []
        current_text = ""
        current_start = block.start_offset
        search_cursor = 0

        for unit in units:
            candidate = f"{current_text} {unit}".strip() if current_text else unit
            if len(candidate) <= self.max_chars or not current_text:
                if not current_text:
                    offset_in_block = block.text.find(unit, search_cursor)
                    if offset_in_block < 0:
                        offset_in_block = search_cursor
                    current_start = block.start_offset + offset_in_block
                    search_cursor = offset_in_block + len(unit)
                current_text = candidate
                continue

            pieces.append(
                _TextBlock(
                    text=current_text,
                    start_offset=current_start,
                    end_offset=current_start + len(current_text),
                )
            )

            overlap_text = current_text[-self.overlap_chars :].strip() if len(current_text) > self.overlap_chars else ""
            current_text = f"{overlap_text} {unit}".strip() if overlap_text else unit
            offset_in_block = block.text.find(unit, search_cursor)
            if offset_in_block < 0:
                offset_in_block = search_cursor
            current_start = block.start_offset + offset_in_block
            search_cursor = offset_in_block + len(unit)

        if current_text:
            pieces.append(
                _TextBlock(
                    text=current_text,
                    start_offset=current_start,
                    end_offset=current_start + len(current_text),
                )
            )

        return pieces

    def _build_overlap_block(
        self,
        previous_chunk: TextChunk,
        source_text: str,
        base_offset: int,
    ) -> _TextBlock | None:
        if len(previous_chunk.text) <= self.overlap_chars:
            overlap_text = previous_chunk.text.strip()
        else:
            overlap_text = previous_chunk.text[-self.overlap_chars :].strip()

        if not overlap_text:
            return None

        overlap_position = source_text.find(overlap_text)
        if overlap_position < 0:
            overlap_position = max(previous_chunk.end_offset - base_offset - len(overlap_text), 0)

        return _TextBlock(
            text=overlap_text,
            start_offset=base_offset + overlap_position,
            end_offset=base_offset + overlap_position + len(overlap_text),
        )

    def _combined_length(self, blocks: list[_TextBlock]) -> int:
        if not blocks:
            return 0
        return sum(len(block.text) for block in blocks) + max(0, (len(blocks) - 1) * 2)

    def _is_heading_like(self, line: str, next_line: str | None) -> bool:
        if len(line) < 3 or len(line) > 100:
            return False
        if line.endswith((".", ";", "?", "!")):
            return False
        if not next_line or len(next_line) < 30:
            return False
        return bool(self._HEADING_PATTERN.match(line))

    def generate_dummy_embedding(self, text: str) -> list[float]:
        """Generate a dummy embedding for development."""
        hash_bytes = hashlib.sha256(text.encode()).digest()

        embedding = []
        for index in range(1536):
            byte_index = index % len(hash_bytes)
            value = (hash_bytes[byte_index] / 255.0) * 2 - 1
            embedding.append(value)

        return embedding
