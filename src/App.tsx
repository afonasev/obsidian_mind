import { type JSX, useEffect } from "react";
import styles from "./App.module.css";
import { Canvas } from "./components/Canvas/Canvas";
import { WorkspacePanel } from "./components/WorkspacePanel/WorkspacePanel";
import { bindUnloadFlush } from "./persistence/debounced-saver";
import { mindMapStore } from "./store/mindmap-store";

export function App(): JSX.Element {
  useEffect(() => {
    void mindMapStore.getState().loadWorkspaces();
    // Persist the latest graph before the page is torn down. We only unbind the
    // listeners on unmount — the store's saver/autosave live for the page lifetime
    // (disposing the singleton here would break it under React StrictMode).
    const unbindUnload = bindUnloadFlush(() => {
      void mindMapStore.getState().flush();
    });
    return unbindUnload;
  }, []);

  return (
    <div className={styles.app}>
      <WorkspacePanel />
      <Canvas />
    </div>
  );
}
