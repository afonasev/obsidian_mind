## 1. Persistence: корни и свёрнутость

- [x] 1.1 Добавить тип `PanelRoot = { id; text }` в `src/domain/workspaces.ts`
- [x] 1.2 Добавить META-ключ `META_COLLAPSED_ROOTS_KEY = "collapsedWorkspaceRoots"` в `src/persistence/db.ts` (без бампа `DB_VERSION`)
- [x] 1.3 Реализовать `loadAllRoots(): Promise<Map<string, readonly PanelRoot[]>>` в `repository.ts` (один `openMindMapDb`, курсор по `GRAPH_STORE`, фильтр `parentId === null`)
- [x] 1.4 Реализовать `loadCollapsedRoots(): Promise<readonly string[]>` и `saveCollapsedRoots(ids)` в `repository.ts`
- [x] 1.5 Тесты `repository.test.ts`: `loadAllRoots` (несколько пространств, пустой граф, корни без текста), round-trip свёрнутости

## 2. Store: состояние и экшены

- [x] 2.1 Расширить `MindMapPersistence` методами `loadAllRoots` / `loadCollapsedRoots` / `saveCollapsedRoots`
- [x] 2.2 Добавить в `MindMapState` поля `rootsByWorkspace`, `collapsedWorkspaceRoots`, `reveal` и сигнатуры экшенов `toggleWorkspaceRoots`, `revealNode`, `focusRoot`
- [x] 2.3 В `loadWorkspaces` заполнить `rootsByWorkspace` (через `loadAllRoots`) и `collapsedWorkspaceRoots` (через `loadCollapsedRoots`)
- [x] 2.4 В `leaveActiveWorkspace` записывать корни покидаемого графа в `rootsByWorkspace`; в `deleteWorkspace` — удалять запись и прунить id из `collapsedWorkspaceRoots`
- [x] 2.5 Реализовать `toggleWorkspaceRoots(id)` с записью набора в META через `saveCollapsedRoots`
- [x] 2.6 Реализовать `revealNode(nodeId)` (инкремент `seq` в `reveal`) и `focusRoot(workspaceId, nodeId)` (selectWorkspace при необходимости → selectNode → revealNode)
- [x] 2.7 Тесты `mindmap-store.test.tsx`: заполнение карты на load, обновление при leave/delete, toggle+персист, focusRoot для активного и для другого пространства, reveal-seq инкремент

## 3. UI: панель

- [x] 3.1 В `WorkspacePanel.tsx` добавить шеврон-кнопку слева от имени (toggle), рендер вложенного `<ul>` корней при отсутствии пространства в `collapsedWorkspaceRoots`
- [x] 3.2 Корни активного пространства деривить из `state.graph`, неактивного — из `rootsByWorkspace`; пустой текст → плейсхолдер «Без названия»
- [x] 3.3 Клик по корню вызывает `focusRoot(workspaceId, nodeId)`; свёрнутая ветка панели остаётся без корней
- [x] 3.4 Стили в `WorkspacePanel.module.css` (отступ вложенности, шеврон, ховер корня)
- [x] 3.5 Тесты `WorkspacePanel.test.tsx`: рендер корней, плейсхолдер, toggle скрывает/показывает, клик зовёт focusRoot, свёрнутая панель без корней

## 4. Canvas: центрирование

- [x] 4.1 В `CanvasInner` подписаться на `reveal` и в `useEffect` по `reveal.seq` вызывать `fitView({ nodes:[{id}], maxZoom:1, duration:300 })`
- [x] 4.2 Тесты `Canvas.test.tsx`: реакция на изменение `reveal.seq`, no-op при `reveal === null`

## 5. Документация и проверка

- [x] 5.1 Обновлены `docs/frontend.md` (панель + стор + canvas reveal) и `docs/storage.md` (META-ключ + `loadAllRoots`/`loadCollapsedRoots`). Sync дельты в `openspec/specs/workspaces/spec.md` выполняется на шаге `/opsx:archive` (он же «update main specs») — ручная правивка живой спеки сейчас конфликтовала бы с этим.
- [x] 5.2 Прогнан полный набор: `format` ✓, `lint` ✓ (info на не тронутом `playwright.config.ts`), `type-check` ✓, `test` 100% coverage ✓ (335 тестов), `test:e2e` ✓ (6/6)
