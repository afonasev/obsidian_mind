## Why

Репозиторий пуст: остался только скелет от Python-бэкенда, который мы решили не использовать. Чтобы начать разработку Obsidian-подобного приложения с mindmap-интерфейсом, нужен первый рабочий каркас: SPA на React + TS, обёрнутый в Tauri (для будущей работы с файлами на диске), с базовой mindmap-функциональностью и полным тулчейном для тестирования/линтинга/типизации. Без этой основы любая последующая работа упирается в выбор стека и инфраструктуры.

## What Changes

- **BREAKING**: удалить весь Python-скелет: `pyproject.toml`, `Makefile`, `src/logging_setup.py`, `.python-version`, `.pre-commit-config.yaml`, `.pytest_cache/`, `.coverage`, пустой `tests/`.
- Завести фронтенд-проект в `src/`: Vite + React 19 + TypeScript (strict).
- Подключить `@xyflow/react` как движок mindmap-канваса.
- Подключить `idb` как обёртку над IndexedDB для локального хранения.
- Завести Tauri 2 в `src-tauri/` (Rust shell); команды ФС пока не реализуем — только пустой scaffold, чтобы dev-loop сразу шёл через `bun run tauri dev`.
- Настроить тулчейн (строгие конфиги, без снисхождений):
  - Biome — `recommended` + все группы (`correctness`, `suspicious`, `complexity`, `style`, `performance`, `a11y`, `security`) в `error`. Форматтер и линтер падают на любом нарушении.
  - TypeScript — `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride` + `exactOptionalPropertyTypes`.
  - Vitest + `@testing-library/react` — для unit/компонентных тестов.
  - Playwright — для e2e.
  - **Coverage — 100%** (lines / functions / statements / branches), порог фиксированный в `vitest.config.ts`. Исключаем только точки входа (`main.tsx`), конфиги, типы и Rust-папку.
- **Pre-commit хук обязательный** (`simple-git-hooks` + `lint-staged`): авто-формат + линтер + тип-чек + связанные тесты. Ставится автоматически при `bun install`.
- **Pre-push хук**: полный `make check` как последний рубеж.
- Менеджер пакетов — `bun`.
- Новый `Makefile`: `make init`, `make run`, `make check`, `make build`, `make format`, `make lint`, `make type-check`, `make test`, `make test-e2e`.
- GitHub Actions: pipeline `biome check + tsc --noEmit + vitest run + playwright test`.
- Реализовать MVP mindmap-редактора:
  - канвас с pan/zoom;
  - двойной клик по пустому месту → создание корневого узла;
  - кнопка «+» на узле → создание дочернего узла с ребром;
  - редактирование текста узла (Enter / F2 — начать, Esc — отменить, Enter / клик вне — сохранить);
  - перетаскивание узлов;
  - удаление узла (Delete) вместе с его поддеревом;
  - персист всего графа в IndexedDB, автозагрузка при открытии.
- Узлы рендерятся как скруглённый прямоугольник с тенью и текстом.
- Переписать `CLAUDE.md` под React/TS/Tauri/bun-стек.
- В `.claude/rules/` удалить `python.md`; завести `typescript.md`, `react.md`, `tauri.md`, `tests.md`; обновить `docs.md` под новую структуру документации; сохранить `openspec.md`.
- Переписать `README.md` и каркас `docs/` под новый стек.

## Capabilities

### New Capabilities

- `mindmap-editor`: канвас mindmap, создание/редактирование/удаление узлов и рёбер, навигация (pan/zoom), перетаскивание, текстовая правка.
- `local-persistence`: схема и операции хранения графа в IndexedDB (узлы, рёбра, метаданные документа), автозагрузка/автосохранение.
- `project-skeleton`: требования к структуре репозитория, тулчейну, командам сборки/тестирования и CI, обязательные для всех будущих изменений.

### Modified Capabilities

<!-- Нет существующих spec'ов в openspec/specs/ — это первый change в проекте. -->

## Impact

- **Удаляется**: весь Python-скелет (см. список выше), правила в `.claude/rules/python.md`.
- **Добавляется**: `src/` (React/TS), `src-tauri/` (Rust scaffold), `tests/` (Playwright), корневые конфиги (`package.json`, `bun.lockb`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `playwright.config.ts`, `vitest.config.ts`, `tauri.conf.json`), `.github/workflows/ci.yml`.
- **Зависимости разработчика**: `bun >= 1.1`, `rustup` + Rust stable toolchain (требуется Tauri), системные библиотеки Tauri (webkit2gtk на Linux, MSVC на Windows, ничего дополнительного на macOS).
- **CI**: переключается с Python-пайплайна на Node/Tauri-пайплайн.
- **Документация**: `README.md`, `CLAUDE.md`, `.claude/rules/*`, `docs/*` переписываются под новый стек.
- **Хранилище**: используется только IndexedDB браузера/webview — пользовательских данных на диске пока не пишем.
