import "@testing-library/jest-dom/vitest";

// @xyflow/react uses ResizeObserver to detect node dimension changes;
// jsdom does not implement it, so a no-op shim keeps mount/unmount from crashing.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

// jsdom does not implement DOMMatrixReadOnly which @xyflow/system uses for transforms.
if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyShim {
    m22 = 1;
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyShim as unknown as typeof DOMMatrixReadOnly;
}
