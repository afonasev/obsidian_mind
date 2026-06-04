## 1. Очистка Python-скелета

- [x] 1.1 Удалить файлы: `pyproject.toml`, `.python-version`, `.pre-commit-config.yaml`, `.coverage`, `.pytest_cache/`, `src/logging_setup.py`, `src/__pycache__/`, `.claude/rules/python.md`
- [x] 1.2 Удалить пустой `tests/` (создадим заново под Playwright)
- [x] 1.3 Очистить старый `Makefile` (перепишем в задаче 7.1)
- [x] 1.4 Обновить `.gitignore` под Node/TS/Tauri-стек (`node_modules/`, `dist/`, `coverage/`, `src-tauri/target/`, `.vite/`, `playwright-report/`, `test-results/`)
- [x] 1.5 Закоммитить удаление отдельным коммитом (для лёгкого rollback)

## 2. Базовый scaffold React + Vite + TS

- [x] 2.1 Создать `package.json` с полем `name: "obsidian-mind"`, `private: true`, секциями `scripts`, `dependencies`, `devDependencies`
- [x] 2.2 Установить dev-зависимости: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`
- [x] 2.3 Установить runtime-зависимости: `react`, `react-dom`, `@xyflow/react`, `idb`, `zustand`
- [x] 2.4 Создать `tsconfig.json` со строгими настройками: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`, `module: "ESNext"`, `target: "ES2022"`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`
- [x] 2.5 Создать `vite.config.ts` с `@vitejs/plugin-react` и алиасом `@` → `./src` (если потребуется)
- [x] 2.6 Создать `index.html` в корне (Vite default), `src/main.tsx` (entry), `src/App.tsx` (заглушка с текстом)
- [x] 2.7 Проверить: `bun install` ставит зависимости, `bun run dev` поднимает Vite на `http://localhost:5173`

## 3. Конфигурация Biome (строгая)

- [x] 3.1 Установить `@biomejs/biome` в devDependencies
- [x] 3.2 Создать `biome.json`: `linter.rules.recommended: true`, явно поднять до `error` правила `noExplicitAny`, `noUnusedImports`, `noUnusedVariables`, `useExhaustiveDependencies`, `useHookAtTopLevel`, `noNonNullAssertion`, `noConsole`; включить группы `correctness`, `suspicious`, `complexity`, `style`, `performance`, `a11y`, `security` в `error` (через `--error-on-warnings` + `recommended: true`)
- [x] 3.3 Настроить форматтер: `lineWidth: 100`, `indentStyle: "space"`, `indentWidth: 2`, `quoteStyle: "double"`, `semicolons: "always"`, `trailingCommas: "all"`, `arrowParentheses: "always"`
- [x] 3.4 Включить `organizeImports`
- [x] 3.5 Добавить scripts в `package.json`: `"format": "biome format --write"`, `"format:check": "biome format --error-on-warnings"`, `"lint": "biome lint --error-on-warnings"`, `"lint:fix": "biome lint --write"`, `"check:biome": "biome check --error-on-warnings"`
- [x] 3.6 Проверить: `bun run lint` и `bun run format:check` проходят на текущем коде

## 4. Vitest + покрытие 100%

