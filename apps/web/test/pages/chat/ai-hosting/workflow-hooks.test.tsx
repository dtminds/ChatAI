import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useWorkflowDismissableLayer,
  useWorkflowStableCallback,
} from "@/pages/chat/ai-hosting/workflow/workflow-hooks";

describe("workflow hooks", () => {
  it("keeps stable callback identity while calling the latest handler", () => {
    const firstHandler = vi.fn(() => "first");
    const secondHandler = vi.fn(() => "second");
    const { rerender, result } = renderHook(
      ({ handler }) => useWorkflowStableCallback(handler),
      {
        initialProps: { handler: firstHandler },
      },
    );
    const stableCallback = result.current;

    expect(stableCallback()).toBe("first");

    rerender({ handler: secondHandler });

    expect(result.current).toBe(stableCallback);
    expect(stableCallback()).toBe("second");
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("dismisses workflow layers from outside pointer events and Escape", () => {
    const onDismiss = vi.fn();

    function TestLayer({ enabled }: { enabled: boolean }) {
      const layerRef = useWorkflowDismissableLayer<HTMLDivElement>({
        enabled,
        onDismiss,
      });

      return (
        <>
          <div ref={layerRef}>
            <button type="button">inside</button>
          </div>
          <button type="button">outside</button>
        </>
      );
    }

    const { rerender } = render(<TestLayer enabled />);

    act(() => {
      screen.getByRole("button", { name: "inside" }).dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole("button", { name: "outside" }).dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);

    rerender(<TestLayer enabled={false} />);

    act(() => {
      screen.getByRole("button", { name: "outside" }).dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
