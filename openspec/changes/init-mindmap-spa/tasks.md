## 1. Очистка Python-скелета

- [ ] 1.1 Удалить файлы: `pyproject.toml`, `.python-version`, `.pre-commit-config.yaml`, `.coverage`, `.pytest_cache/`, `src/logging_setup.py`, `src/__pycache__/`, `.claude/rules/python.md`
- [ ] 1.2 Удалить пустой `tests/` (создадим заново под Playwright)
- [ ] 1.3 Очистить старый `Makefile` (перепишем в задаче 7.1)
- [ ] 1.4 Обновить `.gitignore` под Node/TS/Tauri-стек (`node_modules/`, `dist/`, `coverage/`, `src-tauri/target/`, `.vite/`, `playwright-report/`, `test-results/`)
- [ ] 1.5 Закоммитить удаление отдельным коммитом (для лёгкого rollback)

## 2. Базовый scaffold React + Vite + TS

- [ ] 2.1 Создать `package.json` с полем `name: "obsidian-mind"`, `private: true`, секциями `scripts`, `dependencies`, `devDependencies`
- [ ] 2.2 Установить dev-зависимости: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`
- [ ] 2.3 Установить runtime-зависимости: `react`, `react-dom`, `@xyflow/react`, `idb`, `zustand`
- [ ] 2.4 Создать `tsconfig.json` со строгими настройками: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`, `module: "ESNext"`, `target: "ES2022"`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`
- [ ] 2.5 Создать `vite.config.ts` с `@vitejs/plugin-react` и алиасом `@` → `./src` (если потребуется)
- [ ] 2.6 Создать `index.html` в корне (Vite default), `src/main.tsx` (entry), `src/App.tsx` (заглушка с текстом)
- [ ] 2.7 Проверить: `bun install` ставит зависимости, `bun run dev` поднимает Vite на `http://localhost:5173`

## 3. Конфигурация Biome (строгая)

- [ ] 3.1 Установить `@biomejs/biome` в devDependencies
- [ ] 3.2 Создать `biome.json`: `linter.rules.recommended: true`, явно поднять до `error` правила `noExplicitAny`, `noUnusedImports`, `noUnusedVariables`, `useExhaustiveDependencies`, `useHookAtTopLevel`, `noNonNullAssertion`, `noConsole`; включить группы `correctness`, `suspicious`, `complexity`, `style`, `performance`, `a11y`, `security` в `error`
- [ ] 3.3 Настроить форматтер: `lineWidth: 100`, `indentStyle: "space"`, `indentWidth: 2`, `quoteStyle: "double"`, `semicolons: "always"`, `trailingCommas: "all"`, `arrowParentheses: "always"`
- [ ] 3.4 Включить `organizeImports`
- [ ] 3.5 Добавить scripts в `package.json`: `"format": "biome format --write"`, `"format:check": "biome format --error-on-warnings"`, `"lint": "biome lint --error-on-warnings"`, `"lint:fix": "biome lint --write"`, `"check:biome": "biome check --error-on-warnings"`
- [ ] 3.6 Проверить: `bun run lint` и `bun run format:check` проходят на текущем коде

## 4. Vitest + покрытие 100%

- [ ] 4.1 Установить devDependencies: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- [ ] 4.2 Создать `vitest.config.ts`: `environment: "jsdom"`, `setupFiles: ["./src/test-setup.ts"]`, `coverage.provider: "v8"`, `coverage.thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 }`, `coverage.thresholdAutoUpdate: false`
- [ ] 4.3 Настроить `coverage.exclude`: `src/main.tsx`, `**/*.d.ts`, `**/*.test.{ts,tsx}`, `tests/**`, `*.config.{ts,js}`, `src-tauri/**`, `dist/**`, `coverage/**`
- [ ] 4.4 Создать `src/test-setup.ts` с импортом `@testing-library/jest-dom/vitest`
- [ ] 4.5 Добавить scripts: `"test": "vitest run --coverage"`, `"test:watch": "vitest"`
- [ ] 4.6 Написать smoke-тест на `App` (`src/App.test.tsx`), проверить, что `bun run test` зелёный и coverage = 100%

## 5. Playwright e2e

- [ ] 5.1 Установить devDependency: `@playwright/test`
- [ ] 5.2 Запустить `bunx playwright install --with-deps chromium` (в CI и локально)
- [ ] 5.3 Создать `playwright.config.ts`: `testDir: "tests"`, `webServer: { command: "bun run preview", port: 4173, reuseExistingServer: !process.env.CI }`, проекты — chromium
- [ ] 5.4 Добавить scripts: `"build": "vite build"`, `"preview": "vite preview --port 4173"`, `"test:e2e": "playwright test"`
- [ ] 5.5 Написать smoke e2e-тест `tests/smoke.spec.ts`: открыть `/`, увидеть пустой канвас