- [x] 4.1 Установить devDependencies: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` (jsdom@26 — версия 29 несовместима с Node <22.13)
- [x] 4.2 Создать `vitest.config.ts`: `environment: "jsdom"`, `setupFiles: ["./src/test-setup.ts"]`, `coverage.provider: "v8"`, `coverage.thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 }`, `coverage.thresholds.autoUpdate: false` (в Vitest 4 переименовано из `coverage.thresholdAutoUpdate`)
- [x] 4.3 Настроить `coverage.exclude`: `src/main.tsx`, `**/*.d.ts`, `**/*.test.{ts,tsx}`, `tests/**`, `*.config.{ts,js}`, `src-tauri/**`, `dist/**`, `coverage/**`
- [x] 4.4 Создать `src/test-setup.ts` с импортом `@testing-library/jest-dom/vitest`
- [x] 4.5 Добавить scripts: `"test": "vitest run --coverage"`, `"test:watch": "vitest"`
- [x] 4.6 Написать smoke-тест на `App` (`src/App.test.tsx`), проверить, что `bun run test` зелёный и coverage = 100%

## 5. Playwright e2e

- [x] 5.1 Установить devDependency: `@playwright/test`
- [x] 5.2 Запустить `bunx playwright install --with-deps chromium` (в CI и локально)
- [x] 5.3 Создать `playwright.config.ts`: `testDir: "tests"`, `webServer: { command: "bun run preview", port: 4173, reuseExistingServer: !process.env.CI }`, проекты — chromium
- [x] 5.4 Добавить scripts: `"build": "vite build"`, `"preview": "vite preview --port 4173"`, `"test:e2e": "playwright test"`
- [x] 5.5 Написать smoke e2e-тест `tests/smoke.spec.ts`: открыть `/`, увидеть пустой канвас (заменим на «канвас» в секции 13 после реализации UI)

## 6. Git-хуки (simple-git-hooks + lint-staged)

- [x] 6.1 Установить devDependencies: `simple-git-hooks`, `lint-staged`
- [x] 6.2 Добавить в `package.json` секцию `"simple-git-hooks"`: `"pre-commit": "bunx lint-staged && bun run type-check"`, `"pre-push": "bun run check"`
- [x] 6.3 Добавить в `package.json` секцию `"lint-staged"`: Biome применяется ко всем релевантным файлам, `vitest related` запускается только на `.ts`/`.tsx` — иначе vitest пытается обрабатывать `.md`/`.json` файлы, что не имеет смысла
- [x] 6.4 Добавить `postinstall`-скрипт: `"postinstall": "simple-git-hooks"`
- [x] 6.5 Добавить script `"type-check": "tsc --noEmit"`
- [x] 6.6 Проверить руками: коммит с явной ошибкой линтера блокируется; auto-fix добавляет правки в индекс; pre-push гоняет полный `check` (хуки установлены: `.git/hooks/pre-commit` и `.git/hooks/pre-push` присутствуют)

## 7. Makefile и универсальный check

- [x] 7.1 Создать новый `Makefile` с целями: `init`, `run`, `format`, `lint`, `type-check`, `test`, `test-e2e`, `check`, `build`, `clean`
- [x] 7.2 `make init`: `bun install && bunx playwright install --with-deps chromium` (плюс мягкое предупреждение об отсутствии rustup)
- [x] 7.3 `make run`: `bun run tauri dev` (см. задачу 9)
- [x] 7.4 `make check`: `bun run format:check && bun run lint && bun run type-check && bun run test && bun run test:e2e`
- [x] 7.5 `make build`: `bun run tauri build`
- [x] 7.6 `make clean`: удалить `dist/`, `coverage/`, `src-tauri/target/`, `playwright-report/`, `test-results/`, `.vite/`
- [x] 7.7 Соответствующие npm-scripts в `package.json`, чтобы Makefile и `bun run` были эквивалентны

## 8. CI на GitHub Actions

- [x] 8.1 Создать `.github/workflows/ci.yml` на каждый push и PR
- [x] 8.2 Шаги: checkout → setup-bun (через `oven-sh/setup-bun@v2`) → кэш `node_modules` и `~/.bun` → `bun install --frozen-lockfile` → отдельные `name`'d-шаги для `format:check`, `lint`, `type-check`, `test`, `test:e2e`
- [x] 8.3 Установить `chromium` для Playwright в CI (`bunx playwright install --with-deps chromium`)
- [x] 8.4 Сохранять артефакты: `coverage/`, `playwright-report/` (в случае падения e2e)
- [x] 8.5 Удалить старый Python-workflow, если он есть в `.github/workflows/` (был только `dependabot.yml` в `.github/` — он остаётся, других Python-специфичных workflow не было)

## 9. Tauri 2 scaffold

- [x] 9.1 Установить devDependency `@tauri-apps/cli`
- [x] 9.2 Проверить, что у разработчика установлен Rust stable (`rustup --version`); добавить эту проверку в `make init` как мягкое предупреждение
- [x] 9.3 Инициализировать Tauri: `bunx tauri init` со значениями: app name `Obsidian Mind`, window title `Obsidian Mind`, dev URL `http://localhost:5173`, dist dir `../dist`, frontend dev cmd `bun run dev`, frontend build cmd `bun run build`
- [x] 9.4 Проверить наличие `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- [x] 9.5 Добавить scripts: `"tauri": "tauri"`, `"tauri:dev": "tauri dev"`, `"tauri:build": "tauri build"`
- [x] 9.6 Проверить: `cargo check --manifest-path src-tauri/Cargo.toml` успешно компилирует `app`-крейт. Полный `bun run tauri dev` (открытие окна) — ручная финальная проверка в задаче 15.2
- [x] 9.7 Внести `src-tauri/target/` и `src-tauri/gen/` в `.gitignore` (записаны в корневом и сгенерированном `src-tauri/.gitignore`)

## 10. Доменный слой (graph)

- [x] 10.1 Создать `src/domain/types.ts`: типы `NodeId`, `EdgeId`, `Node` (→ `MindNode`), `Edge` (→ `MindEdge`), `Graph` (переименованы во избежание коллизий с DOM-`Node` и React Flow `Edge`)
- [x] 10.2 Создать `src/domain/graph.ts` с чистыми функциями: `createEmpty()`, `addRoot(graph, { position })`, `addChild(graph, { parentId, position })`, `removeSubtree(graph, { nodeId })`, `updateText(graph, { nodeId, text })`, `moveNode(graph, { nodeId, position })`
- [x] 10.3 Создать `src/domain/integrity.ts`: функция `sanitize(graph)` — отбрасывает рёбра, ссылающиеся на несуществующие узлы (на случай повреждённого хранилища)
- [x] 10.4 Написать unit-тесты `src/domain/graph.test.ts` и `src/domain/integrity.test.ts` — покрыть 100% веток

## 11. Persistence-слой (IndexedDB)

- [x] 11.1 Создать `src/persistence/db.ts`: открытие/создание базы `mindmap` версии `1`, object store `graph`
- [x] 11.2 Создать `src/persistence/repository.ts`: `loadGraph(): Promise<Graph | null>`, `saveGraph(graph: Graph): Promise<void>`; формат записи `{ version: 1, nodes, edges, updatedAt: Date.now() }`
- [x] 11.3 Создать `src/persistence/debounced-saver.ts`: дебаунс 250 мс, `flush()` для синхронной записи перед выгрузкой (через цепочку Promise — `flush()` дожидается всех уже выпущенных save'ов)
- [x] 11.4 Подписаться на `beforeunload` (web) и Tauri `close-requested` — реализована универсальная подписка `bindUnloadFlush` на `beforeunload` + `pagehide`; Tauri webview эмитит `beforeunload`/`pagehide` при закрытии окна на всех платформах, отдельная Tauri-IPC-подписка не требуется в этой версии
- [x] 11.5 При загрузке вызывать `sanitize()` из доменного слоя
- [x] 11.6 Написать тесты с `fake-indexeddb` (devDependency) — покрыть 100%, включая ветки повреждённого графа

## 12. Стор приложения (zustand)

- [x] 12.1 Создать `src/store/mindmap-store.ts`: state `{ graph, selectedNodeId, editingNodeId }`, actions `loadFromStorage`, `addRoot`, `addChild`, `removeSubtree`, `updateText`, `moveNode`, `selectNode`, `startEditing`, `stopEditing`
- [x] 12.2 Связать стор с `debounced-saver`: каждая мутация графа запускает дебаунс-сохранение
- [x] 12.3 Написать тесты на стор: каждая action и её эффект на хранилище

## 13. UI-компоненты

- [x] 13.1 Создать `src/components/CloudNode/CloudNode.tsx` — кастомная нода `@xyflow/react`: скруглённый прямоугольник, тень, текст по центру, состояние редактирования (input), кнопки «+» на левой и правой гранях (видны при hover/selected), рёбра подключаются к ближайшим к ребёнку handle-точкам
- [x] 13.2 Создать `src/components/CloudNode/CloudNode.module.css` со стилями (минимальная ширина 120 px, максимальная 360 px, перенос по словам, тень, скругление, состояния hover/selected/editing)
- [x] 13.3 Создать `src/components/Canvas/Canvas.tsx` — обёртка `<ReactFlow>`: регистрация типа ноды `cloud`, обработчики `onPaneDoubleClick` (создание корневого узла), `onNodeClick` (выделение), `onPaneClick` (снятие выделения), `onNodesChange` (для drag), key handlers (Delete, Enter, F2, Escape)
- [x] 13.4 Подключить `Canvas` в `App.tsx`, вызвать `loadFromStorage()` в `useEffect` при маунте
- [x] 13.5 Написать компонентные тесты для `CloudNode` (рендер с разным текстом, состояния editing/selected) и `Canvas` (создание корня двойным кликом, создание ребёнка по «+», удаление по Delete, drag через `user-event`) — покрытие 100%

## 14. Документация

- [x] 14.1 Переписать `README.md`: цель проекта, стек, быстрый старт (`make init`, `make run`, `make check`), требования к окружению (bun, rustup), статус MVP
- [x] 14.2 Переписать `CLAUDE.md`: golden rules сохранить, обновить команды на bun-стек, переписать раздел архитектуры под React/TS/Tauri/IDB
- [x] 14.3 Удалить `.claude/rules/python.md`
- [x] 14.4 Создать `.claude/rules/typescript.md` с `globs: ["**/*.ts", "**/*.tsx"]`: правила именования, импортов, типов, обращения с `unknown`/`never`, запрет `any` и `!`-non-null
- [x] 14.5 Создать `.claude/rules/react.md` с `globs: ["**/*.tsx"]`: правила хуков (deps, top-level), композиция компонентов, CSS Modules, пропсы только через типы, отсутствие `useEffect`-злоупотреблений
- [x] 14.6 Создать `.claude/rules/tauri.md` с `globs: ["src-tauri/**/*.rs", "**/tauri.conf.json"]`: правила для Rust-стороны, оформление команд, безопасность IPC
- [x] 14.7 Создать `.claude/rules/tests.md` с `globs: ["**/*.test.{ts,tsx}", "tests/**/*.ts"]`: правила Vitest, `@testing-library/react`, Playwright, 100% coverage, никаких `it.skip` без причины в комментарии
- [x] 14.8 Обновить `.claude/rules/docs.md` под новую структуру `docs/` (см. ниже)
- [x] 14.9 Сохранить `.claude/rules/openspec.md` без изменений
- [x] 14.10 Перестроить `docs/`: `docs/README.md` (индекс), `docs/architecture.md` (слои фронта + Tauri), `docs/frontend.md` (компоненты, стор, стили), `docs/storage.md` (схема IndexedDB), `docs/decisions/2026-05-27_initial-stack.md` (фиксация выбора стека)

