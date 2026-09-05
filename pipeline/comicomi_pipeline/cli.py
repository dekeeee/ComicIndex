"""``comicomi`` command line entry point (typer)."""

from __future__ import annotations

import logging
from typing import List

import typer

from . import config
from .ingest import run_ingest
from .recompute import run_recompute

app = typer.Typer(help="comicomi batch pipeline", no_args_is_help=True)

GENRE_OPTION = typer.Option(list(config.DEFAULT_GENRE_IDS), "--genre", help="Rakuten Books genre id (repeatable)")
MAX_PAGES_OPTION = typer.Option(config.DEFAULT_MAX_PAGES, "--max-pages", min=1, help="Pages to fetch per genre")
ALL_OPTION = typer.Option(False, "--all", help="Re-embed every published work, ignoring content_hash")
VERBOSE_OPTION = typer.Option(False, "--verbose", "-v", help="Debug logging")


@app.callback()
def main(verbose: bool = VERBOSE_OPTION) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


@app.command()
def ingest(genre: List[str] = GENRE_OPTION, max_pages: int = MAX_PAGES_OPTION) -> None:
    """Fetch Rakuten Books items and upsert works/tags (F-01, F-02)."""
    summary = run_ingest(genre, max_pages)
    typer.echo(
        f"ingest: {summary.items_fetched} items -> {summary.works} works "
        f"({summary.adult_works} adult), {summary.tags} work_tags"
    )


@app.command()
def recompute(all_works: bool = ALL_OPTION) -> None:
    """Embed changed works and recompute similarity (F-03)."""
    summary = run_recompute(only_changed=not all_works)
    typer.echo(
        f"recompute: {summary.promoted} promoted, {summary.embedded} embedded, {summary.works_scored} works scored, "
        f"{summary.similarity_rows} similarity rows"
    )


@app.command(name="all")
def run_all(
    genre: List[str] = GENRE_OPTION,
    max_pages: int = MAX_PAGES_OPTION,
    all_works: bool = ALL_OPTION,
) -> None:
    """Run ingest followed by recompute."""
    ingest(genre, max_pages)
    recompute(all_works)


if __name__ == "__main__":
    app()
