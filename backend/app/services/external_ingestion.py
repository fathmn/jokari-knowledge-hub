import hashlib
import html as html_lib
import ipaddress
from html.parser import HTMLParser
import json
import math
import os
import re
import socket
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urljoin, urlparse
from uuid import UUID

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.attachment import RecordAttachment
from app.models.evidence import Evidence
from app.models.external_import import (
    ExternalImport,
    ExternalImportStatus,
    ExternalSourceType,
    ExternalTrustType,
)
from app.models.proposed_update import ProposedUpdate, UpdateStatus
from app.models.record import Record, RecordStatus
from app.config import get_settings
from app.schemas.external_ingestion import (
    ExternalImportRequest,
    ExternalImportResponse,
    ModelPricing,
    SitemapUrlSummary,
    TokenEstimateItem,
    TokenEstimateRequest,
    TokenEstimateResponse,
    WebsiteImportPageResult,
    WebsiteImportRequest,
    WebsiteImportResponse,
)
from app.schemas.knowledge.registry import get_schema_registry
from app.services.completeness import CompletenessService
from app.services.merge import MergeService
from app.services.storage import get_storage_service


TRUSTED_AUTO_APPROVAL_RULES = {
    ExternalSourceType.DIRECT_PIM_API: {ExternalTrustType.AUTHENTICATED_PIM},
}


class TokenCostEstimator:
    """Estimate extraction tokens and model cost before importing external data."""

    def estimate(self, request: TokenEstimateRequest) -> TokenEstimateResponse:
        input_tokens = 0
        output_tokens = 0

        for item in request.items:
            chars = item.average_chars if item.average_chars is not None else len(item.sample_text or "")
            input_tokens += math.ceil(chars / 4) * item.record_count
            output_tokens += item.expected_output_tokens_per_record * item.record_count

        pricing = request.pricing
        input_cost = input_tokens / 1_000_000 * pricing.input_per_million
        output_cost = output_tokens / 1_000_000 * pricing.output_per_million

        return TokenEstimateResponse(
            model=pricing.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            estimated_input_cost_usd=round(input_cost, 6),
            estimated_output_cost_usd=round(output_cost, 6),
            estimated_total_cost_usd=round(input_cost + output_cost, 6),
            pricing_verified_on=pricing.verified_on,
            pricing_source_url=pricing.source_url,
        )


@dataclass(frozen=True)
class SitemapPlan:
    summary: SitemapUrlSummary
    estimate: TokenEstimateResponse


class SitemapPlanningService:
    """Parse sitemap XML into crawl/import planning numbers without crawling pages."""

    DEFAULT_AVERAGE_CHARS = {
        "product_detail": 5_800,
        "jowiki_article": 600,
        "content_detail": 5_200,
        "category": 16_600,
        "other": 4_000,
    }

    def plan(self, sitemap_xml: str, pricing: ModelPricing | None = None) -> SitemapPlan:
        urls = self.extract_urls(sitemap_xml)
        unique_urls = list(dict.fromkeys(urls))
        buckets: dict[str, int] = {}
        items: list[TokenEstimateItem] = []

        for url in unique_urls:
            bucket = self.bucket_url(url)
            buckets[bucket] = buckets.get(bucket, 0) + 1

        for bucket, count in buckets.items():
            average_chars = self.DEFAULT_AVERAGE_CHARS.get(bucket, self.DEFAULT_AVERAGE_CHARS["other"])
            output_tokens = 900 if bucket == "product_detail" else 350 if bucket == "jowiki_article" else 600
            items.append(
                TokenEstimateItem(
                    source_type=ExternalSourceType.SITEMAP,
                    source_id=bucket,
                    average_chars=average_chars,
                    record_count=count,
                    expected_output_tokens_per_record=output_tokens,
                )
            )

        estimate = TokenCostEstimator().estimate(
            TokenEstimateRequest(items=items, pricing=pricing or ModelPricing())
        )
        return SitemapPlan(
            summary=SitemapUrlSummary(
                total_entries=len(urls),
                unique_urls=len(unique_urls),
                duplicates=len(urls) - len(unique_urls),
                by_source_type=buckets,
            ),
            estimate=estimate,
        )

    def extract_urls(self, sitemap_xml: str) -> list[str]:
        return [match.group(1).strip() for match in re.finditer(r"<loc>\s*([^<]+)\s*</loc>", sitemap_xml)]

    def bucket_url(self, url: str) -> str:
        path = url.lower()
        if "/produkte/detail/" in path or "/products/detail/" in path or "/productos/detail/" in path:
            return "product_detail"
        if "jostudy.de/jowiki/" in path:
            return "jowiki_article"
        if "/blog-jostory/detail/" in path or "/presse/detail/" in path or "/press/detail/" in path or "/prensa/detail/" in path:
            return "content_detail"
        if "/produkte/" in path or "/products/" in path or "/productos/" in path:
            return "category"
        return "other"


@dataclass(frozen=True)
class ExtractedImage:
    url: str
    alt: str | None = None
    width: int | None = None
    height: int | None = None


@dataclass(frozen=True)
class ExtractedPage:
    url: str
    title: str
    text: str
    html: str
    images: list[ExtractedImage]