## 6. Git-хуки (simple-git-hooks + lint-staged)

- [ ] 6.1 Установить devDependencies: `simple-git-hooks`, `lint-staged`
- [ ] 6.2 Добавить в `package.json` секцию `"simple-git-hooks"`: `"pre-commit": "bunx lint-staged && bun run type-check"`, `"pre-push": "bun run check"`
- [ ] 6.3 Добавить в `package.json` секцию `"lint-staged"`: `"*.{ts,tsx,js,json,jsonc,md}": ["biome check --write --error-on-warnings", "vitest related --run --coverage"]`
- [ ] 6.4 Добавить `postinstall`-скрипт: `"postinstall": "simple-git-hooks"`
- [ ] 6.5 Добавить script `"type-check": "tsc --noEmit"`
- [ ] 6.6 Проверить руками: коммит с явной ошибкой линтера блокируется; auto-fix добавляет правки в индекс; pre-push гоняет полный `check`

## 7. Makefile и универсальный check

- [ ] 7.1 Создать новый `Makefile` с целями: `init`, `run`, `format`, `lint`, `type-check`, `test`, `test-e2e`, `check`, `build`, `clean`
- [ ] 7.2 `make init`: `bun install && bunx playwright install --with-deps chromium`
- [ ] 7.3 `make run`: `bun run tauri dev` (см. задачу 9)
- [ ] 7.4 `make check`: `bun run format:check && bun run lint && bun run type-check && bun run test && bun run test:e2e`
- [ ] 7.5 `make build`: `bun run tauri build`
- [ ] 7.6 `make clean`: удалить `dist/`, `coverage/`, `src-tauri/target/`, `playwright-report/`, `test-results/`, `.vite/`
- [ ] 7.7 Соответствующие npm-scripts в `package.json`, чтобы Makefile и `bun run` были эквивалентны

## 8. CI на GitHub Actions

- [ ] 8.1 Создать `.github/workflows/ci.yml` на каждый push и PR
- [ ] 8.2 Шаги: checkout → setup-bun (через `oven-sh/setup-bun@v2`) → кэш `node_modules` и `~/.bun` → `bun install --frozen-lockfile` → отдельные `name`'d-шаги для `format:check`, `lint`, `type-check`, `test`, `test:e2e`
- [ ] 8.3 Установить `chromium` для Playwright в CI (`bunx playwright install --with-deps chromium`)
- [ ] 8.4 Сохранять артефакты: `coverage/`, `playwright-report/` (в случае падения e2e)
- [ ] 8.5 Удалить старый Python-workflow, если он есть в `.github/workflows/`

## 9. Tauri 2 scaffold

