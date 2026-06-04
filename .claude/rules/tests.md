---
globs: ["**/*.test.{ts,tsx}", "tests/**/*.ts"]
---

## Конвенции тестов

Два уровня:

- **Unit / component** — Vitest + `@testing-library/react` + `jsdom`. Файлы `*.test.ts` / `*.test.tsx` лежат рядом с кодом, который тестируют.
- **End-to-end** — Playwright. Файлы только в `tests/`, против `bun run preview` (web-сборка), headless, chromium.

### 100% coverage — обязательно

- Пороги `lines / functions / statements / branches = 100` зафиксированы в `vitest.config.ts`. Не понижаем — coverage падает = тесты падают.
- Исключения из coverage перечислены в `vitest.config.ts` (`src/main.tsx`, конфиги, `*.d.ts`, тесты, `src-tauri/**`). Расширять этот список — только с обсуждением: исключённый файл — слепая зона.
- Точечный `/* v8 ignore next */` / `/* v8 ignore start */` — разрешён **только** с комментарием-причиной рядом, объясняющим, почему ветку нельзя покрыть честно. Bare-ignore без причины — повод вернуть PR.
- Локально и в CI — единственная команда запуска тестов это `bun run test` (с coverage). Никаких «зелёных» прогонов без `--coverage`.

### Vitest / unit / component

- Используем `vitest` + `@testing-library/react` + `@testing-library/user-event`. Никаких `enzyme`-стиля shallow-render и поиска по реализационным деталям.
- Запросы к DOM — приоритет по доступности: `getByRole`, `getByLabelText`, `getByText`. `getByTestId` — последнее средство.
- Взаимодействия — через `user-event`, не `fireEvent`. `user-event` корректно эмулирует фокус, клавиатуру и асинхронность.
- Моки — минимально. Если можно протестировать честно — тестируем честно. Для IndexedDB у нас есть `fake-indexeddb` (devDependency), он уже подцеплен через `src/test-setup.ts`-аналогичный паттерн.
- Таймеры в дебаунсах — через `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync`. После теста — `vi.useRealTimers()` (см. существующие тесты `debounced-saver`).
- `it.skip` / `describe.skip` / `it.only` — запрещены без комментария `// reason: …` в той же или соседней строке. PR с голым `skip`/`only` не мерджим.
- Один `expect`-узел — одно осмысленное утверждение. Лавину `expect(...).toBe(...)` лучше декомпозировать на несколько `it`.

### Структура файла теста

- Имя файла — `<имя-модуля>.test.ts(x)`.
- Группировка — `describe("ИмяМодуля", () => …)`, внутри — `it("делает X, когда Y", …)`.
- Подготовка теста — внутри `it` или в `beforeEach`, без хитрых глобалов.

### Playwright e2e

- Только в `tests/`, расширение `.spec.ts`.
- `webServer` в `playwright.config.ts` поднимает `bun run preview` на 4173. Локально допускается `reuseExistingServer`, в CI — нет.
- Браузер — только `chromium` (см. `playwright.config.ts`). Multi-browser добавим, когда появятся реальные основания.
- Тесты обращаются по `/`-URL, не зашивают порт руками — используют `page.goto("/")` поверх `baseURL`.
- Снимки экрана / video — только в случае падения (Playwright сам это умеет). Не коммитим `playwright-report/` и `test-results/`.

### Что нельзя

- Не подавляем падение теста ради «потом починим». Падающий тест либо чинится, либо удаляется с явной отметкой в openspec/change.
- Не вносим `vi.mock` для модулей собственного домена — это маскировка контракта. Мокаем только внешние границы (IDB, сеть, IPC).
- Не пишем тесты, которые что-либо знают про React-внутренности (рендер-фазы, fiber). Тестируем поведение пользователя.
