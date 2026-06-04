import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HotkeysHelp } from "./HotkeysHelp";

describe("HotkeysHelp", () => {
  it("shows only the toggle button when closed", () => {
    render(<HotkeysHelp />);
    expect(screen.getByRole("button", { name: "Горячие клавиши" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the shortcuts panel on click and closes it on a second click", async () => {
    const user = userEvent.setup();
    render(<HotkeysHelp />);
    const toggle = screen.getByRole("button", { name: "Горячие клавиши" });

    await user.click(toggle);
    expect(screen.getByRole("dialog", { name: "Горячие клавиши" })).toBeInTheDocument();
    expect(screen.getByText("Отменить последнее действие")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the focus-history shortcuts", async () => {
    const user = userEvent.setup();
    render(<HotkeysHelp />);
    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    expect(screen.getByText("Назад по истории фокуса")).toBeInTheDocument();
    expect(screen.getByText("Вперёд по истории фокуса")).toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<HotkeysHelp />);
    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    await user.click(screen.getByTestId("hotkeys-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes via the explicit Close button", async () => {
    const user = userEvent.setup();
    render(<HotkeysHelp />);
    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the panel open when a non-Escape key is pressed inside it", async () => {
    const user = userEvent.setup();
    render(<HotkeysHelp />);
    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    await user.keyboard("a");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape without bubbling the event to the canvas", async () => {
    const user = userEvent.setup();
    const handleOuterKeyDown = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test-only listener to assert Escape does not bubble out of the dialog.
      <div onKeyDown={handleOuterKeyDown}>
        <HotkeysHelp />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(handleOuterKeyDown).not.toHaveBeenCalled();
  });
});
