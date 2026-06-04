# CLAUDE.md

We develop applications for convenient management of obsidian-style notes in the form of a UI interface with a mind map, where each note is a node of the map. Our main goal is to create a user-friendly, simple tool for maintaining a personal knowledge base, navigating through it, and searching for information.

## Golden rules for agents

- Answer, write documentation, and specs in Russian
- YAGNI. Best code = no code. No features we don't need now.
- Make every change as simple as possible. Touch minimal code.
- When unsure about implementation details, ALWAYS ask the developer.
- Never agree just to be nice. Honest technical judgment required.
- When compacting, always preserve the full list of modified files and any test commands.

## Commands

- `make init` — `bun install` + установка Playwright (chromium) + проверка наличия `rustup`.
- `make run` — `bun run tauri dev`: Vite dev-сервер + нативное окно Tauri.
- `make check` — полный прогон: `format:check` + `lint` + `type-check` + `test` (coverage 100%) + `test:e2e`. Запускать перед тем, как помечать задачу выполненной.
- `make format` / `make lint` / `make type-check` / `make test` / `make test-e2e` — отдельные шаги.
- `make build` — `bun run tauri build` (требуется Rust stable).
- `make clean` — удалить `dist/`, `coverage/`, `src-tauri/target/`, `playwright-report/`, `test-results/`, `.vite/`.

Эквиваленты через `bun run …` совпадают со скриптами в `package.json` (`bun run dev`, `bun run lint`, `bun run test`, `bun run test:e2e`, `bun run tauri dev`, и т. д.). Менеджер пакетов — только `bun`, не `npm` / `pnpm`.

## Reasoning effort по фазам

Spec-driven цикл требует разного «усердия» модели. Соответствие фаза→effort:

| Фаза | Триггеры | Effort |
| --- | --- | --- |
| Спека (openspec) | `/opsx:new`, `/opsx:continue`, написание/обновление спеки | `high` |
| Спека critical/security/кросс-сервисная | те же + признаки безопасности / нескольких сервисов / необратимости на уровне дизайна | `max` |
| Реализация по готовой спеке | `/opsx:apply`, обычная реализация по плану | `medium` |
| Реализация с риском | конкурентность/гонки, миграции данных, интеграции с внешними системами, необратимые операции, сложные алгоритмы | `high` |
| Ревью диффа | `/code-review`, `/opsx:verify`, разбор изменений | `high` |

**Механизм.** Claude Code не умеет менять effort программно из хука (вход
`UserPromptSubmit` не содержит текущий уровень, в выводе нет поля для его смены).
Поэтому стоит *советующий* хук `.claude/hooks/effort-advisor.py` (зарегистрирован в
`.claude/settings.json` → `hooks.UserPromptSubmit`): он распознаёт фазу по ключевым
словам промпта и через `systemMessage` подсказывает нужный `/effort` — только при
смене фазы, чтобы не спамить. **Переключает effort человек** командой
`/effort <level>` (или `/effort auto` — сброс к дефолту модели).

Глобальный дефолт — `effortLevel: high` в `~/.claude/settings.json`, что совпадает с
фазой спеки. Хук подсказывает спуститься до `medium` на реализации, подняться до
`max` на critical-спеке и вернуться к `high` на ревью. Стартово effort также можно
задать флагом `claude --effort <level>` или переменной `CLAUDE_CODE_EFFORT_LEVEL`.

## Rules and conventions

- If a rule or lesson emerges during development that should be preserved so we don't step on the same rake again, save it immediately to `.claude/rules/` under the relevant file type.
- Non-obvious code must have a comment explaining WHY, not WHAT. A comment is warranted when: the reason for the code is a hidden browser/platform constraint, a subtle invariant, a workaround for a specific bug, or behaviour that would surprise a competent reader. "Why" includes the cause, not just the intent — e.g. "bfcache restores the page without re-running DOMContentLoaded" rather than "refresh data on back navigation".
- When adding a new feature or changing the architecture, update `README.md`, the relevant files in `docs/`, and `openspec/specs/` in the same change.

File-type-specific rules in `.claude/rules/` load automatically (via `globs:` frontmatter) when editing matching files and must be followed:

- `typescript.md` — общие правила TS (strict, импорты, `unknown`/`never`, запрет `any` / non-null `!`).
- `react.md` — правила React: хуки, композиция, CSS Modules, пропсы через типы.
- `tauri.md` — правила Rust-стороны и `tauri.conf.json` (команды, IPC, безопасность).
- `tests.md` — Vitest, `@testing-library/react`, Playwright, 100% coverage.
- `docs.md` — когда и как обновлять `README.md` и `docs/`.
- `openspec.md` — когда и как обновлять `openspec/specs/`.

`docs/` — техническая документация для разработчиков и агентов; индекс и навигация — в `docs/README.md`.

Планирующие артефакты под `openspec/`: `changes/` — спеки незавершённых изменений; `specs/<capability>/spec.md` — living-spec текущего поведения.

## Architecture

Фронт разбит на четыре слоя под `src/`. Зависимости идут строго сверху вниз — компоненты знают про стор, стор — про домен и persistence, домен не знает ни про что:

- `domain/` — чистые TypeScript-типы (`MindNode`, `MindEdge`, `Graph`) и функции операций над графом (`createEmpty`, `addRoot`, `addChild`, `removeSubtree`, `updateText`, `moveNode`) + `sanitize` для проверки целостности рёбер. Никаких импортов React / IDB / Tauri.
- `persistence/` — обёртка над IndexedDB через `idb`: открытие базы `mindmap` v1, `loadGraph` / `saveGraph` для записи `current` в object store `graph`, `createDebouncedSaver` с дебаунсом 250 мс и `bindUnloadFlush` для flush на `beforeunload` / `pagehide`.
- `store/` — zustand-стор (`createMindMapStore`, синглтон `mindMapStore`, хук `useMindMapStore`) с экшенами над графом и метаданными (`selectedNodeId`, `editingNodeId`). `bindSaver` связывает мутации графа с дебаунс-сейвером.
- `components/` — React-компоненты UI: канвас на `@xyflow/react` и кастомный узел `CloudNode` (появляются в текущем change на этапе UI-слоя). Не знают про IDB напрямую — работают через стор.

Desktop-обёртка — Tauri 2 в `src-tauri/`: `tauri::Builder::default()` без кастомных команд; в dev-сборке подключён `tauri-plugin-log`. Команды для работы с файлами появятся в отдельных change.

## Key Files

- `src/main.tsx` — точка входа React (`createRoot(...).render(<App />)`).
- `src/App.tsx` — корневой компонент.
- `src/domain/types.ts` — типы графа.
- `src/persistence/db.ts` — константы и схема IndexedDB.
- `src/store/mindmap-store.ts` — стор и хук `useMindMapStore`.
- `src-tauri/src/lib.rs` / `src-tauri/src/main.rs` — entry-point Tauri.
- `src-tauri/tauri.conf.json` — конфиг Tauri (окно, dev URL, build-команды).
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `biome.json`, `tsconfig.json` — конфиги тулчейна.
- `Makefile` — единая точка входа в задачи разработчика.

## Environment

Отдельный `.env` для приложения не требуется. Конфигурация Tauri и Vite лежит в `tauri.conf.json` и `vite.config.ts`. Из обязательного окружения — только `bun >= 1.1` и Rust stable через `rustup` (см. `README.md`).
