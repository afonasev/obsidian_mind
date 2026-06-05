## 1. Домен: collapse-aware раскладка

- [x] 1.1 Изменить сигнатуру `layout(graph, collapsed: ReadonlySet<NodeId>)` в `src/domain/layout.ts`; свёрнутый узел трактуется как лист (`subtreeRows` = 1, `layoutSide` не рекурсирует в его детей)
- [x] 1.2 Обновить все существующие вызовы `layout()` (в сторе) — см. задачу 3.1 (хелпер `relayout`); тестам передавать пустой/непустой set
- [x] 1.3 Тесты `layout`: соседи свёрнутого узла смыкаются без зазора под скрытое; пустой set эквивалентен прежнему поведению; разворот восстанавливает раскладку потомков

## 2. Домен: навигация мимо скрытого

- [x] 2.1 В `src/domain/navigation.ts` добавить параметр `collapsed: ReadonlySet<NodeId>` в `findNeighbor`; исключить потомков свёрнутых узлов из кандидатов
- [x] 2.2 Обновить вызов `findNeighbor` в `Canvas.tsx` (передать `collapsedNodeIds`)
- [x] 2.3 Тесты `navigation`: стрелка из свёрнутого узла не выделяет скрытого потомка; видимые соседи доступны; пустой set = прежнее поведение

## 3. Стор: состояние, toggle, взаимодействия

- [x] 3.1 Добавить в state `collapsedNodeIds: ReadonlySet<NodeId>` (активного пространства); локальный хелпер `relayout(graph) => layout(graph, get().collapsedNodeIds)` и заменить им все вызовы `layout()` в сторе
- [x] 3.2 Реализовать `toggleCollapse(nodeId)`: no-op для узла без детей; иначе пересобрать set, `set({ collapsedNodeIds, graph: relayout(graph) })` **без** history-шага, сохранить `saveCollapsedNodes`; если `selectedNodeId` стал скрытым — перевести выделение на свёрнутый узел
- [x] 3.3 Авто-разворот при добавлении ребёнка: в `addChildOf` убрать родителя из `collapsedNodeIds` (+ сохранить) перед добавлением
- [x] 3.4 Авто-разворот предков при reveal: в `revealNode`/`focusRoot` убрать свёрнутых предков целевого узла из set (+ сохранить, + relayout)
- [x] 3.5 Чистка мусора: при `removeSubtree`/`cutNode` удалить id удаляемого поддерева из `collapsedNodeIds` (+ сохранить, если изменилось)
- [x] 3.6 Жизненный цикл пространства: грузить `collapsedNodeIds` при входе (`enterWorkspace`, `loadWorkspaces` для активного), сбрасывать на пустое в пустом состоянии
- [x] 3.7 Расширить интерфейс `MindMapPersistence` методами `loadCollapsedNodes`/`saveCollapsedNodes`; обновить фейки в тестах
- [x] 3.8 Тесты стора: toggle вне undo/redo; добавление ребёнка к свёрнутому разворачивает; reveal разворачивает предков; выделение скрытого переходит на свёрнутый; удаление чистит set; вход в пространство восстанавливает свёртку

## 4. Персистентность

- [x] 4.1 В `src/persistence/db.ts` добавить хелпер ключа `collapsedNodesKey(workspaceId) => `collapsedNodes:${workspaceId}`` (без изменения `DB_VERSION`)
- [x] 4.2 В `src/persistence/repository.ts` реализовать `loadCollapsedNodes(workspaceId): Promise<readonly NodeId[]>` и `saveCollapsedNodes(workspaceId, ids)`
- [x] 4.3 В `deleteWorkspace` удалить запись `collapsedNodes:<workspaceId>` (в той же транзакции, что граф/пространство)
- [x] 4.4 Тесты `repository`: round-trip сохранения/загрузки; отсутствие записи = `[]`; удаление пространства убирает запись

## 5. Canvas: скрытие потомков

- [x] 5.1 В `Canvas.tsx` читать `collapsedNodeIds` из стора; вычислить множество скрытых id (объединение `subtreeIds(node) \ {node}` по свёрнутым); `toRFNodes` отбрасывает скрытые узлы
- [x] 5.2 `toRFEdges` отбрасывает рёбра, у которых источник или цель скрыты
- [x] 5.3 Тесты `Canvas`: свёрнутый узел виден, его потомки и дочерние рёбра — нет; разворот возвращает их

## 6. CloudNode: переключатель и стиль

- [x] 6.1 Кнопка-переключатель `▾`/`▸` на внешней грани (рядом с «+»), видна только если у узла есть дети; состояние читается из `collapsedNodeIds`; клик вызывает `toggleCollapse`, не всплывает в выделение
- [x] 6.2 Корень: один переключатель, сворачивает обе стороны
- [x] 6.3 Класс `.collapsed` в `CloudNode.module.css` — изменённый стиль рамки свёрнутого узла; `aria-label` переключателя отражает действие
- [x] 6.4 Тесты `CloudNode`: переключатель скрыт без детей; клик переключает; роль/доступность кнопки; класс свёрнутого узла применяется

## 7. Документация

- [x] 7.1 Обновить `docs/storage.md` — meta-ключ `collapsedNodes:<workspaceId>` (состояние вида, per-workspace, удаляется с пространством)
- [x] 7.2 Обновить `docs/frontend.md` — переключатель свёртки в `CloudNode`, скрытие потомков в `Canvas`, collapse-aware раскладка/навигация, `collapsedNodeIds` в сторе
- [x] 7.3 Обновить `README.md` (раздел статуса MVP) — сворачивание/разворачивание ветвей как новая возможность

## 8. Проверка

- [x] 8.1 `make check` зелёный (format + lint + type-check + test 100% coverage + e2e)
- [x] 8.2 `openspec validate add-branch-collapse` без ошибок
