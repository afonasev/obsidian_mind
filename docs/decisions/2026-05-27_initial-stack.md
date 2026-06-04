# 2026-05-27 — Начальный стек: React 19 + TS strict + Vite + Tauri 2 + IDB

**Что**: зафиксировали первый рабочий стек проекта Obsidian Mind. UI — React 19 + TypeScript (strict), сборка Vite 6, mindmap-движок `@xyflow/react`, стор `zustand`, локальное хранилище IndexedDB через `idb`, desktop-обёртка Tauri 2, тулчейн Biome + Vitest + Playwright, менеджер пакетов `bun`.

## Зачем (по компонентам)

### TypeScript (strict + `noUncheckedIndexedAccess` + `noImplicitOverride` + `exactOptionalPropertyTypes`)
Стандарт с лучшим в индустрии статическим анализом. Альтернативы — JavaScript (теряем гарантии типизации), Reason/ReScript / Elm / ClojureScript (узкая экспертиза, мало библиотек). Strict — это контракт; понижать строгость нельзя.

### React 19
Главная причина — `@xyflow/react` (бывший React Flow), самая зрелая библиотека для node-based UI. Конкуренты — Svelte 5, Vue 3, Solid — имеют только порты `@xyflow/*` с меньшим комьюнити и медленнее багфиксами.

### Vite 6
Дефолт современного React-стека. Хорошо стыкуется с Tauri (Tauri умеет работать с Vite dev-сервером). Альтернативы (Webpack / Parcel / Turbopack / Rspack) проигрывают по DX или сырости.

### Tauri 2
Альтернативы:
- **Electron** — бандл ~80+ MB, расход памяти; Tauri даёт ~5–10 MB.
- **File System Access API в браузере** — Chromium-only, нет file watching, постоянное переподтверждение прав, нет нативного меню. Не подходит для Obsidian-подобного UX.
- **Локальный Python-бэкенд + браузер** — пользователю нужно ставить Python и запускать сервер. Странный UX.

Цена Tauri — Rust в тулчейне. Принимаем: язык-обёртка минимальная (`#[tauri::command]`-функции — десятки строк Rust на каждую операцию ФС). Завели сразу, а не «потом», чтобы dev-loop с самого начала шёл через `bun run tauri dev` — страховка от «работало в браузере, сломалось в webview».

### `@xyflow/react`
Решает 90% задач canvas-mindmap'а: pan / zoom / selection / drag / edges / handles. Кастомные ноды — обычные React-компоненты. Альтернативы — кастомный SVG/Canvas (месяцы работы), D3 (низкоуровневый, не «компонентный»), Cytoscape.js (про аналитические графы), Konva / Fabric.js (теряем DOM-доступность узлов).

### IndexedDB через `idb`
Альтернативы:
- **`localStorage`** — ~5 MB, синхронный API, только JSON; узким местом становится уже на сотнях узлов.
- **Dexie** — мощнее (запросы, миграции, индексы), но overkill на старте: один документ, один граф.
- **SQLite через Tauri / `sql.js`** — гибче, но требует нативной зависимости или WASM (~1 MB). Преждевременная сложность.

`idb` — тонкая промис-обёртка (~1 KB). Если позже понадобятся индексы или сложные миграции — мигрируем на Dexie без потери данных.

### `zustand`
Минимальный API, легко тестируется (стор — это просто хук). Альтернативы — `useState` + props drilling (на MVP хватит, но переделывать при undo/redo), Redux Toolkit (бойлерплейт), Jotai / Recoil (атомарный подход хорош для локального состояния, для одного глобального документа менее удобен).

### CSS Modules
Встроены в Vite, без рантайма, локальные имена классов. Альтернативы — Tailwind (визуальный шум в JSX, свой тулчейн — преждевременно), styled-components / emotion (runtime CSS-in-JS, оверхед), vanilla-extract (типобезопасно, но сложнее в настройке).

### Biome (строго)
Единый бинарь на Rust, один конфиг, в 10–25× быстрее ESLint + Prettier на больших репах. Поддерживает ~95% правил ESLint. Конфиг: `recommended` + все группы `correctness` / `suspicious` / `complexity` / `style` / `performance` / `a11y` / `security` в `error`. CI и pre-commit падают на любом нарушении (`--error-on-warnings`).

### Vitest + `@testing-library/react` + Playwright
- **Vitest** — Vite-native, быстрый. `bun test` пока пропускаем: молодой, не все либы экосистемы Vitest на нём работают.
- **Playwright** — против `bun run preview` в headless-режиме, только chromium. Tauri-IPC e2e отложен до появления первой команды.
- **Coverage 100%** обязателен (lines / functions / statements / branches), порог зафиксирован в `vitest.config.ts`. Исключения — только точки входа (`main.tsx`), конфиги, типы, `src-tauri/**`. Точечные `/* v8 ignore */` — только с комментарием-причиной.

### `bun`
Быстрее `npm` / `pnpm`, встроенный TS-loader, активно развивается. Молодость — основной риск; за последний год экосистема стабилизировалась. Vitest и Playwright используем «классически», не зависим от `bun test`.

### Pre-commit / pre-push hooks (`simple-git-hooks` + `lint-staged`)
Лёгкая альтернатива `husky`. Хук `pre-commit` гоняет `lint-staged` (Biome auto-fix + повторная проверка) и `tsc --noEmit`. Хук `pre-push` гоняет полный `bun run check`. Хук ставится автоматически на `bun install` через `postinstall`.

## Цена

- Rust в тулчейне разработчика и CI (для Tauri). Системные библиотеки webview (webkit2gtk на Linux, MSVC на Windows; macOS — ничего дополнительного).
- 100% coverage на UI — дорогой режим. Принимаем как осознанный.
- Tauri-IPC сейчас не покрыт e2e. Команд пока нет; вернёмся, когда появятся.
- Bun может ломаться с экзотическими пакетами. Fallback — переключение на `npm` / `pnpm` без блокировки разработки.

## Альтернативы (сводно)

| Слой | Что выбрали | Что отвергли |
| --- | --- | --- |
| Язык | TypeScript (strict) | JavaScript, ReScript, Elm, ClojureScript |
| UI-фреймворк | React 19 | Svelte 5, Vue 3, Solid |
| Сборка | Vite 6 | Webpack, Parcel, Turbopack, Rspack |
| Desktop-обёртка | Tauri 2 | Electron, File System Access API, Python-бэк + браузер |
| Канвас | `@xyflow/react` | Кастомный SVG/Canvas, D3, Cytoscape.js, Konva, Fabric.js |
| Хранилище | IndexedDB + `idb` | `localStorage`, Dexie, SQLite (Tauri / `sql.js`) |
| Стор | `zustand` | `useState` + drilling, Redux Toolkit, Jotai, Recoil |
| Стили | CSS Modules | Tailwind, styled-components, vanilla-extract |
| Lint + format | Biome | ESLint + Prettier |
| Unit / component | Vitest + RTL | Jest, `bun test` |
| E2E | Playwright | Cypress |
| Менеджер пакетов | `bun` | `npm`, `pnpm` |
| Git-хуки | `simple-git-hooks` + `lint-staged` | `husky`, нативные `.git/hooks/` |

## Дата

2026-05-27. Решения зафиксированы в рамках change [`init-mindmap-spa`](../../openspec/changes/init-mindmap-spa/) (см. `proposal.md` и `design.md`).
