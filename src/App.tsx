import { type JSX, useEffect } from "react";
import { Canvas } from "./components/Canvas/Canvas";
import { bindUnloadFlush, createDebouncedSaver } from "./persistence/debounced-saver";
import { saveGraph } from "./persistence/repository";
import { bindSaver, mindMapStore } from "./store/mindmap-store";

export function App(): JSX.Element {
  useEffect(() => {
    void mindMapStore.getState().loadFromStorage();
    const saver = createDebouncedSaver(saveGraph);
    const unbindSaver = bindSaver(mindMapStore, saver);
    const unbindUnload = bindUnloadFlush(saver);
    return () => {
      unbindSaver();
      unbindUnload();
      saver.dispose();
    };
  }, []);

  return <Canvas />;
}
