import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FriendAddWaySelection } from "@/pages/chat/workflow/nodes/start/friend-add-way-selection";

const groups = [
  {
    children: [
      { key: "scan.mini_program", title: "小程序" },
      { key: "scan.group", title: "群二维码" },
    ],
    key: "scan",
    title: "扫描二维码",
  },
  {
    children: [],
    key: "search",
    title: "搜索手机号",
  },
];

async function openSelector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /不限来源|已选择/ }));
  await screen.findByRole("dialog", { name: "选择添加好友来源" });
}

describe("friend add-way selection", () => {
  it("commits catalog picks only after confirm and shows a count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        selectedKeys={["gone"]}
        status="ready"
      />,
    );

    expect(screen.getByRole("button", { name: /已选择 1 个来源/ })).toBeInTheDocument();
    expect(screen.queryByText("原选项不可用")).not.toBeInTheDocument();

    await openSelector(user);

    const groupsList = screen.getByRole("list", { name: "添加方式" });
    const itemsList = screen.getByRole("list", { name: "子类添加方式" });
    expect(within(groupsList).getByRole("button", { name: "扫描二维码" })).toBeInTheDocument();
    expect(within(groupsList).getByRole("checkbox", { name: "搜索手机号" })).toBeInTheDocument();
    expect(within(itemsList).getByRole("checkbox", { name: "小程序" })).toBeInTheDocument();
    expect(within(itemsList).getByRole("checkbox", { name: "群二维码" })).toBeInTheDocument();
    expect(within(itemsList).queryByRole("checkbox", { name: "搜索手机号" })).not.toBeInTheDocument();

    await user.click(within(groupsList).getByRole("checkbox", { name: "搜索手机号" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("list", { name: "子类添加方式" })).not.toBeInTheDocument();

    await user.click(within(groupsList).getByRole("button", { name: "扫描二维码" }));
    const restoredItemsList = screen.getByRole("list", { name: "子类添加方式" });
    await user.type(screen.getByRole("textbox", { name: "搜索子类添加方式" }), "小程序");
    expect(within(restoredItemsList).getByRole("checkbox", { name: "小程序" })).toBeInTheDocument();
    expect(within(restoredItemsList).queryByRole("checkbox", { name: "群二维码" })).not.toBeInTheDocument();

    await user.click(within(restoredItemsList).getByRole("checkbox", { name: "小程序" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(onChange).toHaveBeenCalledWith(["search", "scan.mini_program"]);
  });

  it("discards draft picks when cancelled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        selectedKeys={[]}
        status="ready"
      />,
    );

    await openSelector(user);
    await user.click(screen.getByRole("checkbox", { name: "搜索手机号" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops selecting after five sources", async () => {
    const user = userEvent.setup();
    render(
      <FriendAddWaySelection
        groups={[
          { children: [], key: "one", title: "来源一" },
          { children: [], key: "two", title: "来源二" },
          { children: [], key: "three", title: "来源三" },
          { children: [], key: "four", title: "来源四" },
          { children: [], key: "five", title: "来源五" },
          { children: [], key: "six", title: "来源六" },
        ]}
        onChange={vi.fn()}
        selectedKeys={[]}
        status="ready"
      />,
    );

    await openSelector(user);
    for (const name of ["来源一", "来源二", "来源三", "来源四", "来源五"]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }

    expect(screen.getByText("已选 5 / 5")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "来源六" })).toBeDisabled();
  });

  it("keeps a single-level dialog when no group has children", async () => {
    const user = userEvent.setup();
    render(
      <FriendAddWaySelection
        groups={[{ children: [], key: "search", title: "搜索手机号" }]}
        onChange={vi.fn()}
        selectedKeys={[]}
        status="ready"
      />,
    );

    await openSelector(user);
    expect(screen.getByRole("checkbox", { name: "搜索手机号" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "子类添加方式" })).not.toBeInTheDocument();
  });

  it("retries catalog loading failures", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <FriendAddWaySelection
        groups={[]}
        onChange={vi.fn()}
        onRetry={onRetry}
        selectedKeys={[]}
        status="error"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
