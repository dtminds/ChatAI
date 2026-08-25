import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FriendAddWaySelection } from "@/pages/chat/workflow/nodes/start/friend-add-way-selection";
import { listWorkflowFriendAddWayActivities } from "@/pages/chat/workflow/workflow-friend-add-way-resource";

vi.mock("@/pages/chat/workflow/workflow-friend-add-way-resource", async () => {
  const actual = await vi.importActual<
    typeof import("@/pages/chat/workflow/workflow-friend-add-way-resource")
  >("@/pages/chat/workflow/workflow-friend-add-way-resource");
  return {
    ...actual,
    listWorkflowFriendAddWayActivities: vi.fn(),
  };
});

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

describe("friend add-way selection", () => {
  beforeEach(() => {
    vi.mocked(listWorkflowFriendAddWayActivities).mockReset();
  });

  it("selects a single-level source from the cascading menu", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        status="ready"
        value={{ addWayKey: null, sourceIds: [], sourceMatchMode: "all" }}
      />,
    );

    const sourceSelect = screen.getByRole("button", { name: "添加好友来源" });
    expect(sourceSelect).toHaveTextContent("请选择");

    await user.click(sourceSelect);
    expect(screen.queryByRole("option", { name: "不限来源" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索手机号" }));

    expect(onChange).toHaveBeenCalledWith({
      addWayKey: "search",
      sourceIds: ["search"],
      sourceMatchMode: "all",
    });
    expect(screen.queryByRole("combobox", { name: "匹配方式" })).not.toBeInTheDocument();
  });

  it("selects a child source and keeps match mode on the same row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        status="ready"
        value={{ addWayKey: null, sourceIds: [], sourceMatchMode: "all" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加好友来源" }));
    await user.click(screen.getByRole("button", { name: "扫描二维码" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "小程序" }));

    expect(onChange).toHaveBeenCalledWith({
      addWayKey: "scan.mini_program",
      sourceIds: ["scan.mini_program"],
      sourceMatchMode: "all",
    });
  });

  it("shows the selected path and match mode together", () => {
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={vi.fn()}
        status="ready"
        value={{
          addWayKey: "scan.mini_program",
          sourceIds: ["scan.mini_program"],
          sourceMatchMode: "all",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "添加好友来源" }))
      .toHaveTextContent("扫描二维码 / 小程序");
    expect(screen.getByRole("combobox", { name: "匹配方式" })).toHaveTextContent("不限");
    expect(screen.queryByRole("button", { name: /请选择活动|已选择/ })).not.toBeInTheDocument();
  });

  it.each([
    {
      addWayKey: "removed-way",
      sourceIds: ["removed-way"],
    },
    {
      addWayKey: null,
      sourceIds: ["activity-1", "activity-2"],
    },
  ])("marks a configured source that the catalog cannot resolve as invalid", (value) => {
    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={vi.fn()}
        status="ready"
        value={{ ...value, sourceMatchMode: "all" }}
      />,
    );

    expect(screen.getByRole("button", { name: "添加好友来源" }))
      .toHaveTextContent("已失效的添加好友来源");
  });

  it("opens the activity picker on the second row for any", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(listWorkflowFriendAddWayActivities).mockImplementation(async ({ page }) => {
      if (page === 2) {
        return {
          items: [{ addWayId: "live-21", createTime: 1_710_000_000_000, title: "第二页活动" }],
          pagination: { hasNext: false, page: 2, pageSize: 10, total: 21 },
        };
      }

      return {
        items: [
          { addWayId: "live-1", createTime: 1_710_000_000_000, title: "门店活码" },
          { addWayId: "live-2", title: "活动活码" },
        ],
        pagination: { hasNext: true, page: 1, pageSize: 10, total: 21 },
      };
    });

    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        status="ready"
        value={{
          addWayKey: "scan.mini_program",
          sourceIds: [],
          sourceMatchMode: "any",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /请选择活动/ }));
    const dialog = await screen.findByRole("dialog", { name: "选择活动" });
    expect(await within(dialog).findByRole("checkbox", { name: "门店活码" })).toBeInTheDocument();
    expect(listWorkflowFriendAddWayActivities).toHaveBeenCalledWith({
      key: "scan.mini_program",
      page: 1,
      pageSize: 10,
      title: undefined,
    });
    expect(within(dialog).getByRole("columnheader", { name: "创建时间" })).toBeInTheDocument();
    expect(within(dialog).getByText("共 21 条")).toBeInTheDocument();
    expect(within(dialog).getByText("已选择 0/5")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox", { name: "门店活码" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(dialog).getByText("已选择 1/5")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "下一页" }));
    expect(await within(dialog).findByRole("checkbox", { name: "第二页活动" })).toBeInTheDocument();
    expect(listWorkflowFriendAddWayActivities).toHaveBeenCalledWith({
      key: "scan.mini_program",
      page: 2,
      pageSize: 10,
      title: undefined,
    });

    await user.click(within(dialog).getByRole("button", { name: "确定" }));
    expect(onChange).toHaveBeenCalledWith({
      addWayKey: "scan.mini_program",
      sourceIds: ["live-1"],
      sourceMatchMode: "any",
    });
  });

  it("limits activity selection to five", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(listWorkflowFriendAddWayActivities).mockResolvedValue({
      items: Array.from({ length: 6 }, (_, index) => ({
        addWayId: `live-${index + 1}`,
        title: `活动 ${index + 1}`,
      })),
      pagination: { hasNext: false, page: 1, pageSize: 10, total: 6 },
    });

    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        status="ready"
        value={{
          addWayKey: "scan.mini_program",
          sourceIds: [],
          sourceMatchMode: "any",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /请选择活动/ }));
    const dialog = await screen.findByRole("dialog", { name: "选择活动" });
    expect(within(dialog).getByText("已选择 0/5")).toBeInTheDocument();
    const firstFive = Array.from({ length: 5 }, (_, index) => `活动 ${index + 1}`);
    for (const title of firstFive) {
      await user.click(await within(dialog).findByRole("checkbox", { name: title }));
    }

    expect(within(dialog).getByText("已选择 5/5")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "活动 6" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "确定" }));
    expect(onChange).toHaveBeenCalledWith({
      addWayKey: "scan.mini_program",
      sourceIds: ["live-1", "live-2", "live-3", "live-4", "live-5"],
      sourceMatchMode: "any",
    });
  });

  it("shows a fallback for an activity with a missing title", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflowFriendAddWayActivities).mockResolvedValue({
      items: [{ addWayId: "live-1", title: undefined as never }],
      pagination: { hasNext: false, page: 1, pageSize: 10, total: 1 },
    });

    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={vi.fn()}
        status="ready"
        value={{
          addWayKey: "scan.mini_program",
          sourceIds: [],
          sourceMatchMode: "any",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /请选择活动/ }));
    const dialog = await screen.findByRole("dialog", { name: "选择活动" });
    expect(await within(dialog).findByRole("checkbox", { name: "未命名" })).toBeInTheDocument();
    expect(within(dialog).getByText("未命名")).toBeInTheDocument();
  });

  it("does not allow selecting an activity without an add-way ID", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(listWorkflowFriendAddWayActivities).mockResolvedValue({
      items: [{ addWayId: "", title: "异常活动" }],
      pagination: { hasNext: false, page: 1, pageSize: 10, total: 1 },
    });

    render(
      <FriendAddWaySelection
        groups={groups}
        onChange={onChange}
        status="ready"
        value={{
          addWayKey: "scan.mini_program",
          sourceIds: [],
          sourceMatchMode: "any",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /请选择活动/ }));
    const dialog = await screen.findByRole("dialog", { name: "选择活动" });
    expect(await within(dialog).findByRole("checkbox", { name: "异常活动" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "确定" }));
    expect(onChange).toHaveBeenCalledWith({
      addWayKey: "scan.mini_program",
      sourceIds: [],
      sourceMatchMode: "any",
    });
  });

  it("retries catalog loading failures", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <FriendAddWaySelection
        groups={[]}
        onChange={vi.fn()}
        onRetry={onRetry}
        status="error"
        value={{ addWayKey: null, sourceIds: [], sourceMatchMode: "all" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
