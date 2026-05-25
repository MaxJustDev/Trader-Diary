import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

function TestModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { onEscape: onClose });
  return (
    <div ref={ref}>
      <button>First</button>
      <button>Second</button>
      <button>Third</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the first focusable element on mount", () => {
    const onClose = vi.fn();
    const { getByText } = render(<TestModal onClose={onClose} />);
    expect(document.activeElement).toBe(getByText("First"));
  });

  it("calls onEscape when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<TestModal onClose={onClose} />);
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Shift+Tab from first wraps to last", async () => {
    const onClose = vi.fn();
    const { getByText } = render(<TestModal onClose={onClose} />);
    const user = userEvent.setup();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(getByText("Third"));
  });
});