class HtmlPageExtractor(HTMLParser):
    """Small dependency-free HTML text and image extractor for public website imports."""

    TEXT_TAGS = {"title", "h1", "h2", "h3", "p", "li", "td", "th"}
    SKIP_TAGS = {"script", "style", "noscript", "svg"}

    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self._skip_depth = 0
        self._capture_stack: list[str] = []
        self._parts: list[str] = []
        self._title_parts: list[str] = []
        self.images: list[ExtractedImage] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return

        attrs_dict = {key.lower(): value for key, value in attrs if value}
        if tag == "img" and attrs_dict.get("src"):
            image_url = urljoin(self.base_url, attrs_dict["src"])
            width = self._parse_int(attrs_dict.get("width"))
            height = self._parse_int(attrs_dict.get("height"))
            if self._is_supported_image_url(image_url) and self._is_content_image(image_url, width, height):
                self.images.append(
                    ExtractedImage(
                        url=image_url,
                        alt=attrs_dict.get("alt"),
                        width=width,
                        height=height,
                    )
                )

        if tag in self.TEXT_TAGS:
            self._capture_stack.append(tag)

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._capture_stack and self._capture_stack[-1] == tag:
            self._capture_stack.pop()
            self._parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth or not self._capture_stack:
            return
        cleaned = self._clean_text(data)
        if not cleaned:
            return
        if self._capture_stack[-1] == "title":
            self._title_parts.append(cleaned)
        self._parts.append(cleaned)

    def to_page(self, url: str, html: str) -> ExtractedPage:
        text = self._clean_text(" ".join(self._parts))
        title = self._clean_title(" ".join(self._title_parts), text, url)
        images = self._dedupe_images(self._meta_images(html) + self._h5p_images(html, url) + self.images)
        return ExtractedPage(url=url, title=title, text=text, html=html, images=images)

    def _clean_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text or "").strip()

    def _clean_title(self, raw_title: str, text: str, url: str) -> str:
        title = raw_title.split("|")[0].strip()
        if title:
            return title
        first_line = (text or "").split(".")[0].strip()
        if first_line:
            return first_line[:160]
        return urlparse(url).path.rstrip("/").split("/")[-1].replace("-", " ").title()

    def _is_supported_image_url(self, image_url: str) -> bool:
        path = urlparse(image_url).path.lower()
        return path.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))

    def _is_content_image(self, image_url: str, width: int | None, height: int | None) -> bool:
        path = urlparse(image_url).path.lower()
        if any(marker in path for marker in ("/icons/flags/", "favicon", "logo", "sprite")):
            return False
        if width is not None and height is not None and max(width, height) < 100:
            return False
        return True

    def _parse_int(self, value: str | None) -> int | None:
        if not value:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    def _meta_images(self, html: str) -> list[ExtractedImage]:
        images: list[ExtractedImage] = []
        for meta_name in ("og:image", "twitter:image"):
            match = re.search(
                rf"<meta\b(?=[^>]*(?:name|property)=[\"']{re.escape(meta_name)}[\"'])[^>]*content=[\"']([^\"']+)[\"'][^>]*>",
                html,
                flags=re.IGNORECASE,
            )
            if match:
                images.append(ExtractedImage(url=urljoin(self.base_url, match.group(1)), alt=meta_name, width=None, height=None))
        return images

    def _dedupe_images(self, images: list[ExtractedImage]) -> list[ExtractedImage]:
        deduped: list[ExtractedImage] = []
        seen: set[str] = set()
        for image in images:
            key = self._image_identity(image.url)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(image)
        return deduped

    def _image_identity(self, image_url: str) -> str:
        basename = os.path.basename(urlparse(image_url).path).lower()
        basename = re.sub(r"^csm_", "", basename)
        return re.sub(r"_[a-f0-9]{8,}(?=\.[a-z0-9]+$)", "", basename)

    def _h5p_images(self, html: str, url: str) -> list[ExtractedImage]:
        h5p = extract_h5p_content(html, url)
        return [ExtractedImage(url=image_url, alt="H5P image", width=None, height=None) for image_url in h5p["images"]]


