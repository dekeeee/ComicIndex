"""Internal data types for the pipeline (docs/comicomi-data-design.md section 6).

External API payloads are converted into these types before any processing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class RakutenItem:
    """One Rakuten Books item (usually a single volume)."""

    item_code: str
    title: str
    title_kana: str | None
    author: str
    publisher: str | None
    caption: str | None
    image_url: str | None
    sales_date: str | None
    isbn: str | None
    affiliate_url: str
    genre_ids: list[str]


@dataclass
class Volume:
    rakuten_item_code: str
    work_key: str
    volume_no: int | None
    title_raw: str
    isbn: str | None
    sales_date: date | None
    affiliate_url: str


@dataclass
class Work:
    """A series (one row of ``works``) grouped from one or more volumes."""

    rakuten_series_key: str
    slug: str
    title: str
    title_kana: str | None
    authors: list[str]
    publisher: str | None
    synopsis: str | None
    cover_url: str | None
    first_sales_date: date | None
    volume_count: int
    affiliate_url_rakuten: str
    is_adult: bool
    series_confidence: float
    volumes: list[Volume]
    genre_ids: list[str] = field(default_factory=list)
    content_hash: str | None = None
    affiliate_url_amazon: str | None = None


@dataclass(frozen=True)
class Tag:
    slug: str
    name: str
    category: str


@dataclass
class WorkTag:
    work_key: str
    tag_slug: str
    category: str
    weight: float
    tag_name: str = ""


@dataclass
class SimilarityRow:
    from_work_id: str
    to_work_id: str
    rank: int
    score: float
    score_embed: float
    score_tag: float
    score_vote: float


@dataclass
class WorkRecord:
    """A ``works`` row as read back from the database (for embedding)."""

    id: str
    title: str
    authors: list[str]
    synopsis: str | None
    tag_names: list[str]
    content_hash: str | None


@dataclass
class PendingWork:
    """A user-registered ``works`` row (``status = pending``) awaiting tagging/publishing."""

    id: str
    title: str
    authors: list[str]
    synopsis: str | None
    publisher: str | None


@dataclass
class EmbeddingRow:
    work_id: str
    embedding: list[float]
    content_hash: str