- [ ] 9.1 Установить devDependency `@tauri-apps/cli`
- [ ] 9.2 Проверить, что у разработчика установлен Rust stable (`rustup --version`); добавить эту проверку в `make init` как мягкое предупреждение
- [ ] 9.3 Инициализировать Tauri: `bunx tauri init` со значениями: app name `Obsidian Mind`, window title `Obsidian Mind`, dev URL `http://localhost:5173`, dist dir `../dist`, frontend dev cmd `bun run dev`, frontend build cmd `bun run build`
- [ ] 9.4 Проверить наличие `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- [ ] 9.5 Добавить scripts: `"tauri": "tauri"`, `"tauri:dev": "tauri dev"`, `"tauri:build": "tauri build"`
- [ ] 9.6 Проверить: `bun run tauri dev` поднимает Vite + нативное окно с приложением
- [ ] 9.7 Внести `src-tauri/target/` и `src-tauri/gen/` в `.gitignore`

## 10. Доменный слой (graph)

- [ ] 10.1 Создать `src/domain/types.ts`: типы `NodeId`, `EdgeId`, `Node`, `Edge`, `Graph`
- [ ] 10.2 Создать `src/domain/graph.ts` с чистыми функциями: `createEmpty()`, `addRoot(graph, { position })`, `addChild(graph, { parentId, position })`, `removeSubtree(graph, { nodeId })`, `updateText(graph, { nodeId, text })`, `moveNode(graph, { nodeId, position })`
- [ ] 10.3 Создать `src/domain/integrity.ts`: функция `sanitize(graph)` — отбрасывает рёбра, ссылающиеся на несуществующие узлы (на случай повреждённого хранилища)
- [ ] 10.4 Написать unit-тесты `src/domain/graph.test.ts` и `src/domain/integrity.test.ts` — покрыть 100% веток

## 11. Persistence-слой (IndexedDB)

- [ ] 11.1 Создать `src/persistence/db.ts`: открытие/создание базы `mindmap` версии `1`, object store `graph`
- [ ] 11.2 Создать `src/persistence/repository.ts`: `loadGraph(): Promise<Graph | null>`, `saveGraph(graph: Graph): Promise<void>`; формат записи `{ version: 1, nodes, edges, updatedAt: Date.now() }`
- [ ] 11.3 Создать `src/persistence/debounced-saver.ts`: дебаунс 250 мс, `flush()` для синхронной записи перед выгрузкой
- [ ] 11.4 Подписаться на `beforeunload` (web) и Tauri `close-requested` (если доступно) для финального flush
- [ ] 11.5 При загрузке вызывать `sanitize()` из доменного слоя
- [ ] 11.6 Написать тесты с `fake-indexeddb` (devDependency) — покрыть 100%, включая ветки повреждённого графа

## 12. Стор приложения (zustand)

- [ ] 12.1 Создать `src/store/mindmap-store.ts`: state `{ graph, selectedNodeId, editingNodeId }`, actions `loadFromStorage`, `addRoot`, `addChild`, `removeSubtree`, `updateText`, `moveNode`, `selectNode`, `startEditing`, `stopEditing`
- [ ] 12.2 Связать стор с `debounced-saver`: каждая мутация графа запускает дебаунс-сохранение
- [ ] 12.3 Написать тесты на стор: каждая action и её эффект на хранилище

## 13. UI-компоненты

- [ ] 13.1 Создать `src/components/CloudNode/CloudNode.tsx` — кастомная нода `@xyflow/react`: скруглённый прямоугольник, тень, текст по центру, состояние редактирования (input), кнопка «+» на правой грани (видна при hover/selected)
- [ ] 13.2 Создать `src/components/CloudNode/CloudNode.module.css` со стилями (минимальная ширина 120 px, максимальная 360 px, перенос по словам, тень, скругление, состояния hover/selected/editing)
- [ ] 13.3 Создать `src/components/Canvas/Canvas.tsx` — обёртка `<ReactFlow>`: регистрация типа ноды `cloud`, обработчики `onPaneDoubleClick` (создание корневого узла), `onNodeClick` (выделение), `onPaneClick` (снятие выделения), `onNodesChange` (для drag), key handlers (Delete, Enter, F2, Escape)
- [ ] 13.4 Подключить `Canvas` в `App.tsx`, вызвать `loadFromStorage()` в `useEffect` при маунте
- [ ] 13.5 Написать компонентные тесты для `CloudNode` (рендер с разным текстом, состояния editing/selected) и `Canvas` (создание корня двойным кликом, создание ребёнка по «+», удаление по Delete, drag через `user-event`) — покрытие 100%

## 14. Документация

- [ ] 14.1 Переписать `README.md`: цель проекта, стек, быстрый старт (`make init`, `make run`, `make check`), требования к окружению (bun, rustup), статус MVP
- [ ] 14.2 Переписать `CLAUDE.md`: golden rules сохранить, обновить команды на bun-стек, переписать раздел архитектуры под React/TS/Tauri/IDB
- [ ] 14.3 Удалить `.claude/rules/python.md`
- [ ] 14.4 Создать `.claude/rules/typescript.md` с `globs: ["**/*.ts", "**/*.tsx"]`: правила именования, импортов, типов, обращения с `unknown`/`never`, запрет `any` и `!`-non-null
- [ ] 14.5 Создать `.claude/rules/react.md` с `globs: ["**/*.tsx"]`: правила хуков (deps, top-level), композиция компонентов, CSS Modules, пропсы только через типы, отсутствие `useEffect`-злоупотреблений
- [ ] 14.6 Создать `.claude/rules/tauri.md` с `globs: ["src-tauri/**/*.rs", "**/tauri.conf.json"]`: правила для Rust-стороны, оформление команд, безопасность IPC
- [ ] 14.7 Создать `.claude/rules/tests.md` с `globs: ["**/*.test.{ts,tsx}", "tests/**/*.ts"]`: правила Vitest, `@testing-library/react`, Playwright, 100% coverage, никаких `it.skip` без причины в комментарии
- [ ] 14.8 Обновить `.claude/rules/docs.md` под новую структуру `docs/` (см. ниже)
- [ ] 14.9 Сохранить `.claude/rules/openspec.md` без изменений
- [ ] 14.10 Перестроить `docs/`: `docs/README.md` (индекс), `docs/architecture.md` (слои фронта + Tauri), `docs/frontend.md` (компоненты, стор, стили), `docs/storage.md` (схема IndexedDB), `docs/decisions/2026-05-27_initial-stack.md` (фиксация выбора стека)

## 15. Финальная проверка

- [ ] 15.1 Запустить `make check` локально — должно быть зелёным, coverage 100%
- [ ] 15.2 Запустить `bun run tauri dev` — открыть окно, создать пару корневых узлов, создать у одного из них ребёнка, отредактировать текст, перетащить, удалить, перезапустить — убедиться, что граф восстановился
- [ ] 15.3 Запушить ветку, убедиться, что GitHub Actions зелёный
- [ ] 15.4 Прогнать `openspec validate init-mindmap-spa --strict` — без ошибок
