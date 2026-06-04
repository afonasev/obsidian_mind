import type { JSX } from "react";
import {
  canGoBack as navCanGoBack,
  canGoForward as navCanGoForward,
} from "../../domain/nav-history";
import { mindMapStore, useMindMapStore } from "../../store/mindmap-store";
import styles from "./FocusNav.module.css";

/**
 * Browser-like «Назад / Вперёд» buttons over the canvas (top-left), driving the
 * focus-history axis (see the store's navHistory). Each button is disabled when
 * there is nowhere to go in its direction.
 */
export function FocusNav(): JSX.Element {
  const canGoBack = useMindMapStore((state) =>
    navCanGoBack({ history: state.navHistory, cursor: state.navCursor }),
  );
  const canGoForward = useMindMapStore((state) =>
    navCanGoForward({ history: state.navHistory, cursor: state.navCursor }),
  );

  function handleBack(): void {
    void mindMapStore.getState().goBack();
  }

  function handleForward(): void {
    void mindMapStore.getState().goForward();
  }

  return (
    <div className={styles.nav}>
      <button
        type="button"
        className={styles.button}
        onClick={handleBack}
        disabled={!canGoBack}
        aria-label="Назад по истории фокуса"
      >
        ←
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={handleForward}
        disabled={!canGoForward}
        aria-label="Вперёд по истории фокуса"
      >
        →
      </button>
    </div>
  );
}
