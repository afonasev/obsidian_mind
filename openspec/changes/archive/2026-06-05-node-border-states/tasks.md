## 1. Фикс рамки свёрнутого узла

- [x] 1.1 Добавить в `CloudNode.module.css` правило `.collapsed.selected { border-color: <яркий акцент> }` (пунктир сохраняется от `.collapsed`)
- [x] 1.2 Проверить, что обычное (не свёрнутое) выделение не изменилось

## 2. Индикатор непустого тела

- [x] 2.1 Расширить `CloudNodeData` полем `readonly hasBody: boolean`
- [x] 2.2 В `Canvas.tsx` при сборке узлов вычислять `hasBody: (node.body ?? "").trim() !== ""`
- [x] 2.3 В `CloudNode` доклеивать класс `styles.hasBody` при `data.hasBody`
- [x] 2.4 Добавить синеватый оттенок тени для `.hasBody` (`box-shadow`, отдельно `:hover`) в `CloudNode.module.css`

## 3. Тесты

- [x] 3.1 Тест: свёрнутый выделенный узел имеет класс и selected, и collapsed (цвет/пунктир сочетаются)
- [x] 3.2 Тест: узел с непустым телом получает класс `hasBody`; с пустым/пробельным — не получает
- [x] 3.3 Тест: вычисление `hasBody` в сборке узлов канваса (тело undefined / "  " / "текст")
- [x] 3.4 100% coverage по затронутому коду (`bun run test`)

## 4. Документация и проверка

- [x] 4.1 `docs/frontend.md` — описать состояния рамки узла (выделение, свёрнутость, индикатор тела)
- [x] 4.2 `openspec validate node-border-states` и финальный `make check`
