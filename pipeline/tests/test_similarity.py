from __future__ import annotations

import math

import numpy as np
import pytest

from comicomi_pipeline import config
from comicomi_pipeline.similarity import (
    compose_score,
    cosine_norm,
    tag_jaccard,
    top_k_similar,
    vote_norm,
    vote_pair_key,
)

W = config.SIMILARITY_WEIGHTS


def test_compose_score_known_value() -> None:
    # cos 0.5 -> 0.75, jaccard 0.5, votes 3 of max 7
    expected = W["embed"] * 0.75 + W["tag"] * 0.5 + W["vote"] * (math.log1p(3) / math.log1p(7))
    assert compose_score(0.5, 0.5, 3, 7, same_author=False) == pytest.approx(expected)


def test_compose_score_same_author_penalty() -> None:
    base = compose_score(0.5, 0.5, 3, 7, same_author=False)
    assert compose_score(0.5, 0.5, 3, 7, same_author=True) == pytest.approx(base - config.SAME_AUTHOR_PENALTY)


def test_compose_score_zero_votes_uses_embed_and_tag_only() -> None:
    assert compose_score(1.0, 1.0, 0, 0, same_author=False) == pytest.approx(W["embed"] + W["tag"])
    assert compose_score(1.0, 1.0, 0, 5, same_author=False) == pytest.approx(W["embed"] + W["tag"])


def test_cosine_norm_clamps() -> None:
    assert cosine_norm(-1.0) == 0.0
    assert cosine_norm(1.0) == 1.0
    assert cosine_norm(0.0) == 0.5
    assert cosine_norm(1.5) == 1.0
    assert cosine_norm(-2.0) == 0.0


def test_vote_norm_edges() -> None:
    assert vote_norm(0, 0) == 0.0
    assert vote_norm(5, 0) == 0.0
    assert vote_norm(7, 7) == pytest.approx(1.0)
    assert 0.0 < vote_norm(1, 7) < 1.0


def test_tag_jaccard_edge_cases() -> None:
    assert tag_jaccard(set(), set()) == 0.0
    assert tag_jaccard({"a"}, set()) == 0.0
    assert tag_jaccard({"a", "b"}, {"a", "b"}) == 1.0
    assert tag_jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


def test_vote_pair_key_is_direction_agnostic() -> None:
    assert vote_pair_key("b", "a") == vote_pair_key("a", "b") == ("a", "b")


def _unit(vector: list[float]) -> list[float]:
    array = np.asarray(vector, dtype=np.float32)
    return list(array / np.linalg.norm(array))


@pytest.fixture
def dataset() -> tuple[np.ndarray, list[str]]:
    ids = ["w1", "w2", "w3", "w4", "adult"]
    matrix = np.asarray(
        [
            _unit([1.0, 0.0, 0.0]),
            _unit([0.9, 0.1, 0.0]),  # closest to w1
            _unit([0.0, 1.0, 0.0]),
            _unit([0.0, 0.0, 1.0]),
            _unit([1.0, 0.0, 0.0]),  # identical to w1 but excluded
        ],
        dtype=np.float32,
    )
    return matrix, ids


def test_top_k_excludes_self_and_excluded_ids(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    rows = top_k_similar("w1", matrix, ids, tags={}, vote_counts={}, authors={}, exclude={"adult"})
    targets = [row.to_work_id for row in rows]
    assert "w1" not in targets
    assert "adult" not in targets
    assert targets[0] == "w2"
    assert [row.rank for row in rows] == [1, 2, 3]
    assert all(row.from_work_id == "w1" for row in rows)


def test_top_k_ranks_without_votes(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    rows = top_k_similar("w1", matrix, ids, tags={"w1": {"x"}, "w3": {"x"}}, vote_counts={}, authors={}, exclude=set(), k=2)
    assert len(rows) == 2
    assert rows[0].score > rows[1].score
    assert all(row.score_vote == 0.0 for row in rows)


def test_top_k_votes_can_promote_a_candidate(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    votes = {vote_pair_key("w4", "w1"): 10}
    rows = top_k_similar("w1", matrix, ids, tags={}, vote_counts=votes, authors={}, exclude={"adult"})
    assert rows[0].to_work_id == "w4"
    assert rows[0].score_vote == pytest.approx(1.0)


def test_top_k_same_author_penalty(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    authors = {"w1": {"author a"}, "w2": {"author a"}, "w3": {"author b"}}
    without = top_k_similar("w1", matrix, ids, tags={}, vote_counts={}, authors={}, exclude={"adult"})
    with_penalty = top_k_similar("w1", matrix, ids, tags={}, vote_counts={}, authors=authors, exclude={"adult"})
    score_without = next(row.score for row in without if row.to_work_id == "w2")
    score_with = next(row.score for row in with_penalty if row.to_work_id == "w2")
    assert score_with == pytest.approx(score_without - config.SAME_AUTHOR_PENALTY)


def test_top_k_unknown_work_returns_empty(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    assert top_k_similar("missing", matrix, ids, tags={}, vote_counts={}, authors={}, exclude=set()) == []


def test_top_k_respects_limit(dataset: tuple[np.ndarray, list[str]]) -> None:
    matrix, ids = dataset
    assert len(top_k_similar("w1", matrix, ids, tags={}, vote_counts={}, authors={}, exclude=set(), k=1)) == 1
