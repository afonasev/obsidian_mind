# Архитектура

Приложение — SPA на React 19 + TypeScript, упакованное в Tauri 2 как desktop. Хранение данных — локальное, в IndexedDB браузерного webview.

## Слои фронта

Код в `src/` разделён на четыре слоя. Зависимости — строго в одну сторону.

```
components ──▶ store ──▶ persistence
                  │
                  └────▶ domain
persistence ──▶ domain
```

| Слой               | Путь              | Что внутри                                                                                                                                              | Что НЕ знает          |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `domain/`          | `src/domain/`     | Чистые типы (`MindNode`, `MindEdge`, `Graph`, `Position`) и функции графа: `createEmpty`, `addRoot`, `addChild`, `removeSubtree`, `updateText`, `moveNode`, `sanitize`. | React, IDB, Tauri.    |
| `persistence/`     | `src/persistence/`| Открытие IndexedDB-базы `mindmap` v1, `loadGraph` / `saveGraph`, `createDebouncedSaver` (250 мс), `bindUnloadFlush`.                                     | React, стор.          |
| `store/`           | `src/store/`      | `zustand`-стор `createMindMapStore`, синглтон `mindMapStore`, хук `useMindMapStore`, `bindSaver` для связи мутаций графа с дебаунс-сейвером.            | DOM, рендер.          |
| `components/`      | `src/components/` | React-компоненты UI. Появятся в текущем change на этапе UI-слоя (`Canvas`, `CloudNode`). Читают и мутируют граф только через стор.                       | IDB напрямую, Tauri.  |

Подробности UI — в [`frontend.md`](./frontend.md), хранилища — в [`storage.md`](./storage.md).

## Потоки данных

### Старт приложения

1. `src/main.tsx` создаёт React-root и рендерит `App`.
2. На маунте компонент UI-слоя вызовет `mindMapStore.getState().loadFromStorage()`.
3. `loadFromStorage` идёт в `persistence/repository.ts → loadGraph()` → открывает IndexedDB, читает запись `current` из object store `graph`, прогоняет через `domain/integrity.ts → sanitize` (отбрасывает рёбра, ссылающиеся на несуществующие узлы) и кладёт `Graph` в стор.
4. Канвас подписан на стор через `useMindMapStore` и отрисовывает узлы / рёбра.

### Мутация графа

1. Пользователь делает действие (создаёт узел, редактирует текст, перетаскивает) → компонент вызывает экшн стора (`addRoot`, `addChild`, `updateText`, `moveNode`, `removeSubtree`).
2. Экшн вызывает чистую функцию из `domain/graph.ts`, получает новый `Graph`, кладёт в стор.
3. `bindSaver` подписан на стор и при изменении ссылки `graph` вызывает `saver.schedule(graph)`.
4. `createDebouncedSaver` копит мутации в окне 250 мс, по таймауту вызывает `saveGraph` → запись в IndexedDB (`{ version: 1, nodes, edges, updatedAt: Date.now() }`).
5. При закрытии окна `bindUnloadFlush` ловит `beforeunload` / `pagehide` и форсирует синхронный flush — последняя мутация не теряется.

## Desktop-обёртка: Tauri

`src-tauri/` — Rust-крейт `app_lib`, точка входа — `src-tauri/src/main.rs` → `app_lib::run()` в `lib.rs`. В нём `tauri::Builder::default()` + подключение `tauri-plugin-log` в debug, `tauri-plugin-window-state` (только desktop, под `#[cfg(desktop)]`), `tauri-plugin-dialog` (системный диалог выбора папки) и регистрация FS-команд через `invoke_handler`.

`tauri-plugin-window-state` автоматически сохраняет размер и положение окна при выходе и восстанавливает их при следующем запуске. Первый запуск использует размеры из `tauri.conf.json` (`width`/`height`); дальше окно открывается в последнем заданном пользователем размере. Требует разрешения `window-state:default` в `src-tauri/capabilities/default.json`.

