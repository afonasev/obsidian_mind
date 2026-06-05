# Хранилище

Граф каждого **пространства** (workspace) хранится в IndexedDB браузерного webview через тонкую промис-обёртку [`idb`](https://github.com/jakearchibald/idb). Никакого сервера / диска / синхронизации в этом change нет.

## Схема IndexedDB

| Поле | Значение |
| --- | --- |
| База | `mindmap` |
| Версия | `2` |
| Object store `graph` | граф пространства, ключ = `workspaceId` |
| Object store `workspaces` | метаданные пространств, ключ = `workspaceId` |
| Object store `meta` | синглтоны UI (активное пространство, состояние панели) |

Константы и типы записей — в `src/persistence/db.ts`:

```ts
export const DB_NAME = "mindmap";
export const DB_VERSION = 2;
export const GRAPH_STORE = "graph";
export const WORKSPACES_STORE = "workspaces";
export const META_STORE = "meta";
export const META_ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";
export const META_PANEL_COLLAPSED_KEY = "panelCollapsed";
export const META_COLLAPSED_ROOTS_KEY = "collapsedWorkspaceRoots";
export const META_EDITOR_COLLAPSED_KEY = "editorPanelCollapsed";
export const META_PANEL_WIDTH_KEY = "panelWidth";
export const META_EDITOR_WIDTH_KEY = "editorPanelWidth";

export interface StoredGraph {
  readonly version: 2;
  readonly nodes: unknown;
  readonly edges: unknown;
  readonly updatedAt: number;
}
```

- **`graph`** — одна запись `StoredGraph` на пространство под ключом `workspaceId` (раньше был фиксированный ключ `current` — один граф на приложение).
- **`workspaces`** — запись `Workspace { id, name, createdAt }` под ключом `id`. Порядок в списке = сортировка по `createdAt` (делается в `loadWorkspaces`).
- **`meta`** — значения под строковыми ключами-константами: `activeWorkspaceId: string | null`, `panelCollapsed: boolean`, `collapsedWorkspaceRoots: string[]` (id пространств, чьи списки корней свёрнуты в панели; отсутствие id = развёрнуто) `editorPanelCollapsed: boolean` (состояние правой панели-редактора; отсутствие ключа = развёрнута), а также `panelWidth: number` и `editorPanelWidth: number` (ширины левой и правой панелей в px; отсутствие ключа = ширина по умолчанию). Малы и пишутся немедленно (без дебаунса).

`nodes` / `edges` типизированы как `unknown` — это сознательно: данные приходят из внешнего источника (предыдущая сессия / повреждённая запись), и любой каст в `MindNode[]` без проверки был бы враньём типизатору. Преобразование в `Graph` идёт через `repository.toGraph` + `sanitize` (см. ниже).

Модель «граф на пространство» и отказ от миграции v1 — [`decisions/2026-06-04_workspaces.md`](./decisions/2026-06-04_workspaces.md).

## Формат данных

Доменные типы — `src/domain/types.ts`:

```ts
interface MindNode {
  readonly id: NodeId;             // crypto.randomUUID()
  readonly text: string;
  readonly position: Position;     // { x: number, y: number }
  readonly parentId: NodeId | null; // null для корневых
  readonly body?: string;          // markdown-тело узла; отсутствует = пустое
}

interface MindEdge {
  readonly id: EdgeId;
  readonly source: NodeId;          // parent node id
  readonly target: NodeId;          // child node id
}

interface Graph {
  readonly nodes: readonly MindNode[];
  readonly edges: readonly MindEdge[];
}
```

`parentId` в `MindNode` дублирует информацию из `MindEdge`. Дубль сознательный: даёт `O(1)` проход «вверх» и упрощает удаление поддерева. Запись идёт целым графом одной транзакцией, так что рассинхрон полей невозможен.

`body` — опциональное markdown-тело узла. Формат хранения остаётся версии `2`: записи, сохранённые до появления тел, не содержат `body` и читаются как `undefined` (тело считается пустым) — `toGraph` кастит `nodes` без проверки поле-за-полем, поэтому миграция и bump `DB_VERSION` не нужны. Рендер тела — [`frontend.md`](./frontend.md) (`EditorPanel`), выбор рендерера — [`decisions/2026-06-05_markdown-render.md`](./decisions/2026-06-05_markdown-render.md).

## Операции

`src/persistence/repository.ts`:

- `loadGraph(workspaceId): Promise<Graph | null>` — читает граф пространства по ключу, прогоняет через `sanitize`. Нет записи — `null`.
- `saveGraph(workspaceId, graph): Promise<void>` — пишет `{ version: 2, nodes, edges, updatedAt: Date.now() }` под ключ `workspaceId`.
- `loadWorkspaces(): Promise<readonly Workspace[]>` — все пространства, отсортированные по `createdAt`.
- `saveWorkspace(workspace)` — upsert записи пространства по `id` (создание и переименование).
- `deleteWorkspace(workspaceId)` — удаляет запись пространства **и его граф** одной транзакцией над `workspaces` + `graph`.
- `loadActiveWorkspaceId()` / `saveActiveWorkspaceId(id)` — активное пространство в `meta` (`null`, если не выбрано).
- `loadPanelCollapsed()` / `savePanelCollapsed(collapsed)` — состояние сворачивания панели в `meta` (по умолчанию `false`).
- `loadAllRoots(): Promise<Map<workspaceId, PanelRoot[]>>` — корни (`parentId === null`) всех пространств одним проходом курсором по `graph`; рёбра не нужны, `sanitize` пропускается. Питает второй уровень панели для **неактивных** пространств (у активного корни деривятся из живого графа).
- `loadCollapsedRoots()` / `saveCollapsedRoots(ids)` — список свёрнутых списков корней в `meta` (по умолчанию `[]`).
- `loadEditorCollapsed()` / `saveEditorCollapsed(collapsed)` — состояние сворачивания правой панели-редактора в `meta` (по умолчанию `false` = развёрнута).
- `loadPanelWidth()` / `savePanelWidth(width)` и `loadEditorWidth()` / `saveEditorWidth(width)` — ширины левой и правой панелей в `meta` (возвращают `number | null`; `null` = ширина по умолчанию, применяется в сторе).

## Дебаунс автосохранения

`src/persistence/debounced-saver.ts` экспортирует `createDebouncedSaver(save, options)`:

- Дефолтная задержка — `DEFAULT_SAVE_DELAY_MS = 250` мс.
- `schedule(graph)` — кладёт `graph` как `pending`, сбрасывает прошлый таймер, ставит новый. Если в течение 250 мс пришёл новый `schedule` — он перетирает прошлый, в IDB запишется только последний снимок.
- `flush()` — синхронно отменяет таймер, сразу ставит `pending` в очередь сохранений и дожидается всей цепочки. Возвращает `Promise<void>`.
- `dispose()` — после вызова `schedule` становится no-op'ом; используется в тестах и при размонтировании.
- Saves сериализуются через внутреннюю Promise-цепочку (`chain = chain.then(...)`). Это значит, что `flush()` дожидается всех уже выпущенных операций сохранения, а не только последней.
- Ошибки сохранения по умолчанию логируются через `console.error` (Biome-исключение в коде явно прокомментировано — потеря данных не должна быть «тихой»). При создании сейвера можно передать свой `onError`.

Сейвер графа **владеет стором** (`createMindMapStore` создаёт его из `persistence.saveGraph`): замыкание сохранения резолвит целевой `workspaceId` из `activeWorkspaceId` **в момент записи**. Поэтому перед сменой активного пространства стор синхронно делает `flush` (см. `selectWorkspace` / `deleteWorkspace`) — иначе отложенная запись графа A ушла бы под ключ B. Подробнее — [`frontend.md`](./frontend.md) (раздел про стор).

`bindUnloadFlush(flush)` подписывает переданный коллбэк `flush` на оба `beforeunload` и `pagehide` (в `App` это `mindMapStore.getState().flush()`). Парность нужна, потому что в современных браузерах и Tauri-webview жизненный цикл закрытия страницы дробится между этими событиями. Возвращает функцию отписки.

## Целостность графа

`src/domain/integrity.ts` экспортирует `sanitize(graph: Graph): Graph` — отбрасывает рёбра, чьи `source` или `target` не существуют в `nodes`. Вызывается каждый раз при загрузке (`loadGraph`). Это защита от ситуации, когда IDB содержит повреждённую или несовместимую с текущей версией приложения запись: вместо краша пользователь увидит валидный подграф.

При мутациях стора целостность обеспечивается доменными функциями (`removeSubtree` чистит и узлы, и инцидентные рёбра атомарно). Запись в IDB всегда консистентна; `sanitize` на загрузке — это второй пояс безопасности на случай ручного вмешательства в базу или будущих миграций.

## Версионирование

Поле `version: 2` в записи графа — задел под будущие миграции схемы. При апгрейде с версии `1` (`upgrade`-колбэк `openMindMapDb`) старый store `graph` пересоздаётся: запись `current` **не переносится** (у реальных пользователей графа ещё нет), и создаются stores `workspaces` и `meta`. Это осознанный BREAKING-переход — см. [`decisions/2026-06-04_workspaces.md`](./decisions/2026-06-04_workspaces.md). Когда формат записи графа изменится дальше, поднимется `DB_VERSION`, а в `repository.toGraph` появится разветвление по `record.version`.