class HttpWebsiteFetcher:
    def __init__(self, url_guard: "WebsiteUrlGuard"):
        self.url_guard = url_guard

    def fetch_html(self, url: str) -> str:
        self.url_guard.validate_fetch_url(url)
        with httpx.Client(timeout=get_settings().website_import_http_timeout_seconds, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            self.url_guard.validate_fetch_url(str(response.url))
            return response.text

    def fetch_binary(self, url: str) -> tuple[bytes, str]:
        self.url_guard.validate_fetch_url(url)
        with httpx.Client(timeout=get_settings().website_import_http_timeout_seconds, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            self.url_guard.validate_fetch_url(str(response.url))
            return response.content, response.headers.get("content-type", "application/octet-stream")


def clean_html_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<noscript[\s\S]*?</noscript>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<svg[\s\S]*?</svg>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", html_lib.unescape(text)).strip()
    text = re.sub(r"\bbzw\s+\.", "bzw.", text, flags=re.IGNORECASE)
    text = re.sub(r"\bz\.\s+B\s+\.", "z. B.", text, flags=re.IGNORECASE)
    text = re.sub(r"\bmm\s*2\b", "mm²", text)
    return text


def clean_html_rich_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<noscript[\s\S]*?</noscript>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<svg[\s\S]*?</svg>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(?:p|div|li|h[1-6]|tr)>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\bmm\s*2\b", "mm²", text)
    return text.strip()


def extract_meta_content(html: str, selector: str) -> str:
    match = re.search(
        rf"<meta\b(?=[^>]*(?:name|property)=[\"']{re.escape(selector)}[\"'])[^>]*content=[\"']([^\"']+)[\"'][^>]*>",
        html,
        flags=re.IGNORECASE,
    )
    return clean_html_text(match.group(1)) if match else ""


def extract_html_field_text(html: str, class_name: str) -> str:
    match = re.search(
        rf"<div[^>]+class=[\"'][^\"']*{re.escape(class_name)}[^\"']*[\"'][^>]*>([\s\S]*?)</div>",
        html,
        flags=re.IGNORECASE,
    )
    return clean_html_rich_text(match.group(1)) if match else ""


def extract_html_field_items(html: str, class_name: str) -> list[str]:
    if class_name == "field-kategorie":
        match = re.search(
            r"<div[^>]+class=[\"'][^\"']*field-kategorie[^\"']*[\"'][^>]*>([\s\S]*?)</div>\s*<div[^>]+class=[\"'][^\"']*field-interaktiver-inhalt",
            html,
            flags=re.IGNORECASE,
        )
    else:
        match = re.search(
            rf"<div[^>]+class=[\"'][^\"']*{re.escape(class_name)}[^\"']*[\"'][^>]*>([\s\S]*?)</div>",
            html,
            flags=re.IGNORECASE,
        )
    if not match:
        return []
    return [
        clean_html_text(item.group(1))
        for item in re.finditer(r"<div[^>]*>([\s\S]*?)</div>", match.group(1), flags=re.IGNORECASE)
        if clean_html_text(item.group(1))
    ]


def extract_product_description_bullets(html: str) -> list[str]:
    match = re.search(
        r"<div[^>]+itemprop=[\"']description[\"'][^>]*>([\s\S]*?)</div>\s*<div[^>]+class=[\"']product__certifications",
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        return []
    return [
        clean_html_text(item.group(1))
        for item in re.finditer(r"<li[^>]*>([\s\S]*?)</li>", match.group(1), flags=re.IGNORECASE)
        if clean_html_text(item.group(1))
    ]


def extract_product_details(html: str) -> dict[str, str]:
    match = re.search(r"id=[\"']productDetails[\"'][\s\S]*?<dl[^>]*>([\s\S]*?)</dl>", html, flags=re.IGNORECASE)
    if not match:
        return {}
    details: dict[str, str] = {}
    for item in re.finditer(r"<dt[^>]*>([\s\S]*?)</dt>\s*<dd[^>]*>([\s\S]*?)</dd>", match.group(1), flags=re.IGNORECASE):
        key = clean_html_text(item.group(1)).rstrip(":")
        value = clean_html_text(item.group(2))
        if key and value:
            details[key] = value
    return details


def extract_related_product_cards(html: str) -> list[str]:
    related = re.search(r"<h2>\s*Verwandte Produkte\s*</h2>[\s\S]*", html, flags=re.IGNORECASE)
    if not related:
        return []
    products: list[str] = []
    for item in re.finditer(
        r"<div class=[\"']teaser__subtitle[\"']>\s*Art\.-Nr\.\s*([^<]+)</div>[\s\S]*?<div class=[\"']teaser__title[\"']>\s*([\s\S]*?)</div>[\s\S]*?<div class=[\"']teaser__text[\"']>\s*([\s\S]*?)</div>",
        related.group(0),
        flags=re.IGNORECASE,
    ):
        products.append(
            f"{clean_html_text(item.group(2))} (Art.-Nr. {clean_html_text(item.group(1))}): {clean_html_text(item.group(3))}"
        )
    return list(dict.fromkeys(products))


def extract_article_html(html: str) -> str:
    match = re.search(r"<div[^>]+class=[\"'][^\"']*article__header[\s\S]*", html, flags=re.IGNORECASE)
    if not match:
        return html
    block = match.group(0)
    end = re.search(r"<!--\s*related things\s*-->|<div[^>]+class=[\"'][^\"']*news-backlink-wrap", block, flags=re.IGNORECASE)
    return block[: end.start()] if end else block


def extract_first_clean_match(html: str, pattern: str) -> str:
    match = re.search(pattern, html, flags=re.IGNORECASE)
    return clean_html_text(match.group(1)) if match else ""


def extract_html_tables(html: str) -> list[str]:
    tables: list[str] = []
    for table in re.finditer(r"<table\b[\s\S]*?</table>", html, flags=re.IGNORECASE):
        rows: list[str] = []
        for row in re.finditer(r"<tr\b[\s\S]*?</tr>", table.group(0), flags=re.IGNORECASE):
            cells = [
                clean_html_text(cell.group(1))
                for cell in re.finditer(r"<t[dh]\b[^>]*>([\s\S]*?)</t[dh]>", row.group(0), flags=re.IGNORECASE)
            ]
            cells = [cell for cell in cells if cell]
            if cells:
                rows.append(" | ".join(cells))
        if rows:
            tables.append("\n".join(rows))
    return tables


def extract_jostory_article(html: str, url: str, fallback_title: str) -> dict[str, Any]:
    block = extract_article_html(html)
    title = (
        extract_first_clean_match(block, r"<h1[^>]*itemprop=[\"']headline[\"'][^>]*>([\s\S]*?)</h1>")
        or fallback_title
    )
    teaser = (
        extract_first_clean_match(block, r"<div[^>]+class=[\"'][^\"']*teaser-text[^\"']*[\"'][^>]*>([\s\S]*?)</div>")
        or extract_meta_content(html, "description")
    )
    published_at = extract_first_clean_match(
        block,
        r"<time[^>]+itemprop=[\"']datePublished[\"'][^>]*datetime=[\"']([^\"']+)[\"'][^>]*>",
    )
    modified_at = extract_first_clean_match(
        block,
        r"<meta[^>]+itemprop=[\"']dateModified[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>",
    )
    category = (
        extract_first_clean_match(block, r"<span[^>]+class=[\"'][^\"']*news-list-category[^\"']*[\"'][^>]*>([\s\S]*?)</span>")
        or "JO!STORY"
    )
    author = extract_first_clean_match(block, r"<span[^>]+itemprop=[\"']name[\"'][^>]*>([\s\S]*?)</span>")
    sections: list[str] = []
    headings: list[str] = []

    for section in re.finditer(r"<section\b[\s\S]*?</section>", block, flags=re.IGNORECASE):
        section_html = section.group(0)
        heading = extract_first_clean_match(section_html, r"<h2[^>]*>([\s\S]*?)</h2>")
        paragraphs = [
            clean_html_text(paragraph.group(1))
            for paragraph in re.finditer(r"<p\b[^>]*>([\s\S]*?)</p>", section_html, flags=re.IGNORECASE)
        ]
        paragraphs = [paragraph for paragraph in paragraphs if paragraph and not re.match(r"^Zurueck\b|^Zurück\b", paragraph, flags=re.IGNORECASE)]
        paragraphs = [paragraph for paragraph in paragraphs if not re.match(r"^Das könnte Sie auch interessieren\b", paragraph, flags=re.IGNORECASE)]
        tables = [f"Tabelle:\n{table}" for table in extract_html_tables(section_html)]
        captions = [
            f"Bild: {clean_html_text(caption.group(1))}"
            for caption in re.finditer(r"<figcaption[^>]*>([\s\S]*?)</figcaption>", section_html, flags=re.IGNORECASE)
            if clean_html_text(caption.group(1))
        ]
        parts = [part for part in [heading, *paragraphs, *tables, *captions] if part]
        if not parts:
            continue
        if heading:
            headings.append(heading)
        sections.append("\n\n".join(parts))

    content = "\n\n".join(part for part in [teaser, *sections] if part).strip()
    return {
        "title": title,
        "content": content,
        "teaser": teaser,
        "published_at": published_at,
        "modified_at": modified_at,
        "category": category,
        "author": author,
        "headings": headings,
    }


def extract_h5p_content(html: str, base_url: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"texts": [], "images": []}
    match = re.search(
        r"<script[^>]+data-drupal-selector=[\"']drupal-settings-json[\"'][^>]*>([\s\S]*?)</script>",
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        return result
    try:
        settings = json.loads(match.group(1))
    except json.JSONDecodeError:
        return result

    contents = settings.get("h5p", {}).get("H5PIntegration", {}).get("contents", {})

    def walk(node: Any, content_id: str) -> None:
        if not isinstance(node, dict):
            return
        params = node.get("params")
        if isinstance(node.get("content"), dict) and isinstance(node["content"].get("params"), dict):
            params = node["content"]["params"]
        if isinstance(params, dict):
            text = params.get("text")
            if isinstance(text, str):
                cleaned = clean_html_rich_text(text)
                if cleaned:
                    result["texts"].append(cleaned)
            file_path = params.get("file", {}).get("path") if isinstance(params.get("file"), dict) else None
            if file_path:
                result["images"].append(urljoin(base_url, f"/sites/default/files/h5p/content/{content_id}/{file_path}"))
        for value in node.values():
            if isinstance(value, list):
                for item in value:
                    walk(item, content_id)
            elif isinstance(value, dict):
                walk(value, content_id)

    for cid, entry in contents.items():
        if not isinstance(entry, dict):
            continue
        try:
            content = json.loads(entry.get("jsonContent") or "{}")
        except json.JSONDecodeError:
            continue
        walk(content, cid.removeprefix("cid-"))

    result["texts"] = list(dict.fromkeys(result["texts"]))
    result["images"] = list(dict.fromkeys(result["images"]))
    return result


class WebsiteUrlGuard:
    def __init__(self, allowed_hosts: list[str]):
        self.allowed_hosts = [host.lower() for host in allowed_hosts]

    def is_allowed_url(self, url: str) -> bool:
        try:
            self.validate_url(url, resolve_dns=False)
        except ValueError:
            return False
        return True

    def validate_fetch_url(self, url: str) -> None:
        self.validate_url(url, resolve_dns=True)

    def validate_url(self, url: str, resolve_dns: bool) -> None:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or not hostname:
            raise ValueError("Website-Import erlaubt nur http/https URLs mit Host")
        if not any(hostname == allowed or hostname.endswith(f".{allowed}") for allowed in self.allowed_hosts):
            raise ValueError("Website-Import Host ist nicht erlaubt")
        if hostname in {"localhost"} or hostname.endswith(".localhost") or hostname.endswith(".local"):
            raise ValueError("Website-Import blockiert lokale Hosts")
        self._validate_ip(hostname)
        if resolve_dns:
            self._validate_resolved_addresses(hostname)

    def _validate_resolved_addresses(self, hostname: str) -> None:
        try:
            infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise ValueError(f"Website-Import Host kann nicht aufgeloest werden: {hostname}") from exc
        for info in infos:
            self._validate_ip(info[4][0])

    def _validate_ip(self, value: str) -> None:
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            return
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise ValueError("Website-Import blockiert private oder lokale Netzwerkadressen")


class WebsiteCrawlerImportService:
    """Fetch public website pages, normalize them to existing schemas, and import them for review."""

    def __init__(self, db: Session, fetcher=None, storage=None):
        self.db = db
        self.url_guard = WebsiteUrlGuard(get_settings().website_import_allowed_hosts_list)
        self.fetcher = fetcher or HttpWebsiteFetcher(self.url_guard)
        self.storage = storage

    def import_public_pages(self, request: WebsiteImportRequest, actor: str) -> WebsiteImportResponse:
        urls = self._resolve_request_urls(request)
        results: list[WebsiteImportPageResult] = []

        for url in urls:
            try:
                page = self._fetch_page(url)
                payload = self._build_import_payload(page, request.source_type)
                response = ExternalKnowledgeImportService(self.db).import_record(payload, actor=actor)
                images_attached = 0
                if request.include_images and response.record_id and not response.duplicate:
                    if response.record_action in {"created_record", "updated_record"}:
                        images_attached = self._attach_images(response.record_id, page, request.max_images_per_page)
                results.append(
                    WebsiteImportPageResult(
                        url=url,
                        status=response.status,
                        record_id=response.record_id,
                        record_status=response.record_status,
                        schema_type=payload.schema_type or get_schema_registry().get_schema(payload.doc_type).__name__,
                        images_found=len(page.images),
                        images_attached=images_attached,
                    )
                )
            except Exception as exc:
                results.append(
                    WebsiteImportPageResult(
                        url=url,
                        status="failed",
                        images_found=0,
                        images_attached=0,
                        error=str(exc),
                    )
                )

        return WebsiteImportResponse(
            total_urls=len(urls),
            imported=sum(1 for item in results if item.status in {ExternalImportStatus.IMPORTED.value, ExternalImportStatus.UPDATED.value}),
            needs_review=sum(1 for item in results if item.record_status == RecordStatus.NEEDS_REVIEW),
            auto_approved=sum(1 for item in results if item.record_status == RecordStatus.APPROVED),
            duplicates=sum(1 for item in results if item.status == ExternalImportStatus.SKIPPED_DUPLICATE.value),
            failed=sum(1 for item in results if item.status == "failed"),
            images_attached=sum(item.images_attached for item in results),
            results=results,
        )

    def _resolve_request_urls(self, request: WebsiteImportRequest) -> list[str]:
        urls = [str(url) for url in request.urls]
        if request.sitemap_xml:
            urls.extend(SitemapPlanningService().extract_urls(request.sitemap_xml))
        deduped = list(dict.fromkeys(urls))
        max_pages = min(request.max_pages, get_settings().website_import_max_pages)
        return [url for url in deduped if self.url_guard.is_allowed_url(url)][:max_pages]

    def _fetch_page(self, url: str) -> ExtractedPage:
        html = self.fetcher.fetch_html(url)
        extractor = HtmlPageExtractor(url)
        extractor.feed(html)
        return extractor.to_page(url, html)

    def _build_import_payload(self, page: ExtractedPage, source_type: ExternalSourceType) -> ExternalImportRequest:
        if self._is_jowiki_url(page.url):
            return self._build_jowiki_payload(page, source_type)
        if self._is_product_detail_url(page.url):
            return self._build_product_payload(page, source_type)
        if self._is_jostory_url(page.url):
            return self._build_jostory_payload(page, source_type)
        return self._build_generic_content_payload(page, source_type)

    def _build_jowiki_payload(self, page: ExtractedPage, source_type: ExternalSourceType) -> ExternalImportRequest:
        h5p = extract_h5p_content(page.html, page.url)
        intro = extract_html_field_text(page.html, "field-beschreibung")
        categories = extract_html_field_items(page.html, "field-kategorie")
        answer = "\n\n".join(part for part in [intro, *h5p["texts"]] if part).strip() or self._clean_website_text(page.text)
        return ExternalImportRequest(
            source_type=source_type,
            source_id=f"{source_type.value}:{page.url}",
            source_url=page.url,
            trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
            authenticated_source=False,
            department="support",
            doc_type="faq",
            data_json={
                "question": page.title,
                "answer": answer[:6000],
                "category": " / ".join(categories) or "JO!Wiki",
                "related_products": self._extract_related_products(answer),
            },
            evidence_excerpt=answer[:1000],
        )

    def _build_product_payload(self, page: ExtractedPage, source_type: ExternalSourceType) -> ExternalImportRequest:
        bullets = extract_product_description_bullets(page.html)
        details = extract_product_details(page.html)
        artnr = details.get("Art.-Nr.") or details.get("Art.-Nr") or self._extract_artnr(page.text) or self._slug_from_url(page.url)
        meta_description = extract_meta_content(page.html, "description")
        description = meta_description or (bullets[0] if bullets else self._clean_website_text(self._body_text(page)))
        related = extract_related_product_cards(page.html)
        return ExternalImportRequest(
            source_type=source_type,
            source_id=f"{source_type.value}:{page.url}",
            source_url=page.url,
            trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
            authenticated_source=False,
            department="product",
            doc_type="product_spec",
            data_json={
                "artnr": artnr,
                "name": page.title,
                "description": description[:6000],
                "specs": {
                    **details,
                    "Merkmale": bullets,
                },
                "compatibility": related or self._extract_related_products(" ".join([description, *bullets])),
            },
            evidence_excerpt="\n".join([description, *bullets, *[f"{key}: {value}" for key, value in details.items()]])[:1000],
        )

    def _build_jostory_payload(self, page: ExtractedPage, source_type: ExternalSourceType) -> ExternalImportRequest:
        article = extract_jostory_article(page.html, page.url, page.title)
        content = article["content"] or self._body_text(page)
        return ExternalImportRequest(
            source_type=source_type,
            source_id=f"{source_type.value}:{page.url}",
            source_url=page.url,
            trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
            authenticated_source=False,
            department="sales",
            doc_type="training_module",
            data_json={
                "title": article["title"],
                "content": content,
                "objectives": [],
                "target_audience": "Vertrieb, Support und Wissensnutzer",
                "product_category": article["category"] or "JO!STORY",
                "key_points": [point for point in [article["teaser"], *article["headings"]] if point][:8],
                "related_products": self._extract_related_products(content),
                "summary": article["teaser"] or None,
                "author": article["author"] or None,
                "published_at": article["published_at"] or None,
                "modified_at": article["modified_at"] or None,
                "article_images": [image.url for image in page.images],
            },
            evidence_excerpt=content[:1000],
        )

    def _build_generic_content_payload(self, page: ExtractedPage, source_type: ExternalSourceType) -> ExternalImportRequest:
        return ExternalImportRequest(
            source_type=source_type,
            source_id=f"{source_type.value}:{page.url}",
            source_url=page.url,
            trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
            authenticated_source=False,
            department="sales",
            doc_type="training_module",
            data_json={
                "title": page.title,
                "content": self._body_text(page),
                "objectives": [],
                "target_audience": None,
                "product_category": "Website Content",
                "key_points": self._extract_key_points(page.text),
                "related_products": self._extract_related_products(page.text),
            },
            evidence_excerpt=page.text[:1000],
        )

    def _attach_images(self, record_id: UUID, page: ExtractedPage, max_images: int = 8) -> int:
        storage = self.storage or get_storage_service()
        attached = 0
        seen: set[str] = set()

        limit = min(max_images, get_settings().website_import_max_images_per_page)
        for image in page.images[:limit]:
            if image.url in seen:
                continue
            if not self.url_guard.is_allowed_url(image.url):
                continue
            seen.add(image.url)
            try:
                content, content_type = self.fetcher.fetch_binary(image.url)
                filename = self._image_filename(image.url, image.alt)
                file_path = storage.upload_file(content, filename, content_type)
                self.db.add(
                    RecordAttachment(
                        record_id=record_id,
                        filename=filename,
                        file_type=content_type,
                        file_path=file_path,
                        file_size=str(len(content)),
                    )
                )
                attached += 1
            except Exception:
                continue

        self.db.commit()
        return attached

    def _is_jowiki_url(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.netloc.endswith("jostudy.de") and parsed.path.startswith("/jowiki/")

    def _is_product_detail_url(self, url: str) -> bool:
        path = urlparse(url).path.lower()
        return "/produkte/detail/" in path or "/products/detail/" in path or "/productos/detail/" in path

    def _is_jostory_url(self, url: str) -> bool:
        return "/wissen/blog-jostory/detail/" in urlparse(url).path.lower()

    def _body_text(self, page: ExtractedPage) -> str:
        text = page.text.replace(page.title, "", 1).strip()
        raw_text = text or page.title
        return raw_text[:6000] if raw_text else page.title

    def _clean_website_text(self, text: str) -> str:
        normalized = re.sub(r"\s+", " ", text or "").strip()
        content_markers = [
            "Geschichte der Kabelentwicklung:",
            "Kabelbearbeitung:",
            "Isolierstoffe:",
            "Werkzeugkunde:",
        ]
        for marker in content_markers:
            index = normalized.find(marker)
            if index > 0:
                normalized = normalized[index:].strip()
                break
        cut_patterns = [
            r"\s*\|\s*JOKARI\b",
            r"\bDirekt zum Inhalt\b",
            r"\bGerman English Login\b",
            r"\bLogin\s*-->",
            r"\bSuchen\s*-->",
            r"\bAnmelden oder Registrieren\b",
            r"\bJOKARI GmbH\b",
            r"\bImpressum\b",
            r"\bZum Inhalt springen\b",
            r"\bZum Seitenende springen\b",
            r"\bZur Navigation am Seitenende springen\b",
            r"\bJOKARI homepage\b",
            r"\bHauptnavigation\b",
            r"\bLink kopieren\b",
            r"\bLink kopiert\b",
            r"\bAdd to watchlist\b",
            r"\bDialog schließen\b",
            r"\bVerfügbare Händler\b",
            r"\bKundengruppen\b",
            r"\bZahlungsarten\b",
            r"\bLieferart\b",
            r"\bHändlertyp\b",
            r"\bZu vorherigem Slide wechseln\b",
            r"\bZu nächstem Slide wechseln\b",
            r"\bJO!STORY\b",
        ]
        for pattern in cut_patterns:
            match = re.search(pattern, normalized, flags=re.IGNORECASE)
            if match and match.start() > 10:
                normalized = normalized[: match.start()].strip()
                break
        return re.sub(r"\s*Jetzt (?:bestellen|kaufen)!?$", "", normalized, flags=re.IGNORECASE).strip()

    def _extract_artnr(self, text: str) -> str | None:
        patterns = [
            r"(?:Art\.?-?Nr\.?|Artikelnummer|Article\s+No\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})",
            r"\b(\d{5})\b",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip().rstrip(".,;:")
        return None

    def _slug_from_url(self, url: str) -> str:
        return urlparse(url).path.rstrip("/").split("/")[-1]

    def _extract_key_points(self, text: str) -> list[str]:
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
        return sentences[:5]

    def _extract_related_products(self, text: str) -> list[str]:
        matches = re.findall(r"\b(?:JOKARI\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9+-]*(?:\s+(?:No\.?\s*)?[A-ZÄÖÜ]?[A-Za-zÄÖÜäöüß0-9+-]+){0,3}\b", text)
        blocked = {"German", "English", "Login", "Suchen", "JOKARI GmbH", "Direkt zum Inhalt"}
        products = []
        for match in matches:
            value = match.strip()
            if value in blocked or len(value) < 4:
                continue
            if any(marker in value.lower() for marker in ("jokari", "secura", "sensor", "strip", "kabelmesser", "abisolierzange", "entmanteler")):
                products.append(value)
        return list(dict.fromkeys(products))[:10]

    def _image_filename(self, image_url: str, alt: str | None) -> str:
        basename = os.path.basename(urlparse(image_url).path)
        if basename and "." in basename:
            return basename[:500]
        safe_alt = re.sub(r"[^A-Za-z0-9._-]+", "-", alt or "website-image").strip("-")
        return f"{safe_alt or 'website-image'}.jpg"[:500]


class ExternalKnowledgeImportService:
    """Persist external website/PIM-derived knowledge with provenance and guarded auto-approval."""

    def __init__(self, db: Session):
        self.db = db
        self.registry = get_schema_registry()
        self.merge = MergeService()
        self.completeness = CompletenessService()

    def import_record(
        self,
        payload: ExternalImportRequest,
        actor: str,
        actor_is_pim_trusted: bool = False,
    ) -> ExternalImportResponse:
        expected_schema = self.registry.get_schema(payload.doc_type)
        schema_type = expected_schema.__name__
        if payload.schema_type and payload.schema_type != schema_type:
            raise ValueError("schema_type muss zum doc_type passen")
        schema_cls = self.registry.get_schema_by_name(schema_type)
        schema_cls.model_validate(payload.data_json)

        content_hash = self.compute_content_hash(payload.data_json)
        duplicate_import = self._find_duplicate_import(payload.source_type, payload.source_id, content_hash)
        if duplicate_import:
            return ExternalImportResponse(
                import_id=duplicate_import.id,
                record_id=duplicate_import.record_id,
                status=ExternalImportStatus.SKIPPED_DUPLICATE.value,
                record_status=None,
                auto_approved=duplicate_import.status == ExternalImportStatus.IMPORTED,
                duplicate=True,
                content_hash=content_hash,
                message="Import wurde bereits mit identischem Source-Hash verarbeitet",
            )

        auto_approved = self._is_auto_approval_allowed(payload, actor_is_pim_trusted)
        record_status = RecordStatus.APPROVED if auto_approved else RecordStatus.NEEDS_REVIEW
        primary_key = self.merge.compute_primary_key(payload.doc_type, payload.data_json)

        try:
            external_import = self._reserve_external_import(payload, actor, content_hash)
        except IntegrityError:
            self.db.rollback()
            duplicate = self._find_duplicate_import(payload.source_type, payload.source_id, content_hash)
            if duplicate:
                return ExternalImportResponse(
                    import_id=duplicate.id,
                    record_id=duplicate.record_id,
                    status=ExternalImportStatus.SKIPPED_DUPLICATE.value,
                    record_status=None,
                    auto_approved=duplicate.status == ExternalImportStatus.IMPORTED,
                    duplicate=True,
                    content_hash=content_hash,
                    message="Import wurde bereits mit identischem Source-Hash verarbeitet",
                )
            raise

        try:
            existing = self._find_existing_record(schema_type, primary_key)
            if existing and self.compute_content_hash(self._strip_provenance(existing.data_json)) == content_hash:
                external_import.status = ExternalImportStatus.SKIPPED_DUPLICATE
                external_import.record_id = existing.id
                external_import.details_json = {"reason": "same_primary_key_and_content_hash"}
                self._create_audit_log(
                    "external_import_duplicate",
                    "ExternalImport",
                    external_import.id,
                    actor,
                    {"record_id": str(existing.id), "source_id": payload.source_id},
                )
                self.db.commit()
                return ExternalImportResponse(
                    import_id=external_import.id,
                    record_id=existing.id,
                    status=external_import.status.value,
                    record_status=existing.status,
                    auto_approved=existing.status == RecordStatus.APPROVED and auto_approved,
                    duplicate=True,
                    content_hash=content_hash,
                    message="Kein neuer Record: gleicher Primary Key und gleicher Inhalt",
                )

            should_create_record_evidence = True
            record_action = "created_record"

            if existing and auto_approved:
                record = self._update_existing_record(existing, payload, content_hash)
                import_status = ExternalImportStatus.UPDATED
                record_action = "updated_record"
            elif existing:
                self._create_proposed_update(existing, self._with_provenance(payload, content_hash))
                record = existing
                import_status = ExternalImportStatus.NEEDS_REVIEW
                should_create_record_evidence = False
                record_action = "proposed_update"
            else:
                record = self._create_record(payload, schema_type, primary_key, record_status, content_hash)
                import_status = ExternalImportStatus.IMPORTED if auto_approved else ExternalImportStatus.NEEDS_REVIEW
                record_action = "created_record"

            external_import.status = import_status
            external_import.record_id = record.id
            external_import.details_json = {
                "auto_approved": auto_approved,
                "record_status": record.status.value,
                "schema_type": schema_type,
                "primary_key": primary_key,
                "record_action": record_action,
            }
            if should_create_record_evidence:
                self._create_evidence(record.id, payload)
            self._create_audit_log(
                "external_import_auto_approved" if auto_approved else "external_import_needs_review",
                "Record",
                record.id,
                actor,
                {
                    "external_import_id": str(external_import.id),
                    "source_type": payload.source_type.value,
                    "source_id": payload.source_id,
                    "trust_type": payload.trust_type.value,
                    "content_hash": content_hash,
                },
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return ExternalImportResponse(
            import_id=external_import.id,
            record_id=record.id,
            status=external_import.status.value,
            record_status=record.status,
            auto_approved=auto_approved,
            duplicate=False,
            content_hash=content_hash,
            message="Record wurde automatisch genehmigt" if auto_approved else "Record wurde in die Review Queue gestellt",
            record_action=record_action,
        )

    def compute_content_hash(self, data: dict[str, Any]) -> str:
        canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _is_auto_approval_allowed(self, payload: ExternalImportRequest, actor_is_pim_trusted: bool) -> bool:
        trusted_types = TRUSTED_AUTO_APPROVAL_RULES.get(payload.source_type, set())
        return (
            actor_is_pim_trusted
            and payload.authenticated_source
            and payload.trust_type in trusted_types
        )

    def _find_duplicate_import(
        self,
        source_type: ExternalSourceType,
        source_id: str,
        content_hash: str,
    ) -> ExternalImport | None:
        return self.db.query(ExternalImport).filter(
            ExternalImport.source_type == source_type,
            ExternalImport.source_id == source_id,
            ExternalImport.content_hash == content_hash,
        ).first()

    def _find_existing_record(self, schema_type: str, primary_key: str) -> Record | None:
        return self.db.query(Record).filter(
            Record.schema_type == schema_type,
            Record.primary_key == primary_key,
        ).first()

    def _create_record(
        self,
        payload: ExternalImportRequest,
        schema_type: str,
        primary_key: str,
        status: RecordStatus,
        content_hash: str,
    ) -> Record:
        data = self._with_provenance(payload, content_hash)
        record = Record(
            document_id=None,
            department=payload.department,
            schema_type=schema_type,
            primary_key=primary_key,
            data_json=data,
            completeness_score=self.completeness.calculate_score(payload.doc_type, payload.data_json),
            status=status,
        )
        self.db.add(record)
        self.db.flush()
        return record

    def _update_existing_record(
        self,
        record: Record,
        payload: ExternalImportRequest,
        content_hash: str,
    ) -> Record:
        record.data_json = self._with_provenance(payload, content_hash)
        record.completeness_score = self.completeness.calculate_score(payload.doc_type, payload.data_json)
        record.status = RecordStatus.APPROVED
        record.version += 1
        record.updated_at = datetime.utcnow()
        self.db.flush()
        return record

    def _reserve_external_import(
        self,
        payload: ExternalImportRequest,
        actor: str,
        content_hash: str,
    ) -> ExternalImport:
        external_import = ExternalImport(
            source_type=payload.source_type,
            source_id=payload.source_id,
            source_url=str(payload.source_url) if payload.source_url else None,
            api_endpoint=payload.api_endpoint,
            trust_type=payload.trust_type,
            content_hash=content_hash,
            source_version=payload.source_version,
            authenticated_actor=actor if payload.authenticated_source else None,
            status=ExternalImportStatus.FAILED,
            record_id=None,
            details_json={"state": "reserved"},
        )
        self.db.add(external_import)
        self.db.flush()
        return external_import

    def _create_proposed_update(self, existing_record: Record, new_data: dict) -> ProposedUpdate:
        update = ProposedUpdate(
            record_id=existing_record.id,
            source_document_id=None,
            new_data_json=new_data,
            diff_json=self.merge.compute_diff(existing_record.data_json, new_data),
            status=UpdateStatus.PENDING,
        )
        self.db.add(update)
        self.db.flush()
        return update

    def _with_provenance(self, payload: ExternalImportRequest, content_hash: str) -> dict[str, Any]:
        data = dict(payload.data_json)
        data["_source"] = {
            "source_type": payload.source_type.value,
            "source_id": payload.source_id,
            "source_url": str(payload.source_url) if payload.source_url else None,
            "api_endpoint": payload.api_endpoint,
            "source_version": payload.source_version,
            "content_hash": content_hash,
            "trust_type": payload.trust_type.value,
            "authenticated_source": payload.authenticated_source,
            "imported_at": datetime.utcnow().isoformat(),
        }
        return data

    def _strip_provenance(self, data: dict[str, Any]) -> dict[str, Any]:
        clean = dict(data or {})
        clean.pop("_source", None)
        return clean

    def _create_evidence(self, record_id: UUID, payload: ExternalImportRequest):
        excerpt = payload.evidence_excerpt or str(payload.source_url or payload.api_endpoint or payload.source_id)
        evidence = Evidence(
            record_id=record_id,
            chunk_id=None,
            field_path="_source",
            excerpt=excerpt[:1000],
        )
        self.db.add(evidence)
        self.db.flush()

    def _create_audit_log(
        self,
        action: str,
        entity_type: str,
        entity_id: UUID,
        actor: str,
        details: dict[str, Any] | None = None,
    ):
        self.db.add(
            AuditLog(
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                actor=actor,
                details_json=details,
            )
        )
        self.db.flush()
