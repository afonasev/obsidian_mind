## 1. Доменная модель и операция

- [x] 1.1 Добавить тип `NodeNameStyle` (`bold?`, `italic?`, `fontScale?`) и опциональное поле `style?` в `MindNode` (`src/domain/types.ts`) с WHY-комментарием про «нет миграции, читается как undefined».
- [x] 1.2 Определить константы диапазона `fontScale` (мин/макс/база) рядом с layout-метриками узла.
- [x] 1.3 Реализовать чистую `updateNodeStyle(graph, { nodeId, style })` в `src/domain/graph.ts` по образцу `updateText`, с клампом `fontScale` в диапазон.
- [x] 1.4 Юнит-тесты `graph.test.ts`: применение bold/italic, кламп `fontScale` на обеих границах, узел без стиля, неизвестный `nodeId`.

## 2. Стор: экшен и undo

- [x] 2.1 Добавить экшен `setNodeStyle(nodeId, patch)` в `mindmap-store.ts` через `applyGraphMutation` по layout-ветке (как `updateText`), с `actionKey` вида `style:<nodeId>` (отдельный шаг undo, без коалесцирования с текстом/перемещением).
- [x] 2.2 Тесты `mindmap-store.test.tsx`: смена стиля триггерит re-layout, отмена возвращает прежний стиль, шаг стиля не коалесцируется с правкой текста, изменение персистируется через автосейв.

## 3. Рендер стиля узла

- [x] 3.1 Применить стиль в `TextView` и `EditView` (`CloudNode.tsx`): классы bold/italic + инлайн `fontSize` от `fontScale` (динамическое значение — допустимо инлайном).
- [x] 3.2 Стили классов и переменных размера в `CloudNode.module.css`, согласованные с темами.
- [x] 3.3 Тесты `CloudNode.test.tsx`: имя рендерится жирным/курсивом/увеличенным; узел без стиля рендерится базово без ошибок.

## 4. Тулбар форматирования

- [x] 4.1 Встроить `<NodeToolbar position={Top} isVisible={isEditing}>` в `CloudNode` с кнопками B / I / A− / A+.
- [x] 4.2 Кнопки используют `onMouseDown`+`preventDefault` (не `onClick`), чтобы клик не уводил фокус из textarea и не коммитил правку; A−/A+ недоступны на границах; B/I отражают текущее состояние стиля.
- [x] 4.3 Тесты компонента: тулбар виден только при правке и скрыт после; клик по кнопке меняет стиль и не выходит из режима правки; активное состояние B/I; недоступность A−/A+ на границах.

## 5. Документация и спека

- [x] 5.1 Обновить `docs/storage.md` (поле `style` в `Node`) и `docs/frontend.md` (стиль имени + тулбар на канвасе).
- [x] 5.2 Синхронизировать `openspec/specs/mindmap-editor/spec.md` с новым поведением; `openspec validate add-node-name-style`.

## 6. Проверка

- [x] 6.1 `make check` (format + lint + type-check + test 100% + e2e) зелёный.
