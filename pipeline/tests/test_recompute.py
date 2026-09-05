from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

import numpy as np

from comicomi_pipeline import config
from comicomi_pipeline.embedder import Embedder
from comicomi_pipeline.models import EmbeddingRow, PendingWork, SimilarityRow, WorkRecord, WorkTag
from comicomi_pipeline.recompute import publish_pending_works, run_recompute


class FakeRepo:
    """In-memory stand-in for WorkRepository recording the call order."""

    def __init__(self, works: dict[str, dict[str, Any]]) -> None:
        self.works = works  # id -> {title, authors, synopsis, publisher, status, is_adult, content_hash}
        self.work_tags: dict[str, list[WorkTag]] = {}
        self.embeddings: dict[str, EmbeddingRow] = {}
        self.similarity: list[SimilarityRow] = []
        self.calls: list[str] = []
        self.purged_days: int | None = None

    def fetch_pending_works(self) -> list[PendingWork]:
        self.calls.append("fetch_pending_works")
        return [
            PendingWork(id=wid, title=w["title"], authors=w["authors"], synopsis=w["synopsis"], publisher=w["publisher"])
            for wid, w in self.works.items()
            if w["status"] == config.WORK_STATUS_PENDING and not w["is_adult"]
        ]

    def upsert_work_tags(self, work_ids: Mapping[str, str], tags: Sequence[WorkTag]) -> int:
        self.calls.append("upsert_work_tags")
        for tag in tags:
            self.work_tags.setdefault(work_ids[tag.work_key], []).append(tag)
        return len(tags)

    def publish_works(self, ids: list[str]) -> None:
        self.calls.append("publish_works")
        for wid in ids:
            if self.works[wid]["status"] == config.WORK_STATUS_PENDING:
                self.works[wid]["status"] = config.WORK_STATUS_PUBLISHED

    def fetch_works_needing_embedding(self, only_changed: bool = True) -> list[WorkRecord]:
        self.calls.append("fetch_works_needing_embedding")
        return [
            WorkRecord(
                id=wid,
                title=w["title"],
                authors=w["authors"],
                synopsis=w["synopsis"],
                tag_names=[t.tag_name for t in self.work_tags.get(wid, [])],
                content_hash=w["content_hash"],
            )
            for wid, w in self.works.items()
            if w["status"] == config.WORK_STATUS_PUBLISHED and not w["is_adult"]
            and not (only_changed and w["content_hash"] is not None and wid in self.embeddings
                     and w["content_hash"] == self.embeddings[wid].content_hash)
        ]

    def upsert_embeddings(self, rows: Sequence[EmbeddingRow]) -> None:
        self.calls.append("upsert_embeddings")
        for row in rows:
            self.embeddings[row.work_id] = row
            self.works[row.work_id]["content_hash"] = row.content_hash

    def fetch_all_embeddings(self) -> tuple[np.ndarray, list[str]]:
        ids = list(self.embeddings)
        if not ids:
            return np.zeros((0, config.EMBEDDING_DIM), dtype=np.float32), ids
        return np.asarray([self.embeddings[i].embedding for i in ids], dtype=np.float32), ids

    def fetch_published_work_ids(self) -> set[str]:
        return {wid for wid, w in self.works.items() if w["status"] == config.WORK_STATUS_PUBLISHED and not w["is_adult"]}

    def fetch_tags(self) -> dict[str, set[str]]:
        return {wid: {t.tag_slug for t in tags} for wid, tags in self.work_tags.items()}

    def fetch_vote_counts(self) -> dict[tuple[str, str], int]:
        return {}

    def fetch_authors(self) -> dict[str, set[str]]:
        return {wid: set(w["authors"]) for wid, w in self.works.items()}

    def replace_similarity(self, rows: Sequence[SimilarityRow], from_work_ids: Iterable[str]) -> None:
        self.calls.append("replace_similarity")
        self.similarity = list(rows)

    def purge_post_log(self, older_than_days: int = config.POST_LOG_RETENTION_DAYS) -> None:
        self.calls.append("purge_post_log")
        self.purged_days = older_than_days


class FakeModel:
    def encode(self, texts: list[str], **kwargs: object) -> np.ndarray:
        return np.asarray([[1.0, float(i)] for i, _ in enumerate(texts)], dtype=np.float32)


def make_repo() -> FakeRepo:
    return FakeRepo(
        {
            "pub": {"title": "既刊作品", "authors": ["A"], "synopsis": "学園もの", "publisher": None,
                    "status": "published", "is_adult": False, "content_hash": None},
            "pend": {"title": "異世界食堂", "authors": ["B"], "synopsis": "転生した料理人の話", "publisher": "X",
                     "status": "pending", "is_adult": False, "content_hash": None},
            "pend_adult": {"title": "成人向け", "authors": ["C"], "synopsis": "異世界", "publisher": None,
                           "status": "pending", "is_adult": True, "content_hash": None},
        }
    )


def test_publish_pending_works_tags_with_keyword_rules_and_promotes() -> None:
    repo = make_repo()
    promoted = publish_pending_works(repo)  # type: ignore[arg-type]
    assert promoted == 1
    assert repo.works["pend"]["status"] == config.WORK_STATUS_PUBLISHED
    slugs = {t.tag_slug for t in repo.work_tags["pend"]}
    assert {"isekai", "reincarnation", "gourmet"} <= slugs
    assert all(t.weight == config.KEYWORD_TAG_WEIGHT for t in repo.work_tags["pend"])  # no genre-map tags
    assert all(t.work_key == "pend" for t in repo.work_tags["pend"])
    assert repo.works["pend_adult"]["status"] == config.WORK_STATUS_PENDING
    assert "pend_adult" not in repo.work_tags
    assert repo.calls == ["fetch_pending_works", "upsert_work_tags", "publish_works"]


def test_publish_pending_works_noop_without_pending() -> None:
    repo = make_repo()
    repo.works["pend"]["status"] = "published"
    assert publish_pending_works(repo) == 0  # type: ignore[arg-type]
    assert repo.calls == ["fetch_pending_works"]


def test_run_recompute_promotes_before_embedding_and_excludes_adult() -> None:
    repo = make_repo()
    summary = run_recompute(repo=repo, embedder=Embedder(model=FakeModel()))  # type: ignore[arg-type]
    assert summary.promoted == 1
    assert summary.embedded == 2  # the pre-existing published work + the promoted one
    assert set(repo.embeddings) == {"pub", "pend"}
    assert repo.calls.index("publish_works") < repo.calls.index("fetch_works_needing_embedding")
    assert repo.calls.index("fetch_works_needing_embedding") < repo.calls.index("upsert_embeddings")
    assert repo.calls[-1] == "purge_post_log"
    assert repo.purged_days == config.POST_LOG_RETENTION_DAYS == 2
    assert {row.from_work_id for row in repo.similarity} == {"pub", "pend"}
    assert "pend_adult" not in {row.to_work_id for row in repo.similarity}
    assert repo.works["pend_adult"]["status"] == config.WORK_STATUS_PENDING
    # second run: nothing pending, nothing changed
    second = run_recompute(repo=repo, embedder=Embedder(model=FakeModel()))  # type: ignore[arg-type]
    assert second.promoted == 0
    assert second.embedded == 0
