# CLAUDE.md

We develop applications for convenient management of obsidian notes in the form of a UI interface with a mind map, where each note is a node of the map. Our main goal is to create a user-friendly, simple tool for maintaining a personal knowledge base, navigating through it, and searching for information.

## Golden rules for agents

- Answer, write documentation, and specs in Russian
- YAGNI. Best code = no code. No features we don't need now.
- Make every change as simple as possible. Touch minimal code.
- When unsure about implementation details, ALWAYS ask the developer.
- Never agree just to be nice. Honest technical judgment required.
- When compacting, always preserve the full list of modified files and any test commands.

## Commands

- `make init` — install deps, set up pre-commit, install Playwright
- `make check` — format + lint + type-check + test + test-e2e; run before marking any task done
- `make run` — start dev server at http://localhost:8000
- `make format` / `make lint` / `make type-check` / `make test` — individual steps
- `make upgrade` — upgrade Python, lockfile, pre-commit hooks
- `make clean` — remove caches and `__pycache__`
- Use `uv` for deps management — not `pip`

## Rules and conventions

- If a rule or lesson emerges during development that should be preserved so we don't step on the same rake again, save it immediately to `.claude/rules/` under the relevant file type.
- Non-obvious code must have a comment explaining WHY, not WHAT. A comment is warranted when: the reason for the code is a hidden browser/platform constraint, a subtle invariant, a workaround for a specific bug, or behaviour that would surprise a competent reader. "Why" includes the cause, not just the intent — e.g. "bfcache restores the page without re-running DOMContentLoaded" rather than "refresh data on back navigation".
- When adding a new feature or changing the architecture, update `README.md`, the relevant files in `docs/`, and `openspec/specs/` in the same change.

File-type-specific rules in `.claude/rules/` load automatically (via `globs:` frontmatter) when editing matching files and must be followed:

- `python.md` — backend conventions (FastAPI, SQLAlchemy 2.0, testing pitfalls, Ruff gotchas).
- `docs.md` — when and how to update `README.md` and `docs/`.
- `openspec.md` — when and how to update `openspec/specs/`.

`docs/` — technical documentation for developers and agents; index and navigation in `docs/README.md`.

Planning artifacts under `openspec/`: `changes/` — specs for in-flight work; `specs/<capability>/spec.md` — the living spec of current behaviour.

## Project Overview

## Architecture

Clean Architecture in four layers under `src/`:

- `domain/` — pure-Python entities and repository protocols. Imports nothing from FastAPI/SQLAlchemy.
- `services/` — use-case functions; depend on `domain` only.
- `infrastructure/` — SQLAlchemy ORM, repository implementations, password hashing, JWT helpers, etc.
- `api/` — FastAPI routers, Pydantic schemas, dependencies. Wires repositories into services.

## Key Files

- `src/config.py` — settings (env-driven)

## Environment

Requires a `.env` file (gitignored) at the project root. Minimum required:

```
```
