## 1. Домен: nav-history

- [x] 1.1 Создать `src/domain/nav-history.ts`: тип `NavEntry { workspaceId, nodeId }`, тип состояния `{ history, cursor }`, константа лимита (переиспользовать смысл `MAX_HISTORY`).
- [x] 1.2 `record(state, entry)`: дедуп с `history[cursor]`, обрубание forward-хвоста, push в конец, сдвиг при превышении лимита.
- [x] 1.3 `back(state)` / `forward(state)`: вернуть целевой индекс с учётом правила сверки (передаётся флаг «видимое совпадает с курсором»).
- [x] 1.4 `pruneWorkspace(state, workspaceId)`: удалить записи пространства, пересчитать курсор на существующую запись.
- [x] 1.5 Хелперы `canGoBack` / `canGoForward` от `{ history, cursor }`.
- [x] 1.6 Тесты `nav-history.test.ts` — 100% веток: дедуп, обрубание, лимит, сверка, prune, границы.

## 2. Стор: состояние и экшены

- [x] 2.1 Добавить в `MindMapState` поля `navHistory`, `navCursor` и селекторы-производные `canGoBack` / `canGoForward` (или считать в компоненте).
- [x] 2.2 Закрытие-флаг `navigating` (вне zustand) для глушения записи во время перехода; ранний выход при повторном переходе.
- [x] 2.3 В `selectNode`: при `id !== null` и `!navigating` записывать точку через `nav-history.record` с текущим `activeWorkspaceId`.
- [x] 2.4 `async goBack()` / `async goForward()`: вычислить цель (правило сверки), перешагнуть битые записи, при кросс-воркспейсе вызвать `selectWorkspace` затем `selectNode`, обновить `navCursor` под флагом `navigating`.
- [x] 2.5 Проверка валидности записи: пространство есть в `workspaces`, узел есть в загруженном графе; иначе шагать дальше в том же направлении.
- [x] 2.6 В `deleteWorkspace` вызвать `pruneWorkspace` и обновить `navHistory`/`navCursor`.
- [x] 2.7 Сбрасывать историю фокуса в `loadWorkspaces` (как `past`/`future`).
- [x] 2.8 Тесты `mindmap-store.test.tsx`: запись на selectNode, дедуп, goBack/goForward в одном пространстве, кросс-воркспейсный переход (fake-indexeddb), сверка после свитча/деселекта, перешагивание удалённого узла, prune при удалении пространства, границы.

## 3. UI: кнопки и хоткеи

- [x] 3.1 Создать `src/components/FocusNav/FocusNav.tsx` (+ `.module.css`): две кнопки «Назад»/«Вперёд» в левом верхнем углу канваса, `disabled` по `canGoBack`/`canGoForward`, `aria-label`, вызовы `goBack`/`goForward`.
- [x] 3.2 Подключить `FocusNav` в `Canvas` (поверх канваса, левый верх).
- [x] 3.3 В `handleCanvasKeyDown`: Alt+ArrowLeft → `goBack`, Alt+ArrowRight → `goForward` (с `preventDefault`), не мешая обычным стрелкам пространственной навигации.
- [x] 3.4 Тесты `FocusNav.test.tsx`: рендер, disabled-состояния, клики вызывают экшены; тест хоткеев Alt+стрелки в `Canvas.test.tsx`.

## 4. Документация

- [x] 4.1 `HotkeysHelp`: добавить строки «Alt + ←» / «Alt + →» (Назад / Вперёд по истории фокуса) + тест.
- [x] 4.2 `docs/frontend.md`: описать компонент `FocusNav`, ось истории фокуса и её отличие от undo/redo.
- [x] 4.3 `README.md`: отметить навигацию «Назад/Вперёд» в статусе MVP.
- [x] 4.4 Прогнать `make check` (format + lint + type-check + test 100% + e2e), убедиться, что всё зелёное.