## 16. Undo/redo, фиксы ввода и справка по горячим клавишам

- [x] 16.1 Стор: история `past`/`future` (кап 100), склейка серии правок текста / drag в один шаг, pending-транзакция для свежих нод (создание+имя = один шаг, брошенный пустой узел не пишется), действия `undo` / `redo` / `endCoalescing`
- [x] 16.2 Canvas: шорткаты `Cmd/Ctrl+Z` (undo) и `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` (redo) в `handleCanvasKeyDown`; вызов `endCoalescing` на завершении drag (`dragging === false`)
- [x] 16.3 Canvas: `disableKeyboardA11y` (стрелки не двигают узел), `nodesFocusable={false}` и `initialWidth`/`initialHeight` для узлов (узел виден с первого кадра, иначе автофокус инпута срывается в `<body>` и теряет первые символы) на `<ReactFlow>`; e2e-тест на немедленный ввод и удаление пустого узла
- [x] 16.4 Canvas: `Enter` на корневом узле ничего не создаёт (`createSiblingOf` — ранний выход для `parentId === null`)
- [x] 16.5 Компонент `HotkeysHelp`: кнопка «?» в углу канваса, панель со списком шорткатов, закрытие по повторному клику / клику вне / `Escape` (без снятия выделения)
- [x] 16.6 Тесты (100%): стор (undo/redo, склейка, pending, кап, no-op move), Canvas (шорткаты, `endCoalescing`, Enter-на-корне, пропы), `HotkeysHelp`
- [x] 16.7 Обновить `docs/frontend.md` (история стора, фиксы React Flow, `HotkeysHelp`) и раздел «Статус MVP» в `README.md`
- [x] 16.8 `openspec validate init-mindmap-spa --strict` — без ошибок
- [x] 16.9 Центрирование контента при изменении размера окна (`fitView` на `resize`)
- [x] 16.10 Выравнивание дерева при перетаскивании: `dropNode` (финальная позиция + `layout`) на отпускании; перетаскивание ветки на другую сторону корня переносит её поддерево туда
- [x] 16.11 `Cmd/Ctrl+Enter` создаёт дочерний узел (вместо `Shift+Enter`), работает и при выделении, и в редакторе (commit + ребёнок); стор-экшен `addChildOf`
- [x] 16.12 Перетаскивание переупорядочивает соседей одного родителя (раскладка сортирует детей по `y`)
- [x] 16.13 Буфер обмена: `Cmd/Ctrl+C/X` копировать/вырезать поддерево, `Cmd/Ctrl+V` вставить как дочернее; домен `extractSubtree`/`pasteSubtree`, стор `copyNode`/`cutNode`/`pasteInto`
- [x] 16.14 Перепривязка перетаскиванием на узел: подсветка цели (`dropTargetId`, `findDropTarget`), `reparentSubtree` с защитой от цикла, стор `reparent`/`setDropTarget`, обработчики `handleNodeDrag`/`handleNodeDragStop`

## 15. Финальная проверка

- [x] 15.1 Запустить `make check` локально — должно быть зелёным, coverage 100%
- [ ] 15.2 Запустить `bun run tauri dev` — открыть окно, создать пару корневых узлов, создать у одного из них ребёнка, отредактировать текст, перетащить, удалить, перезапустить — убедиться, что граф восстановился
- [ ] 15.3 Запушить ветку, убедиться, что GitHub Actions зелёный
- [x] 15.4 Прогнать `openspec validate init-mindmap-spa --strict` — без ошибок
