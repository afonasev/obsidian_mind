import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  it("drives a full drag: start, continuous deltas, then end", () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    render(
      <ResizeHandle
        edge="right"
        ariaLabel="resize"
        value={240}
        min={160}
        max={480}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />,
    );
    const handle = screen.getByRole("separator", { name: "resize" });

    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(onResizeStart).toHaveBeenCalledOnce();

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 130 }));
    expect(onResize).toHaveBeenLastCalledWith(30);
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 80 }));
    expect(onResize).toHaveBeenLastCalledWith(-20);

    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(onResizeEnd).toHaveBeenCalledOnce();

    // After release the window listeners are gone — further moves are ignored.
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 999 }));
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it("resizes by ±step on the arrow keys and ignores other keys", () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    render(
      <ResizeHandle
        edge="right"
        ariaLabel="resize"
        value={240}
        min={160}
        max={480}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />,
    );
    const handle = screen.getByRole("separator", { name: "resize" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onResize).toHaveBeenLastCalledWith(16);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(-16);
    // A non-arrow key is a no-op — no extra start/resize/end cycle.
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResizeStart).toHaveBeenCalledTimes(2);
    expect(onResizeEnd).toHaveBeenCalledTimes(2);
  });

  it("renders the bar on the left edge for a right-hand panel", () => {
    render(
      <ResizeHandle
        edge="left"
        ariaLabel="resize-left"
        value={320}
        min={220}
        max={680}
        onResizeStart={() => {}}
        onResize={() => {}}
        onResizeEnd={() => {}}
      />,
    );
    expect(screen.getByRole("separator", { name: "resize-left" })).toBeInTheDocument();
  });
});
