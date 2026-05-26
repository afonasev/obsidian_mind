## Context

Проект только начинается. В репозитории остался Python-скелет (FastAPI/SQLAlchemy упоминаются в `CLAUDE.md`, но кода нет — только `src/logging_setup.py` и `structlog` в `pyproject.toml`). Конечная цель — приложение в духе Obsidian: персональная база заметок с интерактивной mindmap-навигацией, работающее с файлами на диске пользователя.

Этот change закладывает фундамент. Решения здесь не косметические — они определяют тулчейн, язык, способ дистрибуции и подход к данным на годы вперёд. Поэтому каждое решение фиксируем с альтернативами.

Ограничения:

- Фронт — самая сложная часть продукта. Нужны строгий тип-чекер, удобные unit/component-тесты и e2e.
- В будущем нужно читать/писать файлы на диске пользователя (markdown-vault). Бэкенд-сервер на Python (FastAPI) под эту задачу непригоден — он не имеет привилегированного доступа к ФС и требовал бы локальной установки Python.
- Команда — один разработчик, без жёсткого дедлайна. Можно выбирать стек по «надёжности и DX», а не по «знают все».

## Goals / Non-Goals

**Goals:**

- Завести SPA на React 19 + TypeScript (strict), запускаемый как desktop-приложение через Tauri 2.
- Поднять полноценный тулчейн: lint + format + type-check + unit/component-тесты + e2e + CI.
- Реализовать MVP mindmap-редактора: создание корневых узлов, создание дочерних узлов от любого узла, редактирование текста, перетаскивание, удаление, pan/zoom.
- Локальный персист в IndexedDB: всё сохраняется автоматически, при перезапуске граф восстанавливается.
- Каркас, готовый к расширению: добавление работы с файлами (через Tauri-команды), добавление поиска, многодокументной модели.

**Non-Goals:**

- Не делаем работу с файлами на диске — она планируется в следующих change.
- Не делаем синхронизацию между устройствами, аутентификацию, шаринг.
- Не делаем продвинутую визуализацию (анимации появления, авто-раскладка, кривые рёбра) — пока прямые линии и ручное позиционирование.
- Не делаем экспорт в markdown/png/svg.
- Не делаем undo/redo в MVP (намеренно: добавим позже, когда определимся со стором).
- Не делаем мультидокумент: один граф на приложение в этом change.

## Decisions

### 1. Язык фронтенда — TypeScript (strict)

Все альтернативы (JavaScript, Reason/ReScript, Elm, ClojureScript) либо проигрывают TS по DX и инструментам, либо требуют редкой экспертизы. TypeScript — стандарт, у которого статический анализ из коробки и сильный экосистемный буст. Включаем `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.

### 2. UI-фреймворк — React 19

Рассматривали React, Svelte 5, Vue 3, Solid. Решение — React, причина одна и главная: `@xyflow/react` (бывший React Flow) — самая зрелая и активно развиваемая библиотека для node-based UI. Аналоги Svelte Flow / Vue Flow — порты, у них меньше комьюнити и медленнее багфиксы. На горизонте 1–2 лет это критично.

Cost: чуть больший bundle и менее «магическая» реактивность, чем у Svelte. Принимаем.

### 3. Сборщик — Vite 6

Стандарт для современных React-проектов. Альтернатив (Webpack, Parcel, Turbopack, Rspack) на сегодняшний день не вижу — Vite даёт лучший DX и хорошо стыкуется с Tauri (Tauri умеет работать с Vite dev-сервером из коробки).

### 4. Десктоп-обёртка — Tauri 2

Альтернативы:

- **Electron** — толстый бандл (~80+ MB), большой расход памяти. Tauri даёт ~5–10 MB.
- **File System Access API в браузере** — Chromium-only, нет файлового watching, права на каталог надо переподтверждать, нет нативного меню/трея. Не подходит для Obsidian-подобного UX.
- **Локальный Python-бэкенд + браузер** — пользователю нужно ставить Python и запускать сервер. Странный UX, проигрывает Tauri по всем параметрам.

Цена Tauri — Rust в тулчейне разработчика и CI. Принимаем: язык-обёртка минимальная (`#[tauri::command]`-функции — это десятки строк Rust на каждую операцию ФС).

