## 1. Домен пространств

- [x] 1.1 Создать `src/domain/workspaces.ts`: тип `Workspace { id, name, createdAt }` и чистые операции `createWorkspace`, `renameWorkspace`, `removeWorkspace`, `neighborOf`
- [x] 1.2 Покрыть `src/domain/workspaces.test.ts`: добавление, переименование (в т.ч. отклонение пустого), удаление, выбор соседа (следующий/предыдущий/`null`)

## 2. Persistence (IndexedDB v2)

- [x] 2.1 `src/persistence/db.ts`: поднять `DB_VERSION` до `2`, описать object stores `graph` (key=`workspaceId`), `workspaces`, `meta`; в `upgrade` пересоздать `graph` (отбросить запись `current`) и создать новые stores; обновить типы `StoredGraph` (`version: 2`)
- [x] 2.2 `src/persistence/repository.ts`: `loadGraph(workspaceId)` / `saveGraph(workspaceId, graph)` по ключу пространства; CRUD пространств (`loadWorkspaces`, `saveWorkspace`, `deleteWorkspace` вместе с записью графа); `meta` (`loadActiveWorkspaceId`/`saveActiveWorkspaceId`, `loadPanelCollapsed`/`savePanelCollapsed`)
- [x] 2.3 Обновить `src/persistence/repository.test.ts` под новые сигнатуры и сценарии: загрузка/сохранение по `workspaceId`, удаление пространства убирает его граф, чтение/запись meta
- [x] 2.4 Адаптировать `bindSaver` / использование `createDebouncedSaver`: сейв графа под текущий `activeWorkspaceId`, синхронный `flush` перед сменой активного пространства; обновить тесты сейвера при необходимости

## 3. Store

- [x] 3.1 Расширить `MindMapState`: `workspaces`, `activeWorkspaceId`, `panelCollapsed`; в замыкании — `Map<workspaceId, {past, future}>` для историй неактивных пространств
- [x] 3.2 Экшены пространств: `loadWorkspaces` (старт: список + активное + панель), `createWorkspace` (генерация id, активация, старт inline-редактирования имени, пустое имя → `«Новое пространство»`), `renameWorkspace` (отклонять пустое), `deleteWorkspace` (попап подтверждает UI; удаление графа + переход на соседа/в пустое), `selectWorkspace` (flush → стэш истории A → загрузка графа B → восстановление истории B → сброс selection/editing → запись активного в meta), `togglePanel`
- [x] 3.3 Гард `addRoot`/`addChild`: no-op без активного пространства
- [x] 3.4 Тесты `src/store/mindmap-store.test.ts`: создание/переименование/удаление, переключение и независимость графов, изоляция undo/redo между пространствами, no-op создания корня без активного пространства

## 4. Компоненты

- [x] 4.1 Создать `src/components/WorkspacePanel/`: вертикальный список с выделением активного, кнопка `[+]` под списком, сворачивание/разворачивание (из стора), CSS Module
- [x] 4.2 `⋮`-меню на каждом элементе: «Переименовать» (inline-edit) и «Удалить»; попап подтверждения удаления (роль dialog, подтвердить/отмена)
- [x] 4.3 Inline-редактирование имени пространства (создание и переименование) через `user-event`-совместимое поле
- [x] 4.4 `Canvas`: пустое состояние «создайте пространство», когда активного пространства нет; запрет создания корней в этом состоянии
- [x] 4.5 `App.tsx`: загрузка пространств при старте, рендер `WorkspacePanel` рядом с `Canvas`
- [x] 4.6 Тесты компонентов: рендер списка/выделения/пустого списка, создание с inline-edit и дефолтным именем, переименование (включая отклонение пустого), удаление с подтверждением и отменой, сворачивание панели, пустое состояние канваса

## 5. E2E и документация

- [x] 5.1 Playwright e2e в `tests/`: создать два пространства, добавить узлы в каждое, переключиться и убедиться в независимости графов; удаление активного переключает на соседа; перезапуск открывает последнее активное и помнит состояние панели
- [x] 5.2 Обновить `README.md` (статус MVP, структура), `docs/storage.md` (схема IDB v2), `docs/frontend.md` (`WorkspacePanel`); добавить запись в `docs/decisions/` об отказе от миграции v1 и модели «граф на пространство»
- [x] 5.3 `make check` зелёный (format + lint + type-check + test 100% + e2e)
