"""F-01 / F-02: fetch Rakuten Books items, group into works, tag, and upsert."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Sequence

from . import config
from .adult_filter import is_adult
from .amazon_link import build_amazon_url, representative_isbn
from .config import Settings
from .embedder import build_embedding_text, content_hash
from .models import RakutenItem, Work, WorkTag
from .rakuten_client import RakutenClient
from .repository import WorkRepository
from .series_grouper import SeriesRules, group_volumes, series_key
from .tagger import TagRules, tags_for_work

logger = logging.getLogger(__name__)


@dataclass
class IngestSummary:
    items_fetched: int
    works: int
    adult_works: int
    tags: int


def collect_items(client: RakutenClient, genre_ids: Sequence[str], max_pages: int) -> list[RakutenItem]:
    """Page through each genre (stopping early on an empty/short page), de-duplicated by item code."""
    items: list[RakutenItem] = []
    seen: set[str] = set()
    for genre_id in genre_ids:
        for page in range(1, max_pages + 1):
            page_items = client.search(genre_id, page)
            logger.info("genre %s page %d: %d items", genre_id, page, len(page_items))
            for item in page_items:
                if item.item_code and item.item_code not in seen:
                    seen.add(item.item_code)
                    items.append(item)
            if len(page_items) < config.RAKUTEN_HITS_PER_PAGE:
                break
    return items


def build_works(
    items: Sequence[RakutenItem],
    series_rules: SeriesRules | None = None,
    tag_rules: TagRules | None = None,
    amazon_tag: str | None = None,
) -> tuple[list[Work], list[WorkTag]]:
    """Pure step: group volumes, flag adult series, tag, set ``content_hash`` and the Amazon link."""
    adult_keys = {series_key(item, series_rules) for item in items if is_adult(item, tag_rules)}
    works = group_volumes(items, series_rules)
    all_tags: list[WorkTag] = []
    for work in works:
        work.is_adult = work.rakuten_series_key in adult_keys
        tags = tags_for_work(work, tag_rules)
        work.content_hash = content_hash(build_embedding_text(work, tags))
        work.affiliate_url_amazon = build_amazon_url(representative_isbn(work), amazon_tag)
        all_tags.extend(tags)
    return works, all_tags


def run_ingest(
    genre_ids: Sequence[str],
    max_pages: int,
    *,
    client: RakutenClient | None = None,
    repo: WorkRepository | None = None,
    settings: Settings | None = None,
) -> IngestSummary:
    settings = settings or Settings()
    if client is None:
        settings.require("rakuten_app_id", "rakuten_affiliate_id")
        client = RakutenClient(settings.rakuten_app_id, settings.rakuten_affiliate_id)
    repo = repo or WorkRepository.from_settings(settings)

    items = collect_items(client, genre_ids, max_pages)
    logger.info("fetched %d items from %d genres", len(items), len(genre_ids))
    works, tags = build_works(items, amazon_tag=settings.amazon_associate_tag or None)
    adult_count = sum(1 for work in works if work.is_adult)
    logger.info("grouped into %d works (%d adult)", len(works), adult_count)

    ids = repo.upsert_works(works)
    tag_rows = repo.upsert_work_tags(ids, tags)
    logger.info("ingest done: %d works, %d work_tags", len(ids), tag_rows)
    return IngestSummary(items_fetched=len(items), works=len(works), adult_works=adult_count, tags=tag_rows)