Tauri заводим **сразу**, а не «потом». Причина: dev-loop с самого начала через `bun run tauri dev` точно так же, как в продакшене. Это страховка от ситуации «работало в браузере — сломалось в webview».

### 5. Mindmap-движок — `@xyflow/react`

Альтернативы:

- **Кастомный SVG/Canvas с нуля** — pan/zoom, drag, selection, эджи — это месяцы работы. На MVP убивает темп.
- **D3.js** — низкоуровневый, не «компонентный», плохо стыкуется с React.
- **Cytoscape.js** — больше про аналитические графы, не про редактирование mindmap'ов руками.
- **Konva / Fabric.js** — канвас-ориентированные, теряем DOM-доступность узлов (узел — это `<div>` в React Flow, его можно стилизовать CSS, фокусировать, копировать текст браузером).

`@xyflow/react` решает 90% задач: pan/zoom/selection/drag/edges/handles. Кастомные ноды — это обычные React-компоненты. Стор узлов/рёбер контролируем мы (через `useNodesState`/`useEdgesState` или собственный стор).

### 6. Хранилище — IndexedDB через `idb`

Альтернативы:

- **`localStorage`** — лимит ~5 MB, синхронный API, сериализация только через JSON. Для большого графа узким местом станет уже на сотнях узлов.
- **Dexie** — мощнее `idb`: запросы, миграции, индексы. Но на старте overkill: один документ, один граф.
- **SQLite через Tauri / `sql.js`** — гибче, но требует либо нативной зависимости, либо WASM (~1 MB). Преждевременная сложность.

`idb` — тонкая промис-обёртка над нативным IndexedDB (~1 KB). Если позже понадобятся индексы по тексту или сложные миграции — мигрируем на Dexie без потери данных (формат хранения тот же).

**Схема данных в IDB (один документ):**

```
db: "mindmap"  (version 1)
  store "graph":
    key: "current"
    value: {
      version: 1,
      nodes: Node[],
      edges: Edge[],
      updatedAt: number  // Date.now()
    }
```

`Node`:
```
{
  id: string             // crypto.randomUUID()
  text: string
  position: { x: number, y: number }
  parentId: string | null   // null для корневых
}
```

`Edge`:
```
{
  id: string
  source: string  // parent node id
  target: string  // child node id
}
```

`parentId` в `Node` дублирует информацию из `Edge`, но даёт O(1) проход «вверх» и упрощает удаление поддерева. Дубль не страшен — пишем граф целиком одной транзакцией.

Дебаунс на запись — 250 мс. Каждая мутация в стор откладывает запись; запись идёт в `requestIdleCallback` если доступен.

### 7. Lint + format — Biome (строгая конфигурация)

Альтернативы:

- **ESLint + Prettier** — двойной конфиг, медленнее (Node), привычнее, но в 2026 это уже атавизм.
- **Biome** — единый бинарь на Rust, один конфиг, быстрее в 10–25× на больших репах. Поддерживает 95% правил ESLint, форматирует код и JSON/CSS. Это «ruff для JS».

Принимаем Biome. Строгая конфигурация:

- `linter.rules.recommended: true` (база).
- Включаем все группы `correctness`, `suspicious`, `complexity`, `style`, `performance`, `a11y`, `security` в режиме `error`.
- Точечно — то, что в `recommended` помечено `warn`, поднимаем до `error`: `noExplicitAny`, `noUnusedImports`, `noUnusedVariables`, `useExhaustiveDependencies`, `useHookAtTopLevel`, `noNonNullAssertion`, `noConsole`.
- Форматтер: `lineWidth: 100`, `indentStyle: "space"`, `indentWidth: 2`, `quoteStyle: "double"`, `semicolons: "always"`, `trailingCommas: "all"`, `arrowParentheses: "always"`.
- Импорты: `organizeImports` включён (Biome сам сортирует и группирует).
- CI и pre-commit падают на любом нарушении (`--error-on-warnings`).

