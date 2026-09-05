from __future__ import annotations

import hashlib

import numpy as np

from comicomi_pipeline import config
from comicomi_pipeline.embedder import Embedder, build_embedding_text, content_hash, normalize_rows
from comicomi_pipeline.models import Work, WorkRecord, WorkTag


def make_work(synopsis: str | None) -> Work:
    return Work(
        rakuten_series_key="k",
        slug="w-0",
        title="鬼滅の刃",
        title_kana=None,
        authors=["吾峠呼世晴"],
        publisher=None,
        synopsis=synopsis,
        cover_url=None,
        first_sales_date=None,
        volume_count=1,
        affiliate_url_rakuten="u",
        is_adult=False,
        series_confidence=1.0,
        volumes=[],
    )


def test_build_embedding_text_format_and_truncation() -> None:
    tags = [WorkTag("k", "shonen", "genre", 1.0, "少年"), WorkTag("k", "battle", "theme", 0.6, "バトル")]
    text = build_embedding_text(make_work("あ" * 2000), tags)
    assert text.startswith(config.EMBEDDING_PREFIX + "鬼滅の刃 / 吾峠呼世晴 / ")
    assert "バトル, 少年" in text or "少年, バトル" in text
    assert text.endswith("あ" * config.SYNOPSIS_MAX_CHARS)
    assert len(text) < len(config.EMBEDDING_PREFIX) + 2000


def test_build_embedding_text_is_same_for_work_and_record() -> None:
    tags = [WorkTag("k", "shonen", "genre", 1.0, "少年")]
    record = WorkRecord(id="1", title="鬼滅の刃", authors=["吾峠呼世晴"], synopsis="時は大正。", tag_names=["少年"], content_hash=None)
    assert build_embedding_text(make_work("時は大正。"), tags) == build_embedding_text(record, record.tag_names)
    assert build_embedding_text(make_work(None), []) == config.EMBEDDING_PREFIX + "鬼滅の刃 / 吾峠呼世晴 /  / "


def test_content_hash_is_sha256_hex() -> None:
    assert content_hash("abc") == hashlib.sha256(b"abc").hexdigest()
    assert content_hash("a") != content_hash("b")


class FakeModel:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def encode(self, texts: list[str], **kwargs: object) -> np.ndarray:
        self.calls.append({"n": len(texts), **kwargs})
        return np.asarray([[float(len(t)), 1.0, 0.0] for t in texts], dtype=np.float64)


def test_embedder_returns_normalized_float32_without_loading_model() -> None:
    model = FakeModel()
    embedder = Embedder(model=model)
    matrix = embedder.embed_texts(["a", "abc"])
    assert matrix.dtype == np.float32
    assert matrix.shape == (2, 3)
    assert np.allclose(np.linalg.norm(matrix, axis=1), 1.0)
    assert model.calls[0]["batch_size"] == config.EMBEDDING_BATCH_SIZE
    assert embedder.embed_texts([]).shape == (0, config.EMBEDDING_DIM)


def test_normalize_rows_keeps_zero_rows() -> None:
    out = normalize_rows(np.asarray([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
    assert np.allclose(out, [[0.0, 0.0], [0.6, 0.8]])
    assert out.dtype == np.float32
