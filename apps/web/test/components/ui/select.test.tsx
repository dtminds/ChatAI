import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

describe("Select", () => {
  it("closes on outside interaction without passing the pointer event through", async () => {
    const onBackgroundPointerDown = vi.fn();
    render(
      <div>
        <button onPointerDown={onBackgroundPointerDown} type="button">
          画布节点
        </button>
        <Select defaultValue="friend-added">
          <SelectTrigger aria-label="选择事件">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friend-added">添加好友</SelectItem>
            <SelectItem value="message-received">用户发送消息</SelectItem>
          </SelectContent>
        </Select>
      </div>,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "选择事件" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    const interactionLayer = document.querySelector<HTMLElement>(
      '[data-slot="select-outside-interaction-layer"]',
    );
    expect(interactionLayer).toBeInTheDocument();
    if (!interactionLayer) return;

    fireEvent.pointerDown(interactionLayer);

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(onBackgroundPointerDown).not.toHaveBeenCalled();
  });
});