`src-tauri/tauri.conf.json` описывает окно (стартовые размеры), dev-URL (`http://localhost:5173`) и команды `beforeDevCommand` / `beforeBuildCommand`, проксирующие в `bun run dev` / `bun run build`. CSP — `null` (сетевого I/O нет).

### IPC: файловый мост к vault

Источник правды для контента — выбранная пользователем директория-**vault** в обычной ФС. Доступ к ней идёт через узкий набор типизированных Rust-команд в `src-tauri/src/fs_commands.rs`, зарегистрированных в `lib.rs`:

| Команда         | Аргументы                          | Возврат                              |
| --------------- | ---------------------------------- | ------------------------------------ |
| `fs_read_dir`   | `vault_root`, `rel_path`           | `Vec<DirEntry>` — рекурсивное дерево `{ name, rel_path, is_dir }` |
| `fs_read_text`  | `vault_root`, `rel_path`           | `String` (UTF-8)                     |
| `fs_write_text` | `vault_root`, `rel_path`, `contents` | `()`                               |
| `fs_create_dir` | `vault_root`, `rel_path`           | `()` (`create_dir_all`)              |
| `fs_remove`     | `vault_root`, `rel_path`           | `()` (рекурсивно для каталога)       |
| `fs_rename`     | `vault_root`, `from_rel`, `to_rel` | `()`                                 |

**Модель confinement.** Корень vault не живёт в managed-state процесса (правило `tauri.md`): каждая команда принимает `vault_root` как параметр и путь(и) **относительно** него. Хелпер `resolve_within` до любого сайд-эффекта канонизирует корень (иначе `InvalidVaultRoot`), резолвит относительный путь, для существующих целей канонизирует цель, для создаваемых — родителя, и проверяет, что канонический результат — потомок корня. Иначе — `AppError::PathEscape`. Это закрывает `..`, абсолютные пути и симлинки наружу (за симлинком из vault не следуем).

**Ошибки.** Команды возвращают `Result<T, AppError>`. `AppError` — `enum` (`Serialize + thiserror::Error`), сериализуется adjacently-tagged по полю `kind`: `PathEscape`, `NotFound`, `Io` (несёт `message`), `NotUtf8`, `InvalidVaultRoot`. Фронт различает кейсы по `kind`, а не парсит строку.

**Фронт-мост.** `src/vault/fs-bridge.ts` — типизированные `invoke<T>`-врапперы (camelCase-аргументы Tauri авто-мапит в snake_case Rust-параметры) + `selectVaultDirectory()` через `tauri-plugin-dialog`. `isTauri()` детектит наличие `window.__TAURI_INTERNALS__`; без Tauri (web-сборка, `bun run preview`, Playwright) врапперы не вызывают `invoke`, а отклоняются типизированной `VaultFsError` с `source: "noFilesystem"` — приложение остаётся в состоянии «нет vault» и не падает. Путь активного vault хранится как app-pref в IndexedDB (`loadLastVaultPath` / `saveLastVaultPath` в `persistence/repository.ts`), не внутри самого vault.

Capability диалога — минимальная: `dialog:allow-open` в `src-tauri/capabilities/default.json` (без wildcard). Правила Rust-кода — в [`.claude/rules/tauri.md`](../.claude/rules/tauri.md).

## Конфигурация и окружение

`.env` для приложения не требуется. Все настройки лежат в файлах:

- `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- `biome.json` — линтер и форматтер.
- `vite.config.ts` — сборщик.
- `vitest.config.ts` — юнит/компонентные тесты с порогом покрытия 100%.
- `playwright.config.ts` — e2e против `bun run preview` на порту 4173.
- `src-tauri/tauri.conf.json` — окно, dev URL, build-команды Tauri.
- `src-tauri/capabilities/default.json` — capabilities Tauri.
