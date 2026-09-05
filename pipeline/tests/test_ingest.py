from __future__ import annotations

from typing import Any

import numpy as np

from comicomi_pipeline import config
from comicomi_pipeline.ingest import build_works, collect_items
from comicomi_pipeline.models import RakutenItem
from comicomi_pipeline.recompute import compute_similarity_rows
from comicomi_pipeline.tagger import TagRules
from tests.conftest import make_item

RULES = TagRules(genre_map={}, adult_genre_ids=("001001099",), adult_ng_words=(), keyword_rules=())


def test_build_works_flags_adult_series_and_sets_content_hash() -> None:
    items = [
        make_item("鬼滅の刃（1）", item_code="a", caption="時は大正。"),
        make_item("鬼滅の刃（2）", item_code="b", caption="二巻"),
        make_item("成人向け作品（1）", "X", item_code="c", genre_ids=["001001099001"]),
    ]
    works, tags = build_works(items, tag_rules=RULES)
    by_title = {work.title: work for work in works}
    assert not by_title["鬼滅の刃"].is_adult
    assert by_title["成人向け作品"].is_adult
    assert all(work.content_hash for work in works)
    assert tags == []  # RULES has no genre/keyword rules
    again, _ = build_works(items, tag_rules=RULES)
    assert [w.content_hash for w in again] == [w.content_hash for w in works]


class FakeClient:
    def __init__(self, pages: dict[tuple[str, int], list[RakutenItem]]) -> None:
        self.pages = pages
        self.calls: list[tuple[str, int]] = []

    def search(self, genre_id: str, page: int = 1) -> list[RakutenItem]:
        self.calls.append((genre_id, page))
        return self.pages.get((genre_id, page), [])


def test_collect_items_stops_on_short_page_and_dedupes() -> None:
    full_page = [make_item(f"作品{i}（1）", item_code=f"g1-{i}") for i in range(config.RAKUTEN_HITS_PER_PAGE)]
    client = FakeClient(
        {
            ("g1", 1): full_page,
            ("g1", 2): [full_page[0], make_item("別作品（1）", item_code="g1-x")],
            ("g2", 1): [make_item("別作品（1）", item_code="g1-x")],
        }
    )
    items = collect_items(client, ["g1", "g2"], max_pages=5)  # type: ignore[arg-type]
    assert client.calls == [("g1", 1), ("g1", 2), ("g2", 1)]
    assert len(items) == config.RAKUTEN_HITS_PER_PAGE + 1


def test_compute_similarity_rows_skips_unpublished_sources_and_candidates() -> None:
    ids = ["a", "b", "adult"]
    matrix = np.eye(3, dtype=np.float32)
    rows = compute_similarity_rows(matrix, ids, tags={}, vote_counts={}, authors={}, published={"a", "b"})
    sources = {row.from_work_id for row in rows}
    targets = {row.to_work_id for row in rows}
    assert sources == {"a", "b"}
    assert "adult" not in targets
    assert all(row.rank == 1 for row in rows)
    empty: Any = np.zeros((0, config.EMBEDDING_DIM), dtype=np.float32)
    assert compute_similarity_rows(empty, [], tags={}, vote_counts={}, authors={}, published=set()) == []
