## 1. Слой токенов

- [x] 1.1 Свести ~40 хардкод-цветов из 8 `*.module.css` к набору семантических токенов (фон, текст, граница, акцент, тени, состояния)
- [x] 1.2 Создать `src/theme.css` с `:root { --… }` (светлая) и `[data-theme="dark"] { --… }` (тёмная)
- [x] 1.3 Импортировать `theme.css` в `src/main.tsx`
- [x] 1.4 Заменить хексы/rgba на `var(--…)` во всех 8 модулях; грепом убедиться, что сырых цветов не осталось (кроме осознанных исключений с WHY)

## 2. Инициализация и хранение темы

- [x] 2.1 Добавить инлайн-скрипт в `<head>` `index.html`: читает `localStorage` → иначе `prefers-color-scheme`, ставит `document.documentElement.dataset.theme` до первой отрисовки
- [x] 2.2 Реализовать в `src/` тестируемую функцию выбора начальной темы (stored ?? system) и запись выбора в `localStorage` (фиксированный ключ, значения `light`/`dark`)
- [x] 2.3 Реализовать хук `useTheme` (текущая тема + `toggle`) через `useSyncExternalStore`; `toggle` пишет в localStorage и меняет `data-theme`

## 3. UI: панель управления

- [x] 3.1 Сделать `<Controls orientation="horizontal">` в `src/components/Canvas/Canvas.tsx`
- [x] 3.2 Добавить `<ControlButton>` переключателя темы (иконка 🌙/☀️ по текущей теме) на базе `useTheme`
- [x] 3.3 Прокинуть `colorMode={theme}` в `<ReactFlow>` для синхронизации канваса
- [x] 3.4 Перенести триггер справки в `<ControlButton>` внутри `<Controls>`; убрать угловую кнопку из `HotkeysHelp`
- [x] 3.5 Перепривязать диалог `HotkeysHelp` к низу-слева (вместо `top/right`), сохранив backdrop и закрытие по Escape

## 4. Тесты

- [x] 4.1 Юнит-тесты выбора начальной темы: stored есть/нет × system dark/light; запись выбора в localStorage
- [x] 4.2 Тест `useTheme`: `toggle` меняет тему и `data-theme`, переживает «перезапуск» (повторное чтение)
- [x] 4.3 Компонентные тесты: кнопка темы в Controls переключает тему; кнопка справки открывает/закрывает диалог из новой позиции
- [x] 4.4 Достичь 100% coverage по новому TS-коду (`bun run test`)

## 5. Документация

- [x] 5.1 `README.md` — отметить тёмную тему в статусе MVP
- [x] 5.2 `docs/frontend.md` — тема, токены, кнопки в панели управления, перенос справки
- [x] 5.3 `docs/decisions/` — новый файл `YYYY-MM-DD_dark-theme.md` (токены + localStorage + xyflow Controls/colorMode): что/зачем/цена
- [x] 5.4 `openspec validate add-dark-theme` и финальный `make check`
