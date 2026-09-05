"""Similarity score composition and top-k extraction (F-03)."""

from __future__ import annotations

import math
from typing import AbstractSet, Mapping, Sequence

import numpy as np
import numpy.typing as npt

from . import config
from .models import SimilarityRow


def tag_jaccard(a: AbstractSet[str], b: AbstractSet[str]) -> float:
    union = len(a | b)
    if union == 0:
        return 0.0
    return len(a & b) / union


def cosine_norm(cos: float) -> float:
    """Map cosine similarity from [-1, 1] to [0, 1], clamped."""
    return min(1.0, max(0.0, (cos + 1.0) / 2.0))


def vote_norm(votes: int, max_votes: int) -> float:
    if max_votes <= 0 or votes <= 0:
        return 0.0
    return min(1.0, math.log1p(votes) / math.log1p(max_votes))


def score_components(
    cos: float,
    jaccard: float,
    votes: int,
    max_votes: int,
    same_author: bool,
) -> tuple[float, float, float, float]:
    """Return ``(score, cos_norm, jaccard, vote_norm)``."""
    embed_part = cosine_norm(cos)
    vote_part = vote_norm(votes, max_votes)
    weights = config.SIMILARITY_WEIGHTS
    score = weights["embed"] * embed_part + weights["tag"] * jaccard + weights["vote"] * vote_part
    if same_author:
        score -= config.SAME_AUTHOR_PENALTY
    return score, embed_part, jaccard, vote_part


def compose_score(cos: float, jaccard: float, votes: int, max_votes: int, same_author: bool) -> float:
    return score_components(cos, jaccard, votes, max_votes, same_author)[0]


def vote_pair_key(a: str, b: str) -> tuple[str, str]:
    """Direction-agnostic key for vote counts."""
    return (a, b) if a <= b else (b, a)


def top_k_similar(
    work_id: str,
    embeddings: npt.NDArray[np.float32],
    id_index: Sequence[str],
    tags: Mapping[str, AbstractSet[str]],
    vote_counts: Mapping[tuple[str, str], int],
    authors: Mapping[str, AbstractSet[str]],
    exclude: AbstractSet[str],
    k: int = config.TOP_K,
    row_index: Mapping[str, int] | None = None,
) -> list[SimilarityRow]:
    """Top-``k`` candidates for ``work_id`` by composed score.

    ``embeddings`` rows correspond to ``id_index``; both must be unit vectors.
    ``vote_counts`` is keyed by :func:`vote_pair_key`. ``exclude`` lists ids that
    must never appear as candidates (adult / unpublished works).
    """
    rows = row_index if row_index is not None else {wid: i for i, wid in enumerate(id_index)}
    source_row = rows.get(work_id)
    if source_row is None:
        return []
    cosines = embeddings @ embeddings[source_row]
    max_votes = max(vote_counts.values(), default=0)
    own_tags = tags.get(work_id, frozenset())
    own_authors = authors.get(work_id, frozenset())
    empty: frozenset[str] = frozenset()

    scored: list[SimilarityRow] = []
    for candidate, row in rows.items():
        if candidate == work_id or candidate in exclude:
            continue
        votes = vote_counts.get(vote_pair_key(work_id, candidate), 0)
        same_author = bool(own_authors & authors.get(candidate, empty))
        score, embed_part, tag_part, vote_part = score_components(
            float(cosines[row]),
            tag_jaccard(own_tags, tags.get(candidate, empty)),
            votes,
            max_votes,
            same_author,
        )
        scored.append(
            SimilarityRow(
                from_work_id=work_id,
                to_work_id=candidate,
                rank=0,
                score=score,
                score_embed=embed_part,
                score_tag=tag_part,
                score_vote=vote_part,
            )
        )

    scored.sort(key=lambda row: (-row.score, row.to_work_id))
    top = scored[:k]
    for position, entry in enumerate(top, start=1):
        entry.rank = position
    return top
