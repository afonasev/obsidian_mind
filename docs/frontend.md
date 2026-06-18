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

- **`src/components/Canvas/Canvas.tsx`** — обёртка `<ReactFlow>` из `@xyflow/react`. Регистрирует тип узла `cloud`, ловит события канваса: двойной клик по пустому месту → `addRoot`, клик по узлу → `selectNode`, клик по пустому месту → только завершает редактирование (выделение сохраняется), перетаскивание → `moveNode`, клавиатуру (стрелки → навигация по выделению, `Delete` / `Backspace` → `removeSubtree`, `Enter` → сосед (через `addSiblingOf`, в т.ч. из редактора) / `Cmd/Ctrl+Enter` → ребёнок (через `addChildOf`, в т.ч. из редактора) / `F2` → `startEditing`, `Escape` → `stopEditing`, `Cmd/Ctrl+Z` → `undo`, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` → `redo`, `Alt+←` / `Alt+→` (или `Cmd/Ctrl+←` / `Cmd/Ctrl+→`) → `goBack` / `goForward` по истории фокуса). На `<ReactFlow>` выставлены **`disableKeyboardA11y`** (встроенный перенос узла стрелками выключен — стрелки только двигают выделение) и **`nodesFocusable={false}`** (узлы не получают tabindex, React Flow не вмешивается в фокус). `toRFNodes` задаёт каждому узлу **`initialWidth`/`initialHeight`** (оценка ширины через `estimateNodeWidth`): иначе React Flow рендерит свежий узел `visibility:hidden` до измерения, и автофокус инпута срывается в `<body>`, проглатывая первые символы. При изменении размера окна слушатель `resize` вызывает `fitView`, перецентрируя контент в середину видимой области. Эффект по `reveal` (запрос из панели через `revealNode`/`focusRoot`) вызывает `fitView({ nodes: [{ id }], maxZoom: 1 })`, подводя вьюпорт к конкретному узлу; зависит от всего объекта `reveal`, т.к. `seq` инкрементится на каждый запрос — повторный reveal того же узла снова срабатывает. При маунте `App` вызывает `loadFromStorage()`. Потомки свёрнутых узлов скрываются на уровне адаптера: `CanvasInner` читает `collapsedNodeIds`, считает множество скрытых id (объединение `subtreeIds(node) \ {node}` по свёрнутым) и прокидывает его в `toRFNodes` (отбрасывает скрытые узлы) и `toRFEdges` (отбрасывает рёбра со скрытым концом); сам свёрнутый узел остаётся видим, дочерние рёбра исчезают. Стрелочная навигация (`findNeighbor`) получает `collapsedNodeIds` и не заходит в скрытые узлы. Панель `<Controls orientation="horizontal">` содержит штатные кнопки плюс два `<ControlButton>`: переключатель темы (`useTheme().toggle`, иконка 🌙/☀️) и триггер справки `?` (открывает `HotkeysHelp` через локальный `isHelpOpen`). На `<ReactFlow>` проставлен `colorMode={theme}` — канвас (рёбра, фон, штатные контролы) перекрашивается вместе с темой приложения.
- **`src/components/CloudNode/CloudNode.tsx`** — кастомная нода `@xyflow/react`. Скруглённый прямоугольник с тенью и текстом по центру; min-width 120 px, max-width 360 px; перенос по словам, многострочный текст (`white-space: pre-wrap`). Состояния: обычное / выделенное / редактирование. В режиме редактирования — многострочный `<textarea>` (размер по содержимому через `cols`/`rows`, а высота дотягивается до `scrollHeight` эффектом — иначе мягкий перенос длинной строки схлопнул бы ноду в одну строку): `Enter` фиксирует и создаёт соседа (на корне — только фиксирует), `Cmd/Ctrl+Enter` фиксирует и создаёт ребёнка, `Shift+Enter` вставляет перенос строки (многострочные имена — исключение, потому под модификатором), `Escape` и клик вне поля фиксируют текст и выходят. На правой грани при hover/selected — кнопка «+» для создания дочернего узла (`addChild`). У узла с детьми на внешней грани (тоже при hover/selected, как «+») — кнопка-переключатель свёртки (`▾` развёрнут / `▸` свёрнут, `aria-label` отражает действие, клик зовёт `toggleCollapse` и не всплывает ни в выделение, ни в двойной клик-редактор); у корня переключатель один и сворачивает обе стороны. Свёрнутый узел получает класс `.collapsed` (пунктирная рамка), чтобы свёрнутость читалась без наведения, даже когда стрелка скрыта; при выделении такого узла правило `.collapsed.selected` (выше специфичность, чем у одиночных `.collapsed`/`.selected`) перекрашивает рамку в акцентный цвет, сохраняя пунктир. Узел с непустым (после `trim`) телом показывает значок 📝 перед именем (`TextView`, класс `.bodyMarker`) — признак остаётся виден при любой пользовательской заливке узла (раньше был оттенок подложки, перекрывавшийся выбранным цветом); признак приходит флагом `data.hasBody` из `toRFNodes` (тело на канвас не передаётся). Имя узла может иметь стиль на всю ноду (`MindNode.style`: жирность/курсив через классы `.bold`/`.italic`, относительный размер через инлайн `fontSize` в `em` от `fontScale`); стиль применяется и в `TextView`, и в `EditView`, читается из стора примитивными селекторами (`bold`/`italic`/`fontScale`). При инлайн-правке имени над узлом виден плавающий тулбар форматирования (`NodeToolbar` из `@xyflow/react`, `position=Top`, `isVisible=isEditing`) с кнопками **B** / **I** / **A−** / **A+**: кнопки используют `onMouseDown`+`preventDefault` (не `onClick`), чтобы клик не уводил фокус из textarea и не коммитил правку через `onBlur`; **A−/A+** недоступны на границах диапазона, **B/I** через `aria-pressed` отражают текущий стиль и зовут `setNodeStyle`. Изменение `fontScale` меняет габариты узла, поэтому `setNodeStyle` идёт по layout-ветке (как `updateText`) и пересчитывает раскладку. В правой панели-редакторе и в списке корней имя показывается без стиля. В тот же тулбар добавлен **свотч цвета** (отражает текущий `style.color`): по `onMouseDown` (тот же приём против потери фокуса) открывается поповер с сеткой пресетов, свотчем сброса `⊘`, рядом последних использованных цветов и кнопкой «свой цвет…» (нативный `<input type="color">`). Выбор пресета/кастома зовёт `setNodeStyle(id, { color })` + кладёт цвет в MRU и закрывает поповер; сброс зовёт `resetNodeColor` (доменный `updateNodeStyle` с `clear: ["color"]` — удаляет ключ, а не пишет `undefined`). Заливка облака рендерится инлайн-стилем из `color`: ключ пресета → `var(--node-fill-<key>)`, иначе литеральный `#rrggbb`; применяется и в `TextView`, и в `EditView`. `color` читается из стора примитивным селектором (как `bold`/`italic`/`fontScale`).
- **`src/components/CloudNode/CloudNode.module.css`** — стили узла.
- **`src/node-color/`** — модуль цвета узла (чистый TS + один хук): `presets.ts` — реестр `PRESET_KEYS` и предикат `isPresetKey` (единый источник имён для сетки, рендера и токенов `--node-fill-*`); `recent-colors.ts` — MRU-список последних цветов (≤5, dedup + unshift) под отдельным ключом `localStorage`, вне графа и undo; `useRecentColors.ts` — хук поверх `useSyncExternalStore` (по образцу `useTheme`) со стабильной ссылкой на список и `apply`.
- **`src/components/FocusNav/FocusNav.tsx`** — кнопки «Назад» / «Вперёд» (`aria-label`) в левом верхнем углу канваса, управляющие осью истории фокуса. `disabled` считается прямо в рендере доменными хелперами `canGoBack` / `canGoForward` от `navHistory` / `navCursor`; клики зовут `goBack` / `goForward`. Дублируются хоткеями `Alt+←` / `Alt+→` (или `Cmd/Ctrl+←` / `Cmd/Ctrl+→`).
- **`src/components/HotkeysHelp/HotkeysHelp.tsx`** — справка по горячим клавишам: **управляемый** компонент (пропсы `isOpen` / `onClose`). Триггер «?» живёт в панели `<Controls>` канваса (см. `Canvas.tsx`), а состояние открытия держит `CanvasInner`. Когда `isOpen` — рендерит диалог со списком сочетаний (в левом-нижнем углу, над панелью управления) и backdrop; закрывается кликом вне, кнопкой «Закрыть» или `Escape` (Escape не всплывает на канвас, чтобы не снять выделение). При `isOpen === false` ничего не рендерит.
- **`src/components/WorkspacePanel/WorkspacePanel.tsx`** — сворачиваемая панель пространств слева. Вертикальный список (активное выделено через `aria-current`), кнопка `[+]` (`Создать пространство`) под списком, у каждого элемента `⋮`-меню (`role="menu"`) с «Переименовать» и «Удалить». Создание и переименование — inline-инпут (`aria-label="Имя пространства"`, единая точка коммита — `onBlur`, `Enter`/`Escape` доводят до blur). Удаление — попап подтверждения (`role="dialog"`, «Удалить» / «Отмена», Escape отменяет). Состояние сворачивания читается из стора (`panelCollapsed`). **Второй уровень**: под каждым пространством — вложенный список его корней (шеврон `aria-expanded` слева от имени сворачивает список, состояние в `collapsedWorkspaceRoots`); корни активного пространства деривятся из живого `graph`, неактивных — из `rootsByWorkspace`, пустой текст → «Без названия»; клик по корню зовёт `focusRoot`. В свёрнутой панели корни не рендерятся. Все мутации идут через экшены стора (`createWorkspace`, `selectWorkspace`, `startWorkspaceRename`, `commitWorkspaceName`, `cancelWorkspaceName`, `deleteWorkspace`, `togglePanel`, `toggleWorkspaceRoots`, `focusRoot`). **Сессия vault**: список пространств, кнопка `[+]` и попап удаления рендерятся только при открытом vault (`hasVault`); без vault тело панели пусто, а приглашение открыть директорию живёт на канвасе. При открытом vault в шапке панели — кнопка `⟳` (`Перечитать с диска`) → `refreshFromDisk`, а под заголовком «Пространства» чуть более крупным шрифтом показывается имя открытого vault (`vaultName` — последний сегмент пути; длинное усекается с многоточием).

- **`src/components/EditorPanel/EditorPanel.tsx`** — сворачиваемая панель-редактор тела узла справа, зеркало `WorkspacePanel`. В свёрнутом виде — узкая полоса с кнопкой развернуть (состояние `editorCollapsed`, переключение через `toggleEditor`). В развёрнутом показывает содержимое для выбранного узла (`selectedNodeId`); без выбора — подсказку. Для не-корневого узла над заголовком — кликабельная строка с именем родителя (`selectNode(parentId)` + `revealNode(parentId)`); у корня (`parentId === null`) строка отсутствует. Поле-заголовок = `node.text` с «живой» правкой через `updateText` (двусторонняя связь с инлайн-правкой на канвасе). Тело: режим просмотра рендерит markdown через `react-markdown` + `remark-gfm` (без `dangerouslySetInnerHTML`, см. [`decisions/2026-06-05_markdown-render.md`](./decisions/2026-06-05_markdown-render.md)), клик переключает в правку сырого markdown в `<textarea>`; пустое тело → кликабельный плейсхолдер. В режиме правки `textarea` держит локальный буфер (`useState` + `ref` на актуальный текст); коммит `updateBody` происходит на `onBlur`, по таймеру 1 с без ввода и на размонтировании при смене узла (cleanup `useEffect`), идемпотентно (не коммитит, если буфер == текущему телу).

- **`src/components/ResizeHandle/ResizeHandle.tsx`** — переиспользуемый вертикальный «сплиттер» (`role="separator"`, focusable, `aria-valuenow/min/max`) для регулировки ширины боковой панели. Тянется мышью (слушатели `mousemove`/`mouseup` на `window` живут на время drag) или клавишами ←/→ при фокусе. Колбэки `onResizeStart`/`onResize(deltaX)`/`onResizeEnd` — родитель снимает стартовую ширину, считает новую из дельты и персистит на отпускании. Левая панель ставит его на правую грань (`edge="right"`), правая — на левую (`edge="left"`).

`App.tsx` рендерит трёхколоночную CSS-grid раскладку `WorkspacePanel | Canvas | EditorPanel` и при маунте вызывает `loadWorkspaces()`. Ширины боковых панелей берутся из стора (`panelWidth`/`editorWidth`) и применяются inline-стилем; в свёрнутом виде ширина фиксирована. Канвас различает **два** пустых состояния (`role="note"`): при `hasVault === false` — приглашение «Откройте директорию-vault…» с кнопкой «Открыть директорию-vault» (`openVault`); при открытом vault, но без активного пространства — подсказка «Создайте пространство…». В обоих `addRoot` — no-op (создание корней запрещено).

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
  // Сессия vault:
  readonly hasVault: boolean;                  // vault открыт (Loaded) vs нет (NoVault) — различает два пустых состояния
  readonly vaultName: string | null;           // имя открытого vault (последний сегмент пути) для шапки панели; null без vault
  // Пространства:
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  readonly editingWorkspaceId: string | null; // пространство в режиме inline-переименования
  readonly panelCollapsed: boolean;
  readonly editorCollapsed: boolean;                                    // правая панель-редактор свёрнута
  readonly panelWidth: number;                                          // ширина левой панели (px)
  readonly editorWidth: number;                                         // ширина правой панели (px)
  readonly rootsByWorkspace: ReadonlyMap<string, readonly PanelRoot[]>; // корни НЕактивных пространств для второго уровня панели
  readonly collapsedWorkspaceRoots: ReadonlySet<string>;                // пространства со свёрнутым списком корней
  readonly collapsedNodeIds: ReadonlySet<NodeId>;                       // свёрнутые узлы активного пространства (состояние вида, вне undo)
  readonly reveal: { nodeId: NodeId; seq: number } | null;              // запрос центрирования вьюпорта (seq — монотонный нонс)
  loadWorkspaces(): Promise<void>;            // старт: список + активное + панель + граф + корни + свёрнутость + editorCollapsed
  openVault(): Promise<void>;                 // выбрать директорию (пикер/неявный web-vault) → запомнить путь → loadWorkspaces; no-op при отмене
  refreshFromDisk(): Promise<void>;           // flush → пере-резолв адаптера vault → re-read → reconcile по id (no-op без vault)
  createWorkspace(): Promise<void>;           // активирует новое и открывает inline-ввод имени
  commitWorkspaceName(id, name): Promise<void>;
  cancelWorkspaceName(id): Promise<void>;
  startWorkspaceRename(id): void;
  deleteWorkspace(id): Promise<void>;         // граф + переход на соседа / в пустое состояние
  selectWorkspace(id): Promise<void>;
  togglePanel(): Promise<void>;
  toggleEditor(): Promise<void>;              // свернуть/развернуть правую панель-редактор (персист в meta)
  setPanelWidth(width, commit): void;         // ширина левой панели (clamp); commit=true → персист
  setEditorWidth(width, commit): void;        // ширина правой панели (clamp); commit=true → персист
  toggleWorkspaceRoots(id): Promise<void>;    // свернуть/развернуть список корней пространства (персист в meta)
  toggleCollapse(nodeId): void;               // свернуть/развернуть поддерево узла (вне undo, персист в meta; no-op без детей)
  revealNode(nodeId): void;                   // попросить канвас центрировать вьюпорт на узле
  focusRoot(workspaceId, nodeId): Promise<void>; // клик по корню: активировать пространство → выделить → центрировать
  flush(): Promise<void>;
  // Узлы (срез активного пространства):
  addRoot(input: { readonly position: Position; readonly text?: string }): NodeId;
  addChild(input: { readonly parentId: NodeId; readonly position: Position; readonly text?: string }): NodeId;
  removeSubtree(nodeId: NodeId): void;
  updateText(nodeId: NodeId, text: string): void;
  updateBody(nodeId: NodeId, body: string): void; // правка markdown-тела узла (без layout)
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
- **Свёртка ветвей** (`collapsedNodeIds`) — состояние вида, не графа: вне undo/redo, своя у каждого пространства, персист в `meta` (грузится в `enterWorkspace`/`loadWorkspaces`, чистится в `removeSubtree`/`cutNode` и `deleteWorkspace`). Все мутации графа раскладываются через локальный хелпер `relayout(graph) = layout(graph, collapsedNodeIds)`, поэтому свёрнутый узел всегда трактуется как лист. `toggleCollapse` пишет только позиции (мимо history) и переносит выделение со скрытого узла на свёрнутый предок. `addChildOf` авто-разворачивает свёрнутого родителя, `revealNode` — свёрнутых предков целевого узла.
- `removeSubtree` сбрасывает `selectedNodeId` / `editingNodeId`, если соответствующий узел был удалён.
- Автосейв сравнивает ссылки графа (`state.graph !== previousGraph`), а не значения — поэтому экшены, не меняющие граф, не триггерят запись.

### История (undo/redo)

`past` / `future` — стеки снимков графа активного пространства (снимки иммутабельны, поэтому это ссылки без копирования; глубина ограничена `MAX_HISTORY = 100`, только на время сессии; у каждого пространства — своя история). `undo` / `redo` переключают граф между стеками; автосейв персистит восстановленный граф автоматически.

Гранулярность одного шага отмены задаётся склейкой:

- Серия `updateText` одного узла (набор текста), серия `updateBody` одного узла (правка тела) и серия `moveNode` одного узла (drag) склеиваются в один шаг по ключу `text:<id>` / `body:<id>` / `move:<id>`. Canvas вызывает `endCoalescing()` на завершении drag (`dragging === false`), чтобы следующий drag того же узла стал отдельным шагом. `updateBody` не вызывает `layout()` — тело не влияет на канвас.
- Свежесозданная нода моделируется как транзакция (служебные `pendingBaseline` / `pendingNodeId`, живут в замыкании фабрики, не в state): создание + ввод имени = один шаг отмены; если ноду бросили пустой, `removeSubtree` откатывает к снимку до создания **без записи в историю**.
- Любая новая мутация очищает `future` (отменённая ветка отбрасывается). `moveNode` с неизменной позицией — no-op и в историю не пишется.

### История фокуса (Назад/Вперёд)

`navHistory` / `navCursor` — **отдельная ось от undo/redo**: линейная лента точек `{ workspaceId, nodeId }` (домен [`nav-history.ts`](../src/domain/nav-history.ts): `record` / `back` / `forward` / `pruneWorkspace` / `canGoBack` / `canGoForward`), запоминающая, на каком узле и в каком пространстве было выделение. В отличие от undo/redo, она **не меняет граф** — только перемещает выделение и при необходимости активное пространство; единая на все пространства (а не своя у каждого), живёт только сессию, не персистится, глубина — `MAX_NAV_HISTORY = 100`.

Точка пишется в `selectNode(id !== null)` — единственный путь кликов и стрелок; создание/вставка/реparent ставят выделение мимо `selectNode` и в историю не попадают. Дедуп с записью под курсором; новый выбор после «Назад» обрубает forward-хвост. `goBack` / `goForward` — `async`: при кросс-воркспейсной цели зовут `selectWorkspace` (грузит граф), затем `selectNode` под closure-флагом `navigating` (глушит запись и отбивает повторное нажатие до конца перехода). Правило сверки: если видимое `(activeWorkspaceId, selectedNodeId)` разошлось с курсором (после свитча пространства или деселекта), первый шаг **снапит** на курсор, и лишь следующий идёт дальше. Битые записи (удалённый узел / отсутствующее пространство) **перешагиваются** в ту же сторону; `deleteWorkspace` чистит записи пространства через `pruneWorkspace`, `loadWorkspaces` сбрасывает ось.

### Буфер обмена

`copyNode` / `cutNode` / `pasteInto` работают с внутренним буфером (`graphOps.Subtree`, живёт в замыкании стора на сессию). `extractSubtree` снимает узел с поддеревом и внутренними рёбрами; `pasteSubtree` клонирует его с новыми id под целевым узлом (рекурсивно сверху, side-hint позиция через тот же `childHintPosition`, что и `addChildOf`). `cutNode` = копия + `removeSubtree`; `pasteInto` — один шаг истории, выделяет вставленный корень.

## Стили

Только CSS Modules: `Foo.module.css` рядом с `Foo.tsx`, импорт через `import styles from "./Foo.module.css"`. Inline-стили допустимы только для динамических значений (например, координаты узла), которые нельзя выразить через класс. Tailwind / CSS-in-JS не используем — см. [`decisions/2026-05-27_initial-stack.md`](./decisions/2026-05-27_initial-stack.md).

Цвета вынесены в **слой дизайн-токенов** — глобальный `src/theme.css` (импортируется в `main.tsx`): `:root { --color-… }` задаёт светлую палитру, `[data-theme="dark"] { --color-… }` переопределяет те же токены для тёмной. CSS-модули используют только `var(--…)` — сырых хексов/`rgba` в модулях нет (исключения — с комментарием WHY). Токены семантические (роль: фон, текст, граница, акцент, тени, состояния), а не по-компонентные. Отдельная группа `--node-fill-<key>` (свет/тьма) — палитра заготовленных цветов заливки узла; ключи идентичны `PRESET_KEYS` в `src/node-color/presets.ts` (контракт, правим оба места), за счёт чего пресет адаптируется к теме без участия JS.

## Тема

- **`src/theme/theme.ts`** — чистая логика темы: тип `Theme = "light" | "dark"`, фиксированный ключ `THEME_STORAGE_KEY` в `localStorage`, `readStoredTheme` / `persistTheme` / `applyTheme` (пишет `data-theme` на `<html>`) и `resolveInitialTheme()` = `stored ?? (prefers-color-scheme: dark ? "dark" : "light")`.
- **`src/theme/useTheme.ts`** — хук `useTheme(): { theme, toggle }` поверх `useSyncExternalStore`. Источник правды — атрибут `data-theme` на `<html>`; `toggle` пишет выбор в `localStorage`, меняет атрибут и нотифицирует подписчиков. Канвас получает тему этим же хуком и прокидывает в `colorMode`.
- **Анти-вспышка** — инлайн-скрипт в `<head>` `index.html` (вне React) проставляет `data-theme` до загрузки бандла по той же формуле (`localStorage` → `prefers-color-scheme`). Логика дублируется с `theme.ts` сознательно (синхронны по ключу и значениям) — см. [`decisions/2026-06-06_dark-theme.md`](./decisions/2026-06-06_dark-theme.md).

## Интеграция с `@xyflow/react`

- Канвас держит локальное состояние узлов / рёбер через хуки `useNodesState` / `useEdgesState`, «правда» — в zustand-сторе. Это позволяет получать плавные drag-обновления без отправки каждой промежуточной координаты в стор.
- Во время drag промежуточные позиции идут в стор через `moveNode` (сырые, без раскладки — для плавности). Отпускание финализируется в `handleNodeDragStop` — три ветки: (1) если подсвечена цель (`dropTargetId`), узел перепривязывается под неё (`reparent`); (2) иначе если не-корневой узел уведён **далеко** от родителя (`isDetachCandidate` → доменный `isFarFromParent`), он **открепляется** в новый корень (`detach`) — `parentId → null`, ребро к родителю удаляется, поддерево едет следом; (3) иначе `dropNode` ставит финальную позицию и прогоняет `layout` (близкий drop притягивает узел обратно). Дерево выравнивается, ветка на другой стороне корня переносится целиком, а перетаскивание выше/ниже соседа меняет порядок (раскладка сортирует соседей по `y`). Вся серия drag → один шаг undo.

Подсветка цели при наведении: `handleNodeDrag` зовёт чистую `findDropTarget` (центр перетаскиваемого узла внутри бокса другого, исключая сам узел и его поддерево через `subtreeIds`) и пишет результат в `dropTargetId`; `CloudNode` подсвечивается классом `dropTarget`. `reparent` использует доменную `reparentSubtree` с защитой от цикла/себя/уже-родителя и коалесцируется с тиками drag в один undo-шаг. Параллельно, когда цели нет и порог открепления пройден, `handleNodeDrag` ставит `detachCandidateId` (по аналогии с `dropTargetId`); `toRFEdges` помечает ребро к этому узлу классом `tearing` (пунктир/затухание в `Canvas.module.css`) — наглядный сигнал, что отпускание открепит узел. Оба флага сбрасываются в конце drag.
- Если рассинхронизация локального стейта канваса и стора всплывёт как баг — переедем на «zustand как единственный источник правды + контролируемые ноды/эджи». Решение откладываем до момента, когда проблема станет реальной.
- **Высото-зависимая раскладка.** Вертикальная раскладка (`layout`) отводит каждому узлу `ceil(высота / LAYOUT_VSTEP)` рядов, чтобы высокие узлы (крупный шрифт / много строк / перенос) не пересекались с соседями. Высота берётся из чистой оценки `estimateNodeHeight` (визуальные строки × межстрочный, с запасом `HEIGHT_SAFETY`) — без обратной связи от DOM. Измеренные React-Flow высоты пробовали подавать в раскладку, но это давало цикл «измерение → перекладка → переизмерение» (высота узла зависит от ширины, которую перекладка возмущает), поэтому остановились на оценке.
- **Разведение корней.** Финальный проход `layout` (`separateRoots`) гарантирует, что поддеревья разных корней не пересекаются: для каждого корня считается bbox его поддерева, корни обрабатываются в детерминированном порядке (по `y`, затем `id`), и налезающий корень вместе со всем поддеревом сдвигается **по вертикали** ровно на величину перекрытия до устранения пересечения. Проход идемпотентен (нет пересечения → нулевой сдвиг), поэтому результат `layout` можно персистить без дрейфа; ручное горизонтальное размещение корней сохраняется. Открепление (`detach` → `relayout`) опирается на этот же проход — отдельной логики размещения свежего корня не нужно.

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
