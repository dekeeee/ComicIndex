"""Settings (environment) and constants for the comicomi pipeline.

This module is the only place for magic numbers in the pipeline package.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Final

from pydantic_settings import BaseSettings, SettingsConfigDict

# --- paths -----------------------------------------------------------------

PACKAGE_DIR: Final[Path] = Path(__file__).resolve().parent
REPO_ROOT: Final[Path] = PACKAGE_DIR.parent.parent
DEFAULT_SHARED_DIR: Final[Path] = REPO_ROOT / "shared"
SHARED_DIR_ENV: Final[str] = "COMICOMI_SHARED_DIR"
SERIES_RULES_FILENAME: Final[str] = "series-rules.json"
TAG_RULES_PATH: Final[Path] = PACKAGE_DIR / "tag_rules.yaml"
ENV_FILES: Final[tuple[Path, ...]] = (REPO_ROOT / ".env", PACKAGE_DIR.parent / ".env")


def shared_dir() -> Path:
    """Directory holding the shared JSON rule files (overridable via env)."""
    override = os.environ.get(SHARED_DIR_ENV)
    return Path(override) if override else DEFAULT_SHARED_DIR


def series_rules_path() -> Path:
    return shared_dir() / SERIES_RULES_FILENAME


# --- similarity (F-03) -----------------------------------------------------

SIMILARITY_WEIGHTS: Final[dict[str, float]] = {"embed": 0.5, "tag": 0.2, "vote": 0.3}
SAME_AUTHOR_PENALTY: Final[float] = 0.1
TOP_K: Final[int] = 20

# --- embedding (F-03) ------------------------------------------------------

EMBEDDING_MODEL_NAME: Final[str] = "intfloat/multilingual-e5-small"
EMBEDDING_DIM: Final[int] = 384
EMBEDDING_BATCH_SIZE: Final[int] = 32
EMBEDDING_PREFIX: Final[str] = "passage: "
EMBEDDING_FIELD_SEPARATOR: Final[str] = " / "
EMBEDDING_LIST_SEPARATOR: Final[str] = ", "
SYNOPSIS_MAX_CHARS: Final[int] = 1500

# --- Rakuten Books API (F-01) ---------------------------------------------

RAKUTEN_ENDPOINT: Final[str] = "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404"
RAKUTEN_INTERVAL_SEC: Final[float] = 1.0
RAKUTEN_HITS_PER_PAGE: Final[int] = 30
RAKUTEN_SORT: Final[str] = "-releaseDate"
RAKUTEN_FORMAT_VERSION: Final[int] = 2
RAKUTEN_MAX_RETRIES: Final[int] = 3
RAKUTEN_RETRY_BACKOFF_SEC: Final[float] = 2.0
RAKUTEN_TIMEOUT_SEC: Final[float] = 30.0
RAKUTEN_COMIC_ROOT_GENRE_ID: Final[str] = "001001"
DEFAULT_GENRE_IDS: Final[tuple[str, ...]] = (RAKUTEN_COMIC_ROOT_GENRE_ID,)
DEFAULT_MAX_PAGES: Final[int] = 5
SALES_DATE_DEFAULT_DAY: Final[int] = 1

HTTP_STATUS_TOO_MANY_REQUESTS: Final[int] = 429
HTTP_STATUS_SERVER_ERROR_MIN: Final[int] = 500
HTTP_STATUS_SERVER_ERROR_MAX: Final[int] = 599

# --- series grouping (F-01) -----------------------------------------------

SLUG_PREFIX: Final[str] = "w-"
SLUG_HASH_LENGTH: Final[int] = 10
SERIES_KEY_SEPARATOR: Final[str] = "|"
SERIES_CONFIDENCE_HIGH: Final[float] = 1.0
SERIES_CONFIDENCE_LOW: Final[float] = 0.6
AUTHOR_SEPARATOR_PATTERN: Final[str] = r"[/／、,，]"

# --- Amazon affiliate link (F-01 / F-07) ----------------------------------

# Paper books on Amazon use the ISBN-10 as their ASIN, so a product link can be
# built from the ISBN alone (no PA-API needed). Same template as `_shared/config.ts`.
AMAZON_DP_URL_TEMPLATE: Final[str] = "https://www.amazon.co.jp/dp/{asin}?tag={tag}"
ISBN10_LENGTH: Final[int] = 10
ISBN13_LENGTH: Final[int] = 13
ISBN13_CONVERTIBLE_PREFIX: Final[str] = "978"

# --- tagging (F-02) --------------------------------------------------------

GENRE_TAG_WEIGHT: Final[float] = 1.0
KEYWORD_TAG_WEIGHT: Final[float] = 0.6

# --- repository / Supabase -------------------------------------------------

SUPABASE_INSERT_CHUNK: Final[int] = 500
SUPABASE_FILTER_CHUNK: Final[int] = 100
SUPABASE_PAGE_SIZE: Final[int] = 1000
POST_LOG_RETENTION_DAYS: Final[int] = 2
WORK_STATUS_PUBLISHED: Final[str] = "published"
WORK_STATUS_PENDING: Final[str] = "pending"


class Settings(BaseSettings):
    """Environment-backed secrets. Field names map to upper-case env vars."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    rakuten_app_id: str = ""
    rakuten_affiliate_id: str = ""
    # Amazon Associates tracking ID. Empty = no Amazon links are generated.
    amazon_associate_tag: str = ""

    def require(self, *names: str) -> None:
        """Raise ``ValueError`` when any of the named settings is empty."""
        missing = [name for name in names if not getattr(self, name)]
        if missing:
            env_names = ", ".join(name.upper() for name in missing)
            raise ValueError(f"missing required environment variables: {env_names}")
