import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HotkeysHelp } from "./HotkeysHelp";

describe("HotkeysHelp", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<HotkeysHelp isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the shortcuts dialog when open", () => {
    render(<HotkeysHelp isOpen onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Горячие клавиши" })).toBeInTheDocument();
    expect(screen.getByText("Отменить последнее действие")).toBeInTheDocument();
  });

  it("lists the focus-history shortcuts", () => {
    render(<HotkeysHelp isOpen onClose={vi.fn()} />);
    expect(screen.getByText("Назад по истории фокуса")).toBeInTheDocument();
    expect(screen.getByText("Вперёд по истории фокуса")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HotkeysHelp isOpen onClose={onClose} />);
    await user.click(screen.getByTestId("hotkeys-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose via the explicit Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HotkeysHelp isOpen onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the panel open when a non-Escape key is pressed inside it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HotkeysHelp isOpen onClose={onClose} />);
    await user.keyboard("a");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape without bubbling the event to the canvas", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const handleOuterKeyDown = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test-only listener to assert Escape does not bubble out of the dialog.
      <div onKeyDown={handleOuterKeyDown}>
        <HotkeysHelp isOpen onClose={onClose} />
      </div>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(handleOuterKeyDown).not.toHaveBeenCalled();
  });
});
