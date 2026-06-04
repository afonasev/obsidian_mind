# project-skeleton Specification

## Purpose

Каркас репозитория под стек React + TypeScript + Tauri 2 + bun: фиксированная структура, строгие конфигурации Biome / TypeScript / Vitest, git-хуки, Makefile, CI и согласованная документация.

## Requirements

### Requirement: Структура репозитория

Репозиторий SHALL иметь фиксированную структуру верхнего уровня, отражающую стек React + TypeScript + Tauri 2 + bun.

#### Scenario: Наличие обязательных артефактов в корне

- **WHEN** разработчик клонирует репозиторий
- **THEN** в корне присутствуют: `src/` (React + TS), `src-tauri/` (Rust shell), `tests/` (Playwright e2e), `docs/`, `openspec/`, `.claude/`, `.github/workflows/`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `biome.json`, `playwright.config.ts`, `Makefile`, `README.md`, `CLAUDE.md`

#### Scenario: Удалённый Python-скелет

- **WHEN** разработчик клонирует репозиторий
- **THEN** в нём отсутствуют: `pyproject.toml`, `.python-version`, `.pre-commit-config.yaml` (Python-формат), `.pytest_cache/`, `.coverage`, `src/logging_setup.py`, `.claude/rules/python.md`

### Requirement: Менеджер пакетов — bun

Все команды установки, сборки, запуска и тестирования SHALL использовать `bun` как менеджер пакетов и task-runner. В репозитории MUST присутствовать `bun.lockb` (lock-файл `bun`), `package-lock.json` и `pnpm-lock.yaml` отсутствуют.

#### Scenario: Установка зависимостей

- **WHEN** разработчик выполняет `bun install` в корне репозитория
- **THEN** ставятся все зависимости из `package.json` и `bun.lockb`, версии фиксируются по lock-файлу, выполняется `postinstall`-скрипт установки git-хуков

### Requirement: Строгая конфигурация Biome

Biome SHALL быть настроен в режиме, не допускающем пропуск проблем: правила `recommended` включены, дополнительно все группы (`correctness`, `suspicious`, `complexity`, `style`, `performance`, `a11y`, `security`) активны в режиме `error`. Линтер и форматтер MUST падать на любом нарушении (`--error-on-warnings`).

#### Scenario: Линтер падает на предупреждении

- **WHEN** в коде присутствует нарушение правила, которое в `recommended`-конфигурации помечено как `warn` (например, `noExplicitAny`)
- **THEN** команда `bun run lint` завершается с ненулевым кодом возврата

#### Scenario: Форматтер ломает CI при незаформатированном файле

- **WHEN** в репозитории есть `.ts`-файл, который не соответствует правилам форматирования Biome
- **THEN** команда `bun run format:check` завершается с ненулевым кодом возврата

### Requirement: Строгая конфигурация TypeScript

`tsconfig.json` SHALL включать `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`. Тип-чек MUST проходить без ошибок и предупреждений.

#### Scenario: Доступ по индексу без проверки на undefined ломает сборку

- **WHEN** в коде написано `arr[0].foo` без guard'а на возможный `undefined`
- **THEN** `bun run type-check` завершается с ошибкой

### Requirement: 100% покрытие тестами

Vitest SHALL быть настроен с обязательным порогом покрытия 100% по метрикам `lines`, `functions`, `statements`, `branches`. Из подсчёта SHALL исключаться только: `src/main.tsx`, `**/*.d.ts`, `**/*.test.{ts,tsx}`, `tests/**`, конфиги `*.config.ts`, папка `src-tauri/**`.

#### Scenario: Падение coverage ломает тесты

- **WHEN** разработчик добавляет в исходный код функцию без покрытия и запускает `bun run test`
- **THEN** Vitest завершается с ошибкой из-за нарушения порога 100%

#### Scenario: Точка входа исключена корректно

