import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SettingWorkspace,
  SettingWorkspaceProvider,
} from "@/pages/chat/workflow/panels/setting-workspace";

describe("Workflow SettingWorkspace", () => {
  it("remains interactive outside an open Select instead of exposing the canvas below", async () => {
    const onCanvasNodePointerDown = vi.fn();
    render(
      <>
        <button onPointerDown={onCanvasNodePointerDown} type="button">
          画布节点
        </button>
        <SettingWorkspaceProvider>
          <SettingWorkspace>
            <div aria-label="设置面板空白区域">
              <Select defaultValue="latest">
                <SelectTrigger aria-label="取数方式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">最新</SelectItem>
                  <SelectItem value="earliest">最早</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingWorkspace>
        </SettingWorkspaceProvider>
      </>,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "取数方式" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(document.body.style.pointerEvents).toBe("none");

    await userEvent.click(screen.getByLabelText("设置面板空白区域"));

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(onCanvasNodePointerDown).not.toHaveBeenCalled();
  });
});
