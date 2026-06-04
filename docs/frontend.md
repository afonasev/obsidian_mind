# Фронтенд

React 19 + TypeScript (strict). Сборка — Vite 6. Стилизация — CSS Modules. Канвас mindmap — `@xyflow/react`. Стор — `zustand`.

## Компоненты

UI-слой `src/components/` появляется на этапе UI-задач текущего change (`init-mindmap-spa`, секция 13). До этого `src/App.tsx` показывает заглушку:

```tsx
export function App(): JSX.Element {
  return (
    <main>
      <h1>Obsidian Mind</h1>
      <p>Mindmap-редактор. Канвас появится после реализации UI-слоя.</p>
    </main>
  );
}
```

После реализации UI-слоя будут (см. спецификацию [`openspec/changes/init-mindmap-spa/specs/mindmap-editor/spec.md`](../openspec/changes/init-mindmap-spa/specs/mindmap-editor/spec.md)):

- **`src/components/Canvas/Canvas.tsx`** — обёртка `<ReactFlow>` из `@xyflow/react`. Регистрирует тип узла `cloud`, ловит события канваса: двойной клик по пустому месту → `addRoot`, клик по узлу → `selectNode`, клик по пустому → `selectNode(null)`, перетаскивание → `moveNode`, клавиатуру (стрелки → навигация по выделению, `Delete` / `Backspace` → `removeSubtree`, `Enter` → сосед / `Cmd/Ctrl+Enter` → ребёнок (через `addChildOf`, в т.ч. из редактора) / `F2` → `startEditing`, `Escape` → `stopEditing`, `Cmd/Ctrl+Z` → `undo`, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` → `redo`). На `<ReactFlow>` выставлены **`disableKeyboardA11y`** (встроенный перенос узла стрелками выключен — стрелки только двигают выделение) и **`nodesFocusable={false}`** (узлы не получают tabindex, React Flow не вмешивается в фокус). `toRFNodes` задаёт каждому узлу **`initialWidth`/`initialHeight`** (оценка ширины через `estimateNodeWidth`): иначе React Flow рендерит свежий узел `visibility:hidden` до измерения, и автофокус инпута срывается в `<body>`, проглатывая первые символы. При изменении размера окна слушатель `resize` вызывает `fitView`, перецентрируя контент в середину видимой области. При маунте `App` вызывает `loadFromStorage()`.
- **`src/components/CloudNode/CloudNode.tsx`** — кастомная нода `@xyflow/react`. Скруглённый прямоугольник с тенью и текстом по центру; min-width 120 px, max-width 360 px; перенос по словам. Состояния: обычное / выделенное / редактирование. На правой грани при hover/selected — кнопка «+» для создания дочернего узла (`addChild`).
- **`src/components/CloudNode/CloudNode.module.css`** — стили узла.
- **`src/components/HotkeysHelp/HotkeysHelp.tsx`** — справка по горячим клавишам: кнопка «?» в углу канваса, по клику открывает панель со списком сочетаний. Статический оверлей, не зависит от стора; закрывается повторным кликом, кликом вне или `Escape` (Escape не всплывает на канвас, чтобы не снять выделение).
- **`src/components/WorkspacePanel/WorkspacePanel.tsx`** — сворачиваемая панель пространств слева. Вертикальный список (активное выделено через `aria-current`), кнопка `[+]` (`Создать пространство`) под списком, у каждого элемента `⋮`-меню (`role="menu"`) с «Переименовать» и «Удалить». Создание и переименование — inline-инпут (`aria-label="Имя пространства"`, единая точка коммита — `onBlur`, `Enter`/`Escape` доводят до blur). Удаление — попап подтверждения (`role="dialog"`, «Удалить» / «Отмена», Escape отменяет). Состояние сворачивания читается из стора (`panelCollapsed`). Все мутации идут через экшены стора (`createWorkspace`, `selectWorkspace`, `startWorkspaceRename`, `commitWorkspaceName`, `cancelWorkspaceName`, `deleteWorkspace`, `togglePanel`).

`App.tsx` рендерит `WorkspacePanel` рядом с `Canvas` (flex-row) и при маунте вызывает `loadWorkspaces()`. Канвас показывает подсказку «Создайте пространство…» (`role="note"`), пока нет активного пространства; в этом состоянии `addRoot` — no-op (создание корней запрещено).

Правила для компонентов — [`.claude/rules/react.md`](../.claude/rules/react.md).

## Стор

`src/store/mindmap-store.ts` экспортирует:

- `createMindMapStore(options?)` — фабрика стора. В тестах можно подменить `persistence` (весь слой `repository`) и `createSaver` (фабрику дебаунс-сейвера).
- `mindMapStore` — продакшен-синглтон.
- `useMindMapStore(selector)` — хук для React-компонентов (через `useStore` из `zustand`).
- `MindMapPersistence` — интерфейс слоя хранения (граф по `workspaceId`, CRUD пространств, `meta`).

Стор **владеет** дебаунс-сейвером графа: после создания он сам подписывается на изменение ссылки `graph` и зовёт `saver.schedule(state.graph)`. Сейвер пишет под текущий `activeWorkspaceId` (резолвится в момент записи), поэтому смена/удаление активного пространства предваряется синхронным `saver.flush()` — иначе отложенная запись графа A ушла бы под ключ B. Экшен `flush()` отдаёт `saver.flush()` наружу (его дёргает `bindUnloadFlush` в `App` на закрытие страницы).

Форма state:

```ts
interface MindMapState {
  // Срез активного пространства:
  readonly graph: Graph;
  readonly selectedNodeId: NodeId | null;
  readonly editingNodeId: NodeId | null;
  readonly past: readonly Graph[];
  readonly future: readonly Graph[];
  // Пространства:
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly editingWorkspaceId: string | null; // пространство в режиме inline-переименования
  readonly panelCollapsed: boolean;
  loadWorkspaces(): Promise<void>;            // старт: список + активное + панель + граф
  createWorkspace(): Promise<void>;           // активирует новое и открывает inline-ввод имени
  commitWorkspaceName(id, name): Promise<void>;
  cancelWorkspaceName(id): Promise<void>;
  startWorkspaceRename(id): void;
  deleteWorkspace(id): Promise<void>;         // граф + переход на соседа / в пустое состояние
  selectWorkspace(id): Promise<void>;
  togglePanel(): Promise<void>;
  flush(): Promise<void>;
  // Узлы (срез активного пространства):
  addRoot(input: { readonly position: Position; readonly text?: string }): NodeId;
  addChild(input: { readonly parentId: NodeId; readonly position: Position; readonly text?: string }): NodeId;
  removeSubtree(nodeId: NodeId): void;
  updateText(nodeId: NodeId, text: string): void;
  moveNode(nodeId: NodeId, position: Position): void;
  selectNode(nodeId: NodeId | null): void;
  startEditing(nodeId: NodeId): void;
  stopEditing(): void;
  undo(): void;
  redo(): void;
}
```

Особенности:

- Видимый срез (`graph` / выделение / `past` / `future`) всегда относится к **активному** пространству. Истории неактивных пространств хранятся в замыкании фабрики (`Map<workspaceId, {past, future}>`), а не в state — их изменение не должно вызывать ререндер.
- `selectWorkspace` (и переход при удалении): `flush` сейвера → стэш истории текущего → загрузка графа целевого → восстановление его истории (пусто, если в этой сессии не открывали) → сброс `selectedNodeId`/`editingNodeId` → запись активного в `meta`.
- `addRoot` / `addChild` — **no-op без активного пространства** (создание корней запрещено, пока пространство не выбрано); возвращают пустой `NodeId`.
- `createWorkspace` добавляет пространство с пустым именем, активирует его и ставит `editingWorkspaceId`; на коммите пустое имя → дефолт `«Новое пространство»`. Переименование существующего в пустое — отклоняется (имя остаётся прежним).
- Каждый экшн, добавляющий узел (`addRoot`, `addChild`), сразу ставит `selectedNodeId` и `editingNodeId` на новый узел — это контракт сценария «новый узел создаётся в режиме редактирования».
- Новый ребёнок добавляется **последним** среди соседей: `childHintPosition` (и `createSiblingOf` в Canvas) берут `y` через `appendChildY` — ниже всех существующих детей родителя. Раскладка сортирует соседей по `y` стабильной сортировкой, поэтому новый узел встаёт в конец уровня, а не в середину.
- `removeSubtree` сбрасывает `selectedNodeId` / `editingNodeId`, если соответствующий узел был удалён.
- Автосейв сравнивает ссылки графа (`state.graph !== previousGraph`), а не значения — поэтому экшены, не меняющие граф, не триггерят запись.

### История (undo/redo)

`past` / `future` — стеки снимков графа активного пространства (снимки иммутабельны, поэтому это ссылки без копирования; глубина ограничена `MAX_HISTORY = 100`, только на время сессии; у каждого пространства — своя история). `undo` / `redo` переключают граф между стеками; автосейв персистит восстановленный граф автоматически.

Гранулярность одного шага отмены задаётся склейкой:

- Серия `updateText` одного узла (набор текста) и серия `moveNode` одного узла (drag) склеиваются в один шаг по ключу `text:<id>` / `move:<id>`. Canvas вызывает `endCoalescing()` на завершении drag (`dragging === false`), чтобы следующий drag того же узла стал отдельным шагом.
- Свежесозданная нода моделируется как транзакция (служебные `pendingBaseline` / `pendingNodeId`, живут в замыкании фабрики, не в state): создание + ввод имени = один шаг отмены; если ноду бросили пустой, `removeSubtree` откатывает к снимку до создания **без записи в историю**.
- Любая новая мутация очищает `future` (отменённая ветка отбрасывается). `moveNode` с неизменной позицией — no-op и в историю не пишется.

### Буфер обмена

`copyNode` / `cutNode` / `pasteInto` работают с внутренним буфером (`graphOps.Subtree`, живёт в замыкании стора на сессию). `extractSubtree` снимает узел с поддеревом и внутренними рёбрами; `pasteSubtree` клонирует его с новыми id под целевым узлом (рекурсивно сверху, side-hint позиция через тот же `childHintPosition`, что и `addChildOf`). `cutNode` = копия + `removeSubtree`; `pasteInto` — один шаг истории, выделяет вставленный корень.

## Стили

Только CSS Modules: `Foo.module.css` рядом с `Foo.tsx`, импорт через `import styles from "./Foo.module.css"`. Inline-стили допустимы только для динамических значений (например, координаты узла), которые нельзя выразить через класс. Tailwind / CSS-in-JS не используем — см. [`decisions/2026-05-27_initial-stack.md`](./decisions/2026-05-27_initial-stack.md).

## Интеграция с `@xyflow/react`

- Канвас держит локальное состояние узлов / рёбер через хуки `useNodesState` / `useEdgesState`, «правда» — в zustand-сторе. Это позволяет получать плавные drag-обновления без отправки каждой промежуточной координаты в стор.
- Во время drag промежуточные позиции идут в стор через `moveNode` (сырые, без раскладки — для плавности). Отпускание финализируется в `handleNodeDragStop`. Если в момент отпускания подсвечена цель (`dropTargetId`), узел перепривязывается под неё (`reparent`); иначе идёт `dropNode`, который ставит финальную позицию и прогоняет `layout`: дерево выравнивается, ветка на другой стороне корня переносится целиком, а перетаскивание выше/ниже соседа меняет порядок (раскладка сортирует соседей по `y`). Вся серия drag → один шаг undo.

Подсветка цели при наведении: `handleNodeDrag` зовёт чистую `findDropTarget` (центр перетаскиваемого узла внутри бокса другого, исключая сам узел и его поддерево через `subtreeIds`) и пишет результат в `dropTargetId`; `CloudNode` подсвечивается классом `dropTarget`. `reparent` использует доменную `reparentSubtree` с защитой от цикла/себя/уже-родителя и коалесцируется с тиками drag в один undo-шаг.
- Если рассинхронизация локального стейта канваса и стора всплывёт как баг — переедем на «zustand как единственный источник правды + контролируемые ноды/эджи». Решение откладываем до момента, когда проблема станет реальной.

## Точка входа

`src/main.tsx`:

```tsx
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`index.html` лежит в корне репозитория (Vite-стандарт) и содержит `<div id="root"></div>`.