### 8. Тесты и покрытие — 100%

- **Unit / component**: Vitest + `@testing-library/react` + `jsdom`. Vitest — Vite-native, быстрый. `bun test` пока пропускаем: он молодой, не все либы Vitest-эко работают на нём, а скорость Vitest нам достаточно.
- **E2E**: Playwright. Запускаем против Vite preview-сервера в headless-режиме в CI. Локально — также против `bun run tauri dev` нельзя (webview), поэтому e2e — только против web-сборки. Это компромисс: e2e не покрывает Tauri-IPC. Tauri-команды в этом change ещё пустые, так что вопрос отложен.
- **Coverage — 100% обязательно**:
  - Провайдер: V8 (Vitest нативный, без перекомпиляции).
  - Пороги в `vitest.config.ts`: `lines/functions/statements/branches: 100`.
  - `coverage.thresholdAutoUpdate: false` — порог фиксированный, не «плывущий».
  - Исключения из coverage (`coverage.exclude`):
    - `src/main.tsx` — точка входа в React (`createRoot(...).render(<App />)`).
    - `**/*.d.ts` — type-only файлы.
    - `**/*.test.{ts,tsx}` и `tests/**` — сами тесты.
    - `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` — конфиги.
    - `src-tauri/**` — Rust, у него своё покрытие (пока пустое).
  - **Не** исключаем: компоненты, стор, домен, persistence — всё это покрывается полностью.
  - Локально и в CI: `bun run test --coverage` — единственный способ запуска, никаких «зелёных» тестов без coverage.
  - Coverage-репорт в CI — артефакт `coverage/` для разбора.

### 9. Менеджер пакетов — `bun`

Альтернативы — `npm` (по умолчанию), `pnpm` (быстрый, эффективный по диску). `bun` быстрее обоих, имеет встроенный test-runner и TS-loader, активно развивается. Молодость — основной риск, но за последний год экосистема стабилизировалась. Принимаем с пониманием, что Vitest и Playwright используем «классически», не зависая на `bun test`.

### 10. Стор приложения — `zustand`

Альтернативы:

- **`useState` + props drilling** — на MVP может хватить, но как только понадобится undo/redo или несколько окон/панелей, придётся переделывать.
- **Redux Toolkit** — overkill, бойлерплейт.
- **Jotai / Recoil** — атомарный подход, хорош для локального состояния. Для глобального графа менее удобен.
- **`zustand`** — минимальный API, легко тестируется (стор — это просто хук), хорошо ложится на наш сценарий «один глобальный документ + действия над ним».

Стор отдельно от `@xyflow/react`-стейта: `useNodesState`/`useEdgesState` оставляем как локальное состояние компонента-канваса, а в `zustand` держим «правду» (список узлов/рёбер + текущий выделенный узел + dirty-флаг для дебаунса). Синхронизация: канвас читает из стора, мутации идут через actions стора.

### 11. Стилизация — CSS Modules

Альтернативы — Tailwind, styled-components, vanilla-extract, plain CSS.

- **Tailwind** — мощно, но визуальный шум в JSX, плюс свой тулчейн. Преждевременно.
- **styled-components / emotion** — runtime CSS-in-JS, оверхед в bundle и SSR-нюансы (нам не актуально, но репутация так себе).
- **vanilla-extract** — типобезопасный CSS, отличный, но сложнее в настройке.
- **CSS Modules** — встроены в Vite, не требуют рантайма, локальные имена классов, типы можно сгенерировать.

Принимаем CSS Modules. Если визуальный пласт вырастет — пересмотрим.

### 12. Структура репозитория

