# Obsidian Mind

Desktop-приложение для ведения персональной базы заметок в виде интерактивной mindmap: каждая заметка — узел канваса, связи — рёбра.

## Стек

- **UI**: React 19 + TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Сборка**: Vite 6.
- **Mindmap-канвас**: [`@xyflow/react`](https://reactflow.dev/).
- **Стор**: `zustand`.
- **Локальное хранилище**: IndexedDB через [`idb`](https://github.com/jakearchibald/idb).
- **Desktop-обёртка**: Tauri 2 (Rust shell в `src-tauri/`).
- **Тулчейн**: Biome (lint + format), Vitest + `@testing-library/react`, Playwright, `bun` как менеджер пакетов.

Детали выбора стека — [`docs/decisions/2026-05-27_initial-stack.md`](./docs/decisions/2026-05-27_initial-stack.md).

## Требования

- `bun >= 1.1` — менеджер пакетов и task-runner.
- Rust stable через `rustup` — обязательно для запуска и сборки Tauri (`make run`, `make build`).
- macOS / Linux (webkit2gtk) / Windows (MSVC) — стандартные системные библиотеки Tauri.

## Быстрый старт

```bash
make init   # bun install + Playwright (chromium) + проверка rustup
make run    # bun run tauri dev — Vite + нативное окно webview
make check  # format:check + lint + type-check + test (coverage 100%) + e2e
```

Полный список целей — `make help`.

## Структура проекта

```
obsidian_mind/
├─ src/                    React + TS
│  ├─ main.tsx             Vite entry
│  ├─ App.tsx
│  ├─ domain/              чистые типы и операции над графом
│  ├─ persistence/         IndexedDB-репозиторий, дебаунс-сейвер
│  ├─ store/               zustand-стор
│  └─ components/          UI (Canvas, CloudNode, WorkspacePanel, HotkeysHelp)
├─ src-tauri/              Rust shell (Tauri 2)
├─ tests/                  Playwright e2e
├─ docs/                   техническая документация
├─ openspec/               спецификации (текущие изменения и living-spec)
├─ .claude/                правила для агентов
├─ .github/workflows/      CI
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ biome.json
├─ playwright.config.ts
└─ Makefile
```

## Статус

MVP в разработке. На текущий момент:

- Собран каркас репозитория, тулчейн (Biome / Vitest / Playwright / Tauri / CI) — работает.
- Реализованы доменный слой (`src/domain/`), persistence в IndexedDB (`src/persistence/`), zustand-стор (`src/store/`); покрытие тестами — 100%.
- UI-слой: канвас на `@xyflow/react`, узел `CloudNode`. Поддержаны создание/удаление/правка/перетаскивание узлов, навигация стрелками, создание соседних и дочерних узлов с клавиатуры (`Enter` / `Shift+Enter`), отмена/повтор действий (`Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`) с историей последних шагов, браузер-подобная навигация «Назад/Вперёд» по истории фокуса (кнопки в левом верхнем углу и `Alt+←` / `Alt+→` или `Cmd/Ctrl+←` / `Cmd/Ctrl+→`, в т.ч. между пространствами), справка по горячим клавишам (кнопка «?» в углу).
- **Пространства** (`WorkspacePanel`): несколько независимых именованных пространств, каждое со своим графом. Сворачиваемая панель слева — список с выделением активного, создание (`[+]`), переименование и удаление с подтверждением (`⋮`-меню). Граф привязан к активному пространству; переключение меняет видимый граф; у каждого пространства своя сессионная история undo/redo. При старте открывается последнее активное пространство, состояние панели запоминается. Корни нельзя создавать без активного пространства.
- Хранилище: IndexedDB v2 — граф хранится по ключу пространства, плюс список пространств и UI-настройки (см. [`docs/storage.md`](./docs/storage.md)).
- Работа с файлами на диске, синхронизация — не реализованы и в этот change не входят.
