## 1. Зависимости

- [x] 1.1 Установить `react-markdown` и `remark-gfm` в зависимости (`bun add react-markdown remark-gfm`); проверить, что версии попали в `package.json`

## 2. Домен

- [x] 2.1 Добавить опциональное поле `body?: string` в `MindNode` (`src/domain/types.ts`)
- [x] 2.2 Реализовать чистую `updateBody(graph, { nodeId, body })` в `src/domain/graph.ts` (по образцу `updateText`, БЕЗ layout)
- [x] 2.3 Тесты домена: `updateBody` меняет тело нужного узла, не трогает остальные узлы/рёбра/позиции; неизвестный `nodeId` — no-op

## 3. Persistence

- [x] 3.1 Добавить `META_EDITOR_COLLAPSED_KEY = "editorPanelCollapsed"` в `src/persistence/db.ts`
- [x] 3.2 Реализовать `loadEditorCollapsed`/`saveEditorCollapsed` в `src/persistence/repository.ts` (по образцу `loadPanelCollapsed`/`savePanelCollapsed`)
- [x] 3.3 Тесты repository: round-trip `editorPanelCollapsed`; отсутствие ключа → `false`; узел с `body` сохраняется и читается; старая запись без `body` грузится без ошибки (тело пустое)

## 4. Стор

- [x] 4.1 Расширить `MindMapPersistence` методами `loadEditorCollapsed`/`saveEditorCollapsed`; добавить в `MindMapState` поле `editorCollapsed: boolean` и экшены `updateBody`, `toggleEditor`
- [x] 4.2 Реализовать `updateBody(nodeId, body)` через `commit(graphOps.updateBody(...), \`body:${nodeId}\`)` (undo-коалесцирование, без layout)
- [x] 4.3 Реализовать `toggleEditor()` (инверсия + `saveEditorCollapsed`) и загрузку `editorCollapsed` в `loadWorkspaces` (добавить в `Promise.all`, дефолт `false`)
- [x] 4.4 Тесты стора: `updateBody` коммитит тело и участвует в undo; серия правок одного тела — один шаг undo; правка тела не сбрасывает имя/позиции; `toggleEditor` инвертирует и персистит; `editorCollapsed` восстанавливается при `loadWorkspaces`

## 5. Компонент EditorPanel

- [x] 5.1 Создать `src/components/EditorPanel/EditorPanel.tsx` + `EditorPanel.module.css`: свёрнутый вид (узкая полоса с кнопкой развернуть) и развёрнутый; кнопка свернуть/развернуть через `toggleEditor`
- [x] 5.2 Пустое состояние: нет `selectedNodeId` → подсказка вместо заголовка и тела
- [x] 5.3 Строка «Имя родителя»: для не-корня — кликабельная (по клику `selectNode(parentId)` + `revealNode(parentId)`); для корня — не рендерится
- [x] 5.4 `TitleInput` = `node.text`, «живая» правка через `updateText` (двусторонняя связь с канвасом)
- [x] 5.5 Тело: режим просмотра через `<Markdown remarkPlugins={[remarkGfm]}>` (без `dangerouslySetInnerHTML`); клик переключает в правку; пустое тело → кликабельный плейсхолдер
- [x] 5.6 Режим правки тела: `<textarea>` с локальным буфером (`useState` + `ref` на актуальный текст); коммит `updateBody` на `onBlur`, по таймеру 1с без ввода, и на размонтировании при смене узла (cleanup `useEffect`); коммит идемпотентен (не коммитить, если буфер == текущему телу)
- [x] 5.7 Тесты компонента (`@testing-library/react` + `user-event`): просмотр↔правка; рендер markdown и GFM; синк заголовка → `node.text` и обратно; клик по родителю; скрытие строки родителя у корня; коммит тела по blur / по таймеру (`vi.useFakeTimers`) / при смене выбранного узла; пустой плейсхолдер

## 6. Интеграция в приложение

- [x] 6.1 Подключить `<EditorPanel/>` в `src/App.tsx` справа; перевести раскладку на CSS-grid `лево | центр | право` (`App.module.css`)
- [x] 6.2 E2E (`tests/`, Playwright): выбрать узел, ввести markdown-тело, проверить рендер в режиме просмотра и возврат в правку; проверить сохранение тела (перезагрузка/повторный выбор узла); проверить сворачивание панели

## 7. Документация

- [x] 7.1 `docs/storage.md`: поле `body` в формате `Node`, ключ `editorPanelCollapsed` в `meta`
- [x] 7.2 `docs/frontend.md`: компонент `EditorPanel`, экшены стора `updateBody`/`toggleEditor`, состояние `editorCollapsed`
- [x] 7.3 `docs/decisions/2026-06-05_markdown-render.md`: выбор `react-markdown` + `remark-gfm` (что / зачем / цена, отказ от `dangerouslySetInnerHTML`)
- [x] 7.4 `README.md`: раздел «Стек» (+`react-markdown`, `remark-gfm`), «Структура проекта» (правая панель), статус MVP (тело узла)

## 8. Финальная проверка

- [x] 8.1 `make check` (format + lint + type-check + test 100% coverage + e2e) — зелёный
- [x] 8.2 `openspec validate add-node-body-editor` — без ошибок