```
obsidian_mind/
├─ src/                         ← React + TS
│  ├─ main.tsx                  ← Vite entry
│  ├─ App.tsx
│  ├─ components/
│  │  ├─ Canvas/                ← обёртка @xyflow/react
│  │  └─ CloudNode/             ← кастомная нода (скруглённое облачко)
│  ├─ store/                    ← zustand-стор
│  ├─ persistence/              ← idb-обёртка, save/load
│  ├─ domain/                   ← чистые типы и операции над графом
│  └─ styles/
├─ src-tauri/                   ← Rust shell (Tauri 2 default)
│  ├─ src/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ tests/                       ← Playwright e2e
├─ docs/
├─ openspec/
├─ .claude/
├─ .github/workflows/ci.yml
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ biome.json
├─ playwright.config.ts
└─ Makefile
```

Unit/component-тесты живут рядом с кодом (`Foo.tsx` + `Foo.test.tsx`). Tests `tests/` оставляем только под e2e — это упрощает Playwright-конфиг и отделяет «дешёвые» тесты от «дорогих».

### 13. Доменный слой

Внутри `src/domain/` — pure-TS типы (`Node`, `Edge`, `Graph`) и чистые функции операций над графом (`addRoot`, `addChild`, `removeSubtree`, `updateText`, `moveNode`). Они не знают про IndexedDB, React, Tauri. Это упрощает тестирование: unit-тесты доменных функций — без `jsdom`, без моков.

`src/store/` — обёртка над доменом + сайд-эффекты (запись в IDB). `src/persistence/` — слой работы с IndexedDB через `idb`. `src/components/` — UI, ничего не знает про IDB.

### 14. Tauri-команды на старте

Пустой scaffold: `src-tauri/src/main.rs` с `tauri::Builder::default().run(...)`, без custom-команд. Это даёт работающий dev-loop сейчас и нулевой технический долг — команды добавим в change, посвящённый работе с файлами.

### 15. CI

`.github/workflows/ci.yml`:

1. Чек-аут.
2. Setup `bun` (officially supported action).
3. `bun install --frozen-lockfile`.
4. `bun run format:check` (`biome format --error-on-warnings`).
5. `bun run lint` (`biome lint --error-on-warnings`).
6. `bun run type-check` (`tsc --noEmit`).
7. `bun run test` (Vitest с coverage, порог 100%).
8. `bun run test:e2e` (Playwright; `bun run build` + preview-сервер).

Каждый шаг — отдельный job-step с явным `name`, чтобы по красному CI было видно, что именно упало.

Сборку Tauri в CI **не** запускаем в этом change — она требует системных зависимостей (webkit2gtk и т.д.) и матрицы из трёх ОС. Добавим в отдельный change «релизный пайплайн».

### 16. Pre-commit hook — обязательный

Альтернативы:

- **`husky`** — стандарт де-факто, требует `prepare`-скрипта, тащит зависимости.
- **`simple-git-hooks`** — лёгкая альтернатива, конфиг прямо в `package.json`, ставит хук одной командой.
- **Нативный `.git/hooks/`** — ничего не ставит, но не переносится между разработчиками.

Принимаем **`simple-git-hooks` + `lint-staged`**. Конфиг в `package.json`. Хук `pre-commit` запускает `lint-staged`, который:

1. На staged-файлах: `biome check --write` (автоформат + автофиксы линтера). Изменения авто-добавляются обратно в коммит.
2. На staged-файлах: `biome lint --error-on-warnings` (повторная проверка — на случай если автофикс не справился).
3. `tsc --noEmit` (полный тип-чек — TS не «постфайловый», нужен весь проект).
4. `vitest related --run --coverage` — запуск тестов, связанных со staged-файлами, с проверкой coverage.

`commit-msg` хук пока не делаем (нет соглашения о формате коммитов в этом change).

`pre-push` хук: полный `bun run check` (format + lint + type-check + test + test:e2e) — последний рубеж перед пушем. Можно отключить переменной `SKIP_E2E=1` для скорости.

Установка хука — автоматическая через `postinstall`-скрипт `bun install`. Разработчику не нужно делать ничего вручную.

## Risks / Trade-offs

