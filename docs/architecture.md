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

`src-tauri/` — Rust-крейт `app_lib`, точка входа — `src-tauri/src/main.rs` → `app_lib::run()` в `lib.rs`. В нём `tauri::Builder::default()` + подключение `tauri-plugin-log` в debug и `tauri-plugin-window-state` (только desktop, под `#[cfg(desktop)]`). Кастомных команд (`#[tauri::command]`) нет.

`tauri-plugin-window-state` автоматически сохраняет размер и положение окна при выходе и восстанавливает их при следующем запуске. Первый запуск использует размеры из `tauri.conf.json` (`width`/`height`); дальше окно открывается в последнем заданном пользователем размере. Требует разрешения `window-state:default` в `src-tauri/capabilities/default.json`.

`src-tauri/tauri.conf.json` описывает окно (стартовые размеры), dev-URL (`http://localhost:5173`) и команды `beforeDevCommand` / `beforeBuildCommand`, проксирующие в `bun run dev` / `bun run build`.

Работа с файлами на диске пользователя планируется отдельным change — там появятся первые команды и `docs/architecture.md` обновится разделом про IPC-контракт. Правила для будущего Rust-кода — в [`.claude/rules/tauri.md`](../.claude/rules/tauri.md).

## Конфигурация и окружение

`.env` для приложения не требуется. Все настройки лежат в файлах:

- `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- `biome.json` — линтер и форматтер.
- `vite.config.ts` — сборщик.
- `vitest.config.ts` — юнит/компонентные тесты с порогом покрытия 100%.
- `playwright.config.ts` — e2e против `bun run preview` на порту 4173.
- `src-tauri/tauri.conf.json` — окно, dev URL, build-команды Tauri.
- `src-tauri/capabilities/default.json` — capabilities Tauri.
