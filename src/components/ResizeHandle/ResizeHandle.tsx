import type {
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import styles from "./ResizeHandle.module.css";

// How many px one arrow-key press resizes by.
const KEYBOARD_STEP = 16;

interface ResizeHandleProps {
  // Which edge of the panel the bar sits on: "right" for a left panel, "left" for
  // a right panel.
  readonly edge: "left" | "right";
  readonly ariaLabel: string;
  // Current width and bounds — exposed to assistive tech via aria-value*.
  readonly value: number;
  readonly min: number;
  readonly max: number;
  // Called once when a resize begins, so the parent can snapshot the start width.
  readonly onResizeStart: () => void;
  // Called with the horizontal offset (px) from the start: drag deltas during a
  // mouse drag, or ±step for an arrow-key press.
  readonly onResize: (deltaX: number) => void;
  // Called once when the resize ends, so the parent can persist the final width.
  readonly onResizeEnd: () => void;
}

/**
 * A focusable vertical splitter for resizing a side panel. Drag with the mouse, or
 * focus it and use ←/→. Mouse moves are tracked on `window` for the drag's duration
 * so the pointer can leave the 6px bar without dropping it.
 */
export function ResizeHandle(props: ResizeHandleProps): JSX.Element {
  const { edge, ariaLabel, value, min, max, onResizeStart, onResize, onResizeEnd } = props;

  function onMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    // Prevent text selection on the rest of the page while dragging.
    event.preventDefault();
    const startX = event.clientX;
    onResizeStart();

    function handleMove(moveEvent: MouseEvent): void {
      onResize(moveEvent.clientX - startX);
    }
    function handleUp(): void {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      onResizeEnd();
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const delta =
      event.key === "ArrowRight" ? KEYBOARD_STEP : event.key === "ArrowLeft" ? -KEYBOARD_STEP : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    onResizeStart();
    onResize(delta);
    onResizeEnd();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, draggable splitter is a div with role=separator — <hr> cannot host the drag/keyboard interaction.
    <div
      className={`${styles.handle} ${edge === "right" ? styles.edgeRight : styles.edgeLeft}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    />
  );
}