- **Tauri-IPC не покрыт e2e**. → На этом этапе в Tauri нет команд. Когда они появятся — добавим Tauri-специфичные тесты через `tauri::test::mock` или Playwright-через-webdriver.
- **Bun молод, может ломаться с экзотическими пакетами**. → Все ключевые либы (React, Vite, Vitest, Playwright, `@xyflow/react`, `idb`, `zustand`) официально совместимы с bun. Если конкретная либа сломается — добавляем `npm`/`pnpm` как fallback, не блокируем разработку.
- **IndexedDB и блокировки в Tauri webview**. → На macOS/Windows webview — стандартный WKWebView/WebView2, поддержка IDB полная. На Linux — WebKitGTK; известно, что IDB там может быть медленным на больших объёмах. Принимаем риск: первый пользователь — разработчик на macOS.
- **Нет undo/redo в MVP**. → Лёгкое неудобство при правках. Пользователь — разработчик, может пережить. Добавим в следующий change.
- **Один документ в IDB**. → Нельзя одновременно держать несколько графов. Принимаем: фокус MVP — на интерфейсе создания узлов, мультидокумент — отдельная история (потребует UI-навигации между документами).
- **Удаление Python-скелета — невосстановимо без git**. → Делаем коммит «remove python skeleton» отдельным шагом до scaffold'а фронта, чтобы при необходимости легко откатиться.
- **`@xyflow/react` навязывает свою модель состояния узлов/рёбер**. → Решили: канвас держит локальный стейт через хуки `useNodesState`/`useEdgesState`, а «правду» дублируем в zustand. Возможна рассинхронизация — митигируем тестами на действия пользователя.
- **100% coverage на UI-коде — дорогой режим**. → Точки входа (`main.tsx`), конфиги и Rust исключены из подсчёта. Остальное (компоненты, стор, домен, persistence) покрывается. Если конкретный кусок невозможно покрыть честно (например, ветка обработки невозможной ошибки) — пишем `/* v8 ignore next */`-комментарий **только** с пояснением WHY рядом; bare-ignore без комментария запрещён линтером (правило `noUnusedDirective`-аналог проверим вручную через ревью).
- **Pre-commit auto-fix может конфликтовать со staged-изменениями**. → `lint-staged` запускает Biome на staged-файлах через `git stash`, безопасно для unstaged-правок. Если разработчик закоммитил часть файла — Biome поправит только эту часть.

## Migration Plan

Поскольку проект пуст (нет ни пользователей, ни данных), миграция — это последовательность шагов внутри одного PR/change:

1. Удалить Python-скелет одним коммитом.
2. Создать `package.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, базовый `src/main.tsx` + `src/App.tsx`. Проверить, что `bun run dev` поднимает Vite.
3. Завести Tauri 2 (`bun create tauri-app` нельзя — мы уже в репозитории; ставим `@tauri-apps/cli` вручную, инициализируем `src-tauri/`).
4. Настроить Biome, Vitest, Playwright, CI.
5. Реализовать домен (`src/domain/`), стор (`src/store/`), персистенс (`src/persistence/`).
6. Реализовать UI: канвас, кастомная нода `CloudNode`, тулбар (или контекстное меню) для создания/удаления.
7. Переписать `CLAUDE.md`, `.claude/rules/*`, `README.md`, `docs/*`.

Rollback — `git revert` коммита. Поскольку данных нет, других зависимостей у проекта нет, риск нулевой.

## Open Questions

- **Где живёт стейт `@xyflow/react`?** Сначала идём с встроенным `useNodesState`/`useEdgesState` + синхронизацией в zustand. Если ловим баги синхронизации — переедем на «zustand как единственный источник правды + контролируемые ноды/эджи». Решение примем в коде.
- **Формат текста в узле — plain или markdown?** Для MVP — plain text (однострочный input). Markdown добавим позже, когда определимся с рендером.
- **Снимать ли через CI кросс-платформенный Tauri-build?** Отложили: оверхед инфраструктуры (webkit2gtk на Linux, MSVC на Windows). Отдельный change.
- **Версия React — 19 или 18?** Идём с 19. `@xyflow/react` поддерживает обе. Если ловим серьёзные проблемы — откатимся.
