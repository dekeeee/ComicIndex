"""Embedding text construction and multilingual-e5-small inference."""

from __future__ import annotations

import hashlib
from typing import Any, Protocol, Sequence

import numpy as np
import numpy.typing as npt

from . import config
from .models import WorkTag


class EmbeddingSource(Protocol):
    """Anything with the fields needed to build embedding text (``Work``, ``WorkRecord``)."""

    @property
    def title(self) -> str: ...

    @property
    def authors(self) -> Sequence[str]: ...

    @property
    def synopsis(self) -> str | None: ...


def build_embedding_text(work: EmbeddingSource, tags: Sequence[WorkTag | str]) -> str:
    """``passage: <title> / <authors> / <tag names> / <synopsis>`` (synopsis truncated)."""
    names = sorted({(tag.tag_name if isinstance(tag, WorkTag) else tag).strip() for tag in tags})
    names = [name for name in names if name]
    synopsis = (work.synopsis or "")[: config.SYNOPSIS_MAX_CHARS]
    fields = [
        work.title,
        config.EMBEDDING_LIST_SEPARATOR.join(work.authors),
        config.EMBEDDING_LIST_SEPARATOR.join(names),
        synopsis,
    ]
    return config.EMBEDDING_PREFIX + config.EMBEDDING_FIELD_SEPARATOR.join(fields)


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_rows(matrix: npt.NDArray[np.float32]) -> npt.NDArray[np.float32]:
    """L2-normalize each row; zero rows are left as zeros."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized: npt.NDArray[np.float32] = (matrix / norms).astype(np.float32)
    return normalized


class Embedder:
    """Lazy wrapper around ``SentenceTransformer``; the model is loaded on first use."""

    def __init__(
        self,
        model_name: str = config.EMBEDDING_MODEL_NAME,
        batch_size: int = config.EMBEDDING_BATCH_SIZE,
        *,
        model: Any | None = None,
    ) -> None:
        self._model_name = model_name
        self._batch_size = batch_size
        self._model: Any | None = model

    def _get_model(self) -> Any:
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
        return self._model

    def embed_texts(self, texts: Sequence[str]) -> npt.NDArray[np.float32]:
        """Return an ``(n, EMBEDDING_DIM)`` float32 matrix of unit vectors."""
        if not texts:
            return np.zeros((0, config.EMBEDDING_DIM), dtype=np.float32)
        raw = self._get_model().encode(
            list(texts),
            batch_size=self._batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        matrix = np.asarray(raw, dtype=np.float32)
        if matrix.ndim != 2 or matrix.shape[0] != len(texts):
            raise ValueError(f"unexpected embedding shape {matrix.shape} for {len(texts)} texts")
        return normalize_rows(matrix)