- **WHEN** разработчик запускает `bun run test` сразу после первичного scaffold-а проекта
- **THEN** тесты проходят, coverage по непустым исходникам — 100%, исключения работают

### Requirement: Обязательный pre-commit hook

Репозиторий SHALL устанавливать git-хук `pre-commit` через `simple-git-hooks` + `lint-staged` автоматически при `bun install`. Хук на каждом коммите SHALL выполнять: автоформат и автофикс Biome на staged-файлах, повторную проверку линтером, полный тип-чек, запуск связанных Vitest-тестов с проверкой coverage.

#### Scenario: Pre-commit запускается автоматически

- **WHEN** разработчик впервые выполнил `bun install` и пытается сделать коммит с нарушением правил линтера
- **THEN** коммит блокируется, в выводе видны нарушения, после авто-фикса (где возможно) Biome добавляет изменения обратно в индекс

#### Scenario: Тип-чек ломает коммит

- **WHEN** в staged-файлах изменения, ломающие тип-чек проекта
- **THEN** `pre-commit` падает с ненулевым кодом, коммит не создаётся

### Requirement: Обязательный pre-push hook

Репозиторий SHALL устанавливать git-хук `pre-push`, запускающий полный набор проверок: `format:check`, `lint`, `type-check`, `test` (с coverage), `test:e2e`. Переменная окружения `SKIP_E2E=1` MAY использоваться для пропуска e2e локально, но в CI она не применяется.

#### Scenario: Pre-push блокирует пуш при падении проверки

- **WHEN** разработчик пытается `git push` в ветку, где `bun run test:e2e` падает
- **THEN** push блокируется, в выводе видна ошибка

### Requirement: Команды Makefile

`Makefile` SHALL предоставлять единые команды для типичных операций. Команды MUST просто проксировать в `bun run …`, чтобы CI и локальный воркфлоу были идентичны.

#### Scenario: Стандартный набор make-целей

- **WHEN** разработчик выполняет `make`
- **THEN** доступны цели: `init`, `run`, `check`, `format`, `lint`, `type-check`, `test`, `test-e2e`, `build`, `clean`. `make check` запускает форматтер-проверку, линтер, тип-чек, юнит-тесты с coverage и e2e — этот же набор используется в CI

### Requirement: CI pipeline в GitHub Actions

`.github/workflows/ci.yml` SHALL запускаться на каждый push и pull request. Pipeline SHALL содержать раздельные шаги: install (bun), `format:check`, `lint`, `type-check`, `test` (с coverage), `test:e2e`. Любой шаг с ненулевым кодом возврата MUST приводить к падению всего pipeline.

#### Scenario: Падение линтера ломает CI

- **WHEN** в pull request есть нарушение правил Biome
- **THEN** соответствующий шаг в Actions падает, статус PR — failed

### Requirement: Tauri scaffold

Папка `src-tauri/` SHALL содержать минимальный, рабочий Tauri 2 проект: `Cargo.toml`, `tauri.conf.json`, `src/main.rs` с пустым `tauri::Builder::default().run(...)`. Команда `bun run tauri dev` SHALL поднимать desktop-окно с приложением.

#### Scenario: Запуск через tauri dev

- **WHEN** разработчик с установленным Rust toolchain выполняет `bun run tauri dev`
- **THEN** запускается Vite dev-сервер и нативное окно webview, в окне работает то же приложение, что и в браузере

### Requirement: Документация согласована со стеком

`README.md`, `CLAUDE.md`, файлы в `.claude/rules/` и `docs/` SHALL описывать новый стек (React + TS + Tauri + bun + Biome + Vitest + Playwright). Документы Python-эпохи MUST быть удалены или переписаны.

#### Scenario: Правила линтера для нового стека присутствуют

- **WHEN** разработчик открывает `.claude/rules/`
- **THEN** там есть файлы `typescript.md`, `react.md`, `tauri.md`, `tests.md`; файла `python.md` нет; файлы `docs.md` и `openspec.md` обновлены под новый стек
