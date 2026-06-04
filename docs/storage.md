# Хранилище

Весь граф mindmap хранится в IndexedDB браузерного webview через тонкую промис-обёртку [`idb`](https://github.com/jakearchibald/idb). Никакого сервера / диска / синхронизации в этом change нет.

## Схема IndexedDB

| Поле | Значение |
| --- | --- |
| База | `mindmap` |
| Версия | `1` |
| Object store | `graph` |
| Ключ записи | `current` (фиксированный — один документ на приложение) |

Константы и тип записи — в `src/persistence/db.ts`:

```ts
export const DB_NAME = "mindmap";
export const DB_VERSION = 1;
export const STORE_NAME = "graph";
export const RECORD_KEY = "current";

export interface StoredGraph {
  readonly version: 1;
  readonly nodes: unknown;
  readonly edges: unknown;
  readonly updatedAt: number;
}
```

`nodes` / `edges` типизированы как `unknown` — это сознательно: данные приходят из внешнего источника (предыдущая сессия / повреждённая запись), и любой каст в `MindNode[]` без проверки был бы враньём типизатору. Преобразование в `Graph` идёт через `repository.toGraph` + `sanitize` (см. ниже).

## Формат данных

Доменные типы — `src/domain/types.ts`:

```ts
interface MindNode {
  readonly id: NodeId;             // crypto.randomUUID()
  readonly text: string;
  readonly position: Position;     // { x: number, y: number }
  readonly parentId: NodeId | null; // null для корневых
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

## Операции

`src/persistence/repository.ts`:

- `loadGraph(): Promise<Graph | null>` — открывает базу, читает `current`, прогоняет результат через `sanitize`. Если записи нет — возвращает `null`.
- `saveGraph(graph: Graph): Promise<void>` — пишет `{ version: 1, nodes, edges, updatedAt: Date.now() }` под ключ `current`.

## Дебаунс автосохранения

`src/persistence/debounced-saver.ts` экспортирует `createDebouncedSaver(save, options)`:

- Дефолтная задержка — `DEFAULT_SAVE_DELAY_MS = 250` мс.
- `schedule(graph)` — кладёт `graph` как `pending`, сбрасывает прошлый таймер, ставит новый. Если в течение 250 мс пришёл новый `schedule` — он перетирает прошлый, в IDB запишется только последний снимок.
- `flush()` — синхронно отменяет таймер, сразу ставит `pending` в очередь сохранений и дожидается всей цепочки. Возвращает `Promise<void>`.
- `dispose()` — после вызова `schedule` становится no-op'ом; используется в тестах и при размонтировании.
- Saves сериализуются через внутреннюю Promise-цепочку (`chain = chain.then(...)`). Это значит, что `flush()` дожидается всех уже выпущенных операций сохранения, а не только последней.
- Ошибки сохранения по умолчанию логируются через `console.error` (Biome-исключение в коде явно прокомментировано — потеря данных не должна быть «тихой»). При создании сейвера можно передать свой `onError`.

`bindUnloadFlush(saver)` подписывает `saver.flush()` на оба `beforeunload` и `pagehide`. Парность нужна, потому что в современных браузерах и Tauri-webview жизненный цикл закрытия страницы дробится между этими событиями. Возвращает функцию отписки.

## Целостность графа

`src/domain/integrity.ts` экспортирует `sanitize(graph: Graph): Graph` — отбрасывает рёбра, чьи `source` или `target` не существуют в `nodes`. Вызывается каждый раз при загрузке (`loadGraph`). Это защита от ситуации, когда IDB содержит повреждённую или несовместимую с текущей версией приложения запись: вместо краша пользователь увидит валидный подграф.

При мутациях стора целостность обеспечивается доменными функциями (`removeSubtree` чистит и узлы, и инцидентные рёбра атомарно). Запись в IDB всегда консистентна; `sanitize` на загрузке — это второй пояс безопасности на случай ручного вмешательства в базу или будущих миграций.

## Версионирование

Поле `version: 1` в записи `current` — задел под будущие миграции схемы. Когда формат изменится, поднимется `DB_VERSION`, в `upgrade`-колбэке `openMindMapDb` появится логика миграции, а в `repository.toGraph` — разветвление по `record.version`.
