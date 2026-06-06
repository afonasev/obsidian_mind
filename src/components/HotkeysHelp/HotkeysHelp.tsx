import type { JSX, KeyboardEvent } from "react";
import styles from "./HotkeysHelp.module.css";

interface HotkeysHelpProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

interface Hotkey {
  readonly keys: string;
  readonly description: string;
}

const HOTKEYS: readonly Hotkey[] = [
  { keys: "Двойной клик по фону", description: "Создать корневой узел" },
  { keys: "Двойной клик / F2", description: "Редактировать текст узла" },
  { keys: "Enter", description: "Создать соседний узел (на корне — ничего)" },
  { keys: "Cmd/Ctrl + Enter", description: "Создать дочерний узел от текущего" },
  { keys: "Shift + Enter", description: "Перенос строки в названии при редактировании" },
  { keys: "«+» на узле", description: "Добавить дочерний узел" },
  { keys: "Перетаскивание", description: "Двигать узел; менять порядок и сторону веток" },
  { keys: "Перетащить на узел", description: "Сделать перетаскиваемый узел дочерним" },
  { keys: "← ↑ → ↓", description: "Перемещать выделение между узлами" },
  { keys: "Alt / Cmd / Ctrl + ←", description: "Назад по истории фокуса" },
  { keys: "Alt / Cmd / Ctrl + →", description: "Вперёд по истории фокуса" },
  { keys: "Delete / Backspace", description: "Удалить узел вместе с поддеревом" },
  { keys: "Cmd/Ctrl + C", description: "Копировать узел с поддеревом" },
  { keys: "Cmd/Ctrl + X", description: "Вырезать узел с поддеревом" },
  { keys: "Cmd/Ctrl + V", description: "Вставить как дочерний от выделенного" },
  { keys: "Escape", description: "Снять выделение / отменить редактирование" },
  { keys: "Cmd/Ctrl + Z", description: "Отменить последнее действие" },
  { keys: "Cmd/Ctrl + Shift + Z", description: "Повторить отменённое действие" },
];

// The trigger lives in the canvas Controls bar (see Canvas.tsx); this component
// is controlled — Canvas owns the open state and passes it in.
export function HotkeysHelp({ isOpen, onClose }: HotkeysHelpProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      // Keep the canvas from also treating Escape as "deselect node".
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div className={styles.help}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Закрыть справку"
        data-testid="hotkeys-backdrop"
      />
      <div
        id="hotkeys-panel"
        role="dialog"
        aria-label="Горячие клавиши"
        className={styles.panel}
        onKeyDown={handlePanelKeyDown}
      >
        <h2 className={styles.title}>Горячие клавиши</h2>
        <dl className={styles.list}>
          {HOTKEYS.map((hotkey) => (
            <div className={styles.row} key={hotkey.keys}>
              <dt className={styles.keys}>{hotkey.keys}</dt>
              <dd className={styles.description}>{hotkey.description}</dd>
            </div>
          ))}
        </dl>
        {/* biome-ignore lint/a11y/noAutofocus: focus moves into the dialog on open so Escape (handled on the panel) closes it without leaking to the canvas. */}
        <button type="button" className={styles.close} onClick={onClose} autoFocus>
          Закрыть
        </button>
      </div>
    </div>
  );
}
