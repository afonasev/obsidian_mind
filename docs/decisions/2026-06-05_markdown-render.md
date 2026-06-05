# Рендер тела узла: `react-markdown` + `remark-gfm` (2026-06-05)

## Что

- Тело узла (`MindNode.body`) хранится как сырой markdown и в режиме просмотра отображается отрендеренным.
- Рендер — через [`react-markdown`](https://github.com/remarkjs/react-markdown) v10 с плагином [`remark-gfm`](https://github.com/remarkjs/remark-gfm): `<Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>`.
- Поддерживаются CommonMark + GitHub Flavored Markdown (таблицы, чек-листы, `~~зачёркнутое~~`, автоссылки).
- `dangerouslySetInnerHTML` и сырой HTML внутри markdown **не используются**: `rehype-raw` не подключаем.

## Зачем

- **`react-markdown` рендерит markdown в React-элементы без `dangerouslySetInnerHTML`.** Это удовлетворяет запрет из [`react.md`](../../.claude/rules/react.md) из коробки — не нужен ни `dangerouslySetInnerHTML`, ни внешний XSS-санитайзер. По умолчанию библиотека не исполняет произвольный HTML, поэтому поверхность XSS минимальна.
- **`marked` + `DOMPurify` + `dangerouslySetInnerHTML`** — отвергнут: прямо нарушает `react.md`, тянет санитайзер и ручную интеграцию с React-деревом.
- **Свой мини-рендерер markdown** — отвергнут по YAGNI: edge-cases markdown бесконечны, переписывать парсер ради экономии пары зависимостей не окупается.
- **`remark-gfm` вместо голого CommonMark** — таблицы и чек-листы это базовый ожидаемый набор для заметок; добавляется одним плагином без `rehype-raw`.

## Цена

- **Транзитивные зависимости.** `react-markdown` тянет экосистему `remark` / `unified` (несколько пакетов). Для desktop-приложения без бандл-бюджета это приемлемо.
- **ESM-only.** Обе библиотеки поставляются только как ESM. Стек уже целиком на ESM (Vite, `idb`), поэтому `transformIgnorePatterns` для Vitest не нужен; интеграционную поломку рендера под jsdom ловим тестом компонента.
- **Ограниченная поверхность.** Без `rehype-raw` произвольный HTML и картинки из тела не рендерятся — это сознательный Non-Goal текущего change (подсветка синтаксиса, картинки, raw HTML отложены).

См. также: [`frontend.md`](../frontend.md) (`EditorPanel`), `openspec/specs/node-body-editor/spec.md`.
