"""F-03: embed changed works, then recompute ``work_similarity`` for all published works."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import AbstractSet, Mapping, Sequence

import numpy as np
import numpy.typing as npt

from . import config
from .config import Settings
from .embedder import Embedder, build_embedding_text, content_hash
from .models import EmbeddingRow, SimilarityRow, WorkTag
from .repository import WorkRepository
from .similarity import top_k_similar
from .tagger import TagRules, tags_for_text

logger = logging.getLogger(__name__)


@dataclass
class RecomputeSummary:
    promoted: int
    embedded: int
    works_scored: int
    similarity_rows: int


def publish_pending_works(repo: WorkRepository, rules: TagRules | None = None) -> int:
    """Tag user-registered (pending, non-adult) works with keyword rules only
    (no genre ids are stored for them) and promote them to ``published``.
    Returns the number of promoted works.
    """
    pending = repo.fetch_pending_works()
    if not pending:
        return 0
    tags: list[WorkTag] = []
    for work in pending:
        tags.extend(tags_for_text(work.id, work.title, work.synopsis, genre_ids=[], rules=rules))
    ids = [work.id for work in pending]
    repo.upsert_work_tags({work_id: work_id for work_id in ids}, tags)
    repo.publish_works(ids)
    logger.info("promoted %d pending works to published (%d keyword tags)", len(ids), len(tags))
    return len(ids)


def compute_similarity_rows(
    embeddings: npt.NDArray[np.float32],
    id_index: Sequence[str],
    tags: Mapping[str, AbstractSet[str]],
    vote_counts: Mapping[tuple[str, str], int],
    authors: Mapping[str, AbstractSet[str]],
    published: AbstractSet[str],
) -> list[SimilarityRow]:
    """Top-k rows for every published work that has an embedding.

    Works without ``published`` membership (adult / pending / rejected) are
    excluded both as sources and as candidates.
    """
    row_index = {work_id: i for i, work_id in enumerate(id_index)}
    exclude = {work_id for work_id in id_index if work_id not in published}
    rows: list[SimilarityRow] = []
    for work_id in id_index:
        if work_id in exclude:
            continue
        rows.extend(
            top_k_similar(work_id, embeddings, id_index, tags, vote_counts, authors, exclude, row_index=row_index)
        )
    return rows


def run_recompute(
    only_changed: bool = True,
    *,
    repo: WorkRepository | None = None,
    embedder: Embedder | None = None,
    settings: Settings | None = None,
) -> RecomputeSummary:
    repo = repo or WorkRepository.from_settings(settings or Settings())
    embedder = embedder or Embedder()

    promoted = publish_pending_works(repo)

    targets = repo.fetch_works_needing_embedding(only_changed=only_changed)
    logger.info("%d works need embedding (only_changed=%s)", len(targets), only_changed)
    if targets:
        texts = [build_embedding_text(record, record.tag_names) for record in targets]
        vectors = embedder.embed_texts(texts)
        repo.upsert_embeddings(
            [
                EmbeddingRow(work_id=record.id, embedding=vector.tolist(), content_hash=content_hash(text))
                for record, text, vector in zip(targets, texts, vectors)
            ]
        )

    embeddings, id_index = repo.fetch_all_embeddings()
    published = repo.fetch_published_work_ids()
    rows = compute_similarity_rows(
        embeddings,
        id_index,
        repo.fetch_tags(),
        repo.fetch_vote_counts(),
        repo.fetch_authors(),
        published,
    )
    scored_ids = sorted({row.from_work_id for row in rows})
    repo.replace_similarity(rows, scored_ids)
    repo.purge_post_log(older_than_days=config.POST_LOG_RETENTION_DAYS)
    logger.info(
        "recompute done: %d promoted, %d embedded, %d works scored, %d rows",
        promoted,
        len(targets),
        len(scored_ids),
        len(rows),
    )
    return RecomputeSummary(
        promoted=promoted,
        embedded=len(targets),
        works_scored=len(scored_ids),
        similarity_rows=len(rows),
    )
