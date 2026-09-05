"""Supabase access for the pipeline. All table/column knowledge lives here."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Callable, Iterable, Iterator, Mapping, Sequence, TypeVar

import numpy as np
import numpy.typing as npt

from . import config
from .config import Settings
from .models import EmbeddingRow, PendingWork, SimilarityRow, Work, WorkRecord, WorkTag
from .series_grouper import normalize_author
from .similarity import vote_pair_key

if TYPE_CHECKING:
    from supabase import Client

logger = logging.getLogger(__name__)

T = TypeVar("T")

QueryModifier = Callable[[Any], Any]


def _chunks(items: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows(result: Any) -> list[dict[str, Any]]:
    """Rows of a PostgREST response as plain dicts."""
    data = getattr(result, "data", None) or []
    return [row for row in data if isinstance(row, dict)]


def _parse_vector(value: Any) -> list[float]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list):
        raise ValueError(f"unexpected embedding value: {type(value).__name__}")
    return [float(v) for v in value]


def _work_row(work: Work) -> dict[str, Any]:
    return {
        "slug": work.slug,
        "rakuten_series_key": work.rakuten_series_key,
        "title": work.title,
        "title_kana": work.title_kana,
        "authors": work.authors,
        "publisher": work.publisher,
        "synopsis": work.synopsis,
        "cover_url": work.cover_url,
        "first_sales_date": work.first_sales_date.isoformat() if work.first_sales_date else None,
        "volume_count": work.volume_count,
        "affiliate_url_rakuten": work.affiliate_url_rakuten,
        "affiliate_url_amazon": work.affiliate_url_amazon,
        "is_adult": work.is_adult,
        "series_confidence": work.series_confidence,
        "content_hash": work.content_hash,
        "updated_at": _now_iso(),
    }


class WorkRepository:
    """Reads and writes pipeline tables through supabase-py (service role)."""

    def __init__(self, client: Client) -> None:
        self._client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> "WorkRepository":
        settings.require("supabase_url", "supabase_service_role_key")
        from supabase import create_client  # imported lazily so unit tests do not need supabase-py

        return cls(create_client(settings.supabase_url, settings.supabase_service_role_key))

    # --- generic helpers ------------------------------------------------

    def _fetch_all(self, table: str, columns: str, modify: QueryModifier | None = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            query = self._client.table(table).select(columns)
            if modify is not None:
                query = modify(query)
            result = query.range(start, start + config.SUPABASE_PAGE_SIZE - 1).execute()
            batch = _rows(result)
            rows.extend(batch)
            if len(batch) < config.SUPABASE_PAGE_SIZE:
                return rows
            start += config.SUPABASE_PAGE_SIZE

    def _published_filter(self, query: Any) -> Any:
        return query.eq("status", config.WORK_STATUS_PUBLISHED).eq("is_adult", False)

    # --- ingest (F-01 / F-02) ------------------------------------------

    def upsert_works(self, works: Sequence[Work]) -> dict[str, str]:
        """Upsert ``works`` (on ``rakuten_series_key``) and ``work_volumes``.

        Returns ``{rakuten_series_key: work_id}``. ``status`` is not part of the
        payload so rejected works stay rejected; pending works are promoted.
        """
        if not works:
            return {}
        for chunk in _chunks([_work_row(work) for work in works], config.SUPABASE_INSERT_CHUNK):
            self._client.table("works").upsert(list(chunk), on_conflict="rakuten_series_key").execute()
        keys = [work.rakuten_series_key for work in works]
        for key_chunk in _chunks(keys, config.SUPABASE_FILTER_CHUNK):
            (
                self._client.table("works")
                .update({"status": config.WORK_STATUS_PUBLISHED})
                .in_("rakuten_series_key", list(key_chunk))
                .eq("status", config.WORK_STATUS_PENDING)
                .execute()
            )
        ids = self._fetch_ids_by_series_key(keys)

        volume_rows: list[dict[str, Any]] = []
        for work in works:
            work_id = ids.get(work.rakuten_series_key)
            if work_id is None:
                logger.warning("work %s was not returned after upsert", work.rakuten_series_key)
                continue
            for volume in work.volumes:
                volume_rows.append(
                    {
                        "rakuten_item_code": volume.rakuten_item_code,
                        "work_id": work_id,
                        "volume_no": volume.volume_no,
                        "title_raw": volume.title_raw,
                        "isbn": volume.isbn,
                        "sales_date": volume.sales_date.isoformat() if volume.sales_date else None,
                        "affiliate_url": volume.affiliate_url,
                    }
                )
        for chunk in _chunks(volume_rows, config.SUPABASE_INSERT_CHUNK):
            self._client.table("work_volumes").upsert(list(chunk), on_conflict="rakuten_item_code").execute()
        logger.info("upserted %d works / %d volumes", len(ids), len(volume_rows))
        return ids

    def _fetch_ids_by_series_key(self, keys: Sequence[str]) -> dict[str, str]:
        ids: dict[str, str] = {}
        for chunk in _chunks(keys, config.SUPABASE_FILTER_CHUNK):
            result = (
                self._client.table("works")
                .select("id, rakuten_series_key")
                .in_("rakuten_series_key", list(chunk))
                .execute()
            )
            for row in _rows(result):
                ids[str(row["rakuten_series_key"])] = str(row["id"])
        return ids

    def upsert_work_tags(self, work_ids: Mapping[str, str], tags: Sequence[WorkTag]) -> int:
        """Upsert ``tags`` on ``(name, category)`` then ``work_tags``.

        Existing ``work_tags`` rows are left untouched (``ON CONFLICT DO NOTHING``)
        so manually confirmed weights survive re-ingest. Returns the number of
        ``work_tags`` rows sent.
        """
        if not tags:
            return 0
        tag_defs: dict[tuple[str, str], dict[str, str]] = {}
        for tag in tags:
            tag_defs.setdefault(
                (tag.tag_name, tag.category),
                {"slug": tag.tag_slug, "name": tag.tag_name, "category": tag.category},
            )
        for chunk in _chunks(list(tag_defs.values()), config.SUPABASE_INSERT_CHUNK):
            self._client.table("tags").upsert(list(chunk), on_conflict="name,category").execute()

        tag_ids: dict[str, int] = {}
        slugs = sorted({tag.tag_slug for tag in tags})
        for slug_chunk in _chunks(slugs, config.SUPABASE_FILTER_CHUNK):
            result = self._client.table("tags").select("id, slug").in_("slug", list(slug_chunk)).execute()
            for row in _rows(result):
                tag_ids[str(row["slug"])] = int(row["id"])

        rows: list[dict[str, Any]] = []
        for tag in tags:
            work_id = work_ids.get(tag.work_key)
            tag_id = tag_ids.get(tag.tag_slug)
            if work_id is None or tag_id is None:
                logger.warning("skipping tag %s for unknown work/tag (%s)", tag.tag_slug, tag.work_key)
                continue
            rows.append({"work_id": work_id, "tag_id": tag_id, "weight": tag.weight})
        for chunk in _chunks(rows, config.SUPABASE_INSERT_CHUNK):
            (
                self._client.table("work_tags")
                .upsert(list(chunk), on_conflict="work_id,tag_id", ignore_duplicates=True)
                .execute()
            )
        return len(rows)

    # --- pending works (registered via register-work) --------------------

    def fetch_pending_works(self) -> list[PendingWork]:
        """Non-adult works with ``status = pending`` (user registrations)."""
        rows = self._fetch_all(
            "works",
            "id, title, authors, synopsis, publisher",
            lambda query: query.eq("status", config.WORK_STATUS_PENDING).eq("is_adult", False),
        )
        return [
            PendingWork(
                id=str(row["id"]),
                title=str(row.get("title") or ""),
                authors=[str(a) for a in row.get("authors") or []],
                synopsis=row.get("synopsis"),
                publisher=row.get("publisher"),
            )
            for row in rows
        ]

    def publish_works(self, ids: list[str]) -> None:
        """Set ``status = published`` for the given ids that are currently ``pending``."""
        for chunk in _chunks(ids, config.SUPABASE_FILTER_CHUNK):
            (
                self._client.table("works")
                .update({"status": config.WORK_STATUS_PUBLISHED, "updated_at": _now_iso()})
                .in_("id", list(chunk))
                .eq("status", config.WORK_STATUS_PENDING)
                .execute()
            )

    # --- recompute (F-03) ----------------------------------------------

    def _fetch_tag_names_by_work(self) -> dict[str, list[str]]:
        names: dict[str, list[str]] = {}
        for row in self._fetch_all("work_tags", "work_id, tags(name)"):
            tag = row.get("tags") or {}
            name = tag.get("name") if isinstance(tag, Mapping) else None
            if name:
                names.setdefault(str(row["work_id"]), []).append(str(name))
        return names

    def fetch_works_needing_embedding(self, only_changed: bool = True) -> list[WorkRecord]:
        """Published, non-adult works whose ``content_hash`` differs from the
        stored embedding hash (or all of them when ``only_changed`` is False).
        """
        works = self._fetch_all("works", "id, title, authors, synopsis, content_hash", self._published_filter)
        embedded = {
            str(row["work_id"]): row.get("content_hash")
            for row in self._fetch_all("work_embeddings", "work_id, content_hash")
        }
        tag_names = self._fetch_tag_names_by_work()
        records: list[WorkRecord] = []
        for row in works:
            work_id = str(row["id"])
            current_hash = row.get("content_hash")
            if only_changed and current_hash is not None and current_hash == embedded.get(work_id):
                continue
            records.append(
                WorkRecord(
                    id=work_id,
                    title=str(row.get("title") or ""),
                    authors=[str(a) for a in row.get("authors") or []],
                    synopsis=row.get("synopsis"),
                    tag_names=tag_names.get(work_id, []),
                    content_hash=current_hash,
                )
            )
        return records

    def upsert_embeddings(self, rows: Sequence[EmbeddingRow]) -> None:
        if not rows:
            return
        payload: list[dict[str, Any]] = [
            {
                "work_id": row.work_id,
                "embedding": row.embedding,
                "content_hash": row.content_hash,
                "updated_at": _now_iso(),
            }
            for row in rows
        ]
        for chunk in _chunks(payload, config.SUPABASE_INSERT_CHUNK):
            self._client.table("work_embeddings").upsert(list(chunk), on_conflict="work_id").execute()
        for row in rows:
            self._client.table("works").update({"content_hash": row.content_hash}).eq("id", row.work_id).execute()
        logger.info("upserted %d embeddings", len(rows))

    def fetch_all_embeddings(self) -> tuple[npt.NDArray[np.float32], list[str]]:
        rows = self._fetch_all("work_embeddings", "work_id, embedding")
        ids = [str(row["work_id"]) for row in rows]
        if not rows:
            return np.zeros((0, config.EMBEDDING_DIM), dtype=np.float32), ids
        matrix = np.asarray([_parse_vector(row["embedding"]) for row in rows], dtype=np.float32)
        return matrix, ids

    def fetch_tags(self) -> dict[str, set[str]]:
        tags: dict[str, set[str]] = {}
        for row in self._fetch_all("work_tags", "work_id, tags(slug)"):
            tag = row.get("tags") or {}
            slug = tag.get("slug") if isinstance(tag, Mapping) else None
            if slug:
                tags.setdefault(str(row["work_id"]), set()).add(str(slug))
        return tags

    def fetch_authors(self) -> dict[str, set[str]]:
        authors: dict[str, set[str]] = {}
        for row in self._fetch_all("works", "id, authors"):
            names = {normalize_author(str(a)) for a in row.get("authors") or []}
            authors[str(row["id"])] = {name for name in names if name}
        return authors

    def fetch_vote_counts(self) -> dict[tuple[str, str], int]:
        counts: dict[tuple[str, str], int] = {}
        for row in self._fetch_all("similar_vote_counts", "a, b, votes"):
            key = vote_pair_key(str(row["a"]), str(row["b"]))
            counts[key] = counts.get(key, 0) + int(row.get("votes") or 0)
        return counts

    def fetch_published_work_ids(self) -> set[str]:
        return {str(row["id"]) for row in self._fetch_all("works", "id", self._published_filter)}

    def replace_similarity(self, rows: Sequence[SimilarityRow], from_work_ids: Iterable[str]) -> None:
        """Delete existing rows for ``from_work_ids`` and insert ``rows`` in chunks."""
        ids = sorted(set(from_work_ids))
        for chunk in _chunks(ids, config.SUPABASE_FILTER_CHUNK):
            self._client.table("work_similarity").delete().in_("from_work_id", list(chunk)).execute()
        payload: list[dict[str, Any]] = [
            {
                "from_work_id": row.from_work_id,
                "to_work_id": row.to_work_id,
                "rank": row.rank,
                "score": row.score,
                "score_embed": row.score_embed,
                "score_tag": row.score_tag,
                "score_vote": row.score_vote,
            }
            for row in rows
        ]
        for row_chunk in _chunks(payload, config.SUPABASE_INSERT_CHUNK):
            self._client.table("work_similarity").insert(list(row_chunk)).execute()
        logger.info("replaced similarity for %d works (%d rows)", len(ids), len(payload))

    # --- housekeeping ----------------------------------------------------

    def purge_post_log(self, older_than_days: int = config.POST_LOG_RETENTION_DAYS) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        self._client.table("post_log").delete().lt("created_at", cutoff.isoformat()).execute()
        logger.info("purged post_log rows older than %s", cutoff.date().isoformat())
