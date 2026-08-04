import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BroadcastProtectionNotice } from "@/pages/chat/components/broadcast-protection-notice";

const activeStatus = {
  degradeCallbackCnt: 1800,
  degradeCallbackRate: 120,
  normalCallbackCnt: 8,
  normalCallbackRate: 600,
};

describe("BroadcastProtectionNotice", () => {
  it("keeps the estimate in the detail dialog and refreshes before showing it", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue({
      kind: "active",
      status: activeStatus,
    });
    render(
      <BroadcastProtectionNotice
        onRefresh={onRefresh}
        status={activeStatus}
      />,
    );

    expect(screen.queryByText(/预计恢复/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      await screen.findByText("预计恢复：5～15 分钟"),
    ).toBeInTheDocument();
  });

  it("shows a compact accessible entry that opens the same details", async () => {
    const user = userEvent.setup();
    render(
      <BroadcastProtectionNotice
        compact
        onRefresh={vi.fn().mockResolvedValue({
          kind: "active",
          status: activeStatus,
        })}
        status={activeStatus}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not close the detail dialog when the mask is clicked", async () => {
    const user = userEvent.setup();
    render(
      <BroadcastProtectionNotice
        onRefresh={vi.fn().mockResolvedValue({
          kind: "active",
          status: activeStatus,
        })}
        status={activeStatus}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );
    const dialog = await screen.findByRole("dialog");
    const mask = dialog.previousElementSibling;

    expect(mask).toBeInstanceOf(HTMLElement);
    fireEvent.pointerDown(mask as HTMLElement);
    fireEvent.click(mask as HTMLElement);
    expect(dialog).toBeInTheDocument();
  });

  it("keeps the guidance list visible while the estimate is loading", async () => {
    const user = userEvent.setup();
    render(
      <BroadcastProtectionNotice
        onRefresh={vi.fn(() => new Promise<never>(() => undefined))}
        status={activeStatus}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("shows an inline detail error while the retained notice remains active", async () => {
    const user = userEvent.setup();
    render(
      <BroadcastProtectionNotice
        onRefresh={vi.fn().mockResolvedValue({ kind: "error" })}
        status={activeStatus}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法获取");
    expect(screen.getByText("群发保护已激活")).toBeInTheDocument();
  });

  it("closes the notice when a detail refresh reports no backlog", async () => {
    const user = userEvent.setup();
    const onInactive = vi.fn();
    render(
      <BroadcastProtectionNotice
        onInactive={onInactive}
        onRefresh={vi.fn().mockResolvedValue({ kind: "inactive" })}
        status={activeStatus}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "群发保护已激活，查看详情" }),
    );
    expect(onInactive).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
