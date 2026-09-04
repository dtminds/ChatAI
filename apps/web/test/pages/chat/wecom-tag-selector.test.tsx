import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WecomTagSelector } from "@/pages/chat/components/wecom-tag-selector";

const workTagServiceMock = vi.hoisted(() => ({
  getWorkTagsByIds: vi.fn(),
  listWorkTagGroups: vi.fn(),
  listWorkTags: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/api/work-tag-service", () => workTagServiceMock);

const groups = [
  { attr: 1 as const, id: 11, name: "意向标签组", tagCount: 2 },
  { attr: 1 as const, id: 12, name: "客户阶段组", tagCount: 1 },
];

function createTag(id: number, name: string, groupId: number, groupName: string) {
  return {
    groupAttr: 1 as const,
    groupId,
    groupName,
    groupSort: 10,
    id,
    name,
    type: 0 as const,
  };
}

const tagsByGroup = new Map([
  [
    11,
    [
      createTag(101, "高意向", 11, "意向标签组"),
      createTag(102, "低意向", 11, "意向标签组"),
    ],
  ],
  [12, [createTag(201, "已成交", 12, "客户阶段组")]],
]);

function renderSelector(
  overrides: Partial<ComponentProps<typeof WecomTagSelector>> = {},
) {
  const onChange = vi.fn();
  render(
    <WecomTagSelector
      onChange={onChange}
      value={[]}
      {...overrides}
    />,
  );
  return onChange;
}

async function openSelector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /请选择标签/ }));
  await screen.findByRole("button", { name: "意向标签组" });
  await screen.findByRole("checkbox", { name: "高意向" });
}

describe("WecomTagSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workTagServiceMock.getWorkTagsByIds.mockImplementation(async (tagIds: number[]) => ({
      tags: tagIds.flatMap((tagId) => {
        for (const tags of tagsByGroup.values()) {
          const tag = tags.find(item => item.id === tagId);
          if (tag) return [{ groupName: tag.groupName, id: tag.id, name: tag.name }];
        }
        return [];
      }),
    }));
    workTagServiceMock.listWorkTagGroups.mockResolvedValue({ groups });
    workTagServiceMock.listWorkTags.mockImplementation(async ({ groupId, page = 1 }) => ({
      pagination: { hasNext: false, page, pageSize: 50, total: 2 },
      tags: tagsByGroup.get(groupId) ?? [],
    }));
  });

  it("loads remote groups and preserves selections across groups before confirming", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector({ allowCrossGroup: true, multiple: true });

    await openSelector(user);
    expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledWith({ attr: 1, type: 0 });
    await user.click(screen.getByRole("checkbox", { name: "高意向" }));
    await user.click(screen.getByRole("button", { name: "客户阶段组" }));
    await user.click(await screen.findByRole("checkbox", { name: "已成交" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(onChange).toHaveBeenCalledWith([101, 201]);
  });

  it("keeps same-group multiple selection but replaces it when cross-group selection is disabled", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector({ allowCrossGroup: false, multiple: true });

    await openSelector(user);
    await user.click(screen.getByRole("checkbox", { name: "高意向" }));
    await user.click(screen.getByRole("checkbox", { name: "低意向" }));
    await user.click(screen.getByRole("button", { name: "客户阶段组" }));
    await user.click(await screen.findByRole("checkbox", { name: "已成交" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(onChange).toHaveBeenCalledWith([201]);
  });

  it("replaces the current value in single-select mode", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector({ multiple: false });

    await openSelector(user);
    await user.click(screen.getByRole("checkbox", { name: "高意向" }));
    await user.click(screen.getByRole("checkbox", { name: "低意向" }));
    expect(screen.getByRole("checkbox", { name: "高意向" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(onChange).toHaveBeenCalledWith([102]);
  });

  it("prevents selecting beyond the configured maximum", async () => {
    const user = userEvent.setup();
    renderSelector({ maxSelected: 1, multiple: true });

    await openSelector(user);
    await user.click(screen.getByRole("checkbox", { name: "高意向" }));

    expect(screen.getByRole("checkbox", { name: "低意向" })).toBeDisabled();
  });

  it("does not commit draft changes when cancelled", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector();

    await openSelector(user);
    await user.click(screen.getByRole("checkbox", { name: "高意向" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("resolves persisted tag names in the selected column and allows removing them", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector({ value: [101, 201] });

    await user.click(screen.getByRole("button", { name: /已选择 2 个标签/ }));
    const selectedList = await screen.findByRole("list", { name: "已选标签" });
    expect(await within(selectedList).findByText("意向标签组")).toBeInTheDocument();
    expect(await within(selectedList).findByText("高意向")).toBeInTheDocument();
    expect(within(selectedList).getByText("客户阶段组")).toBeInTheDocument();
    expect(within(selectedList).getByText("已成交")).toBeInTheDocument();
    expect(workTagServiceMock.getWorkTagsByIds).toHaveBeenCalledWith([101, 201]);

    await user.click(screen.getByRole("button", { name: "移除标签 101" }));
    expect(within(selectedList).queryByText("高意向")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(onChange).toHaveBeenCalledWith([201]);
  });

  it("keeps an ID fallback when a persisted tag no longer exists", async () => {
    const user = userEvent.setup();
    renderSelector({ value: [999] });

    await user.click(screen.getByRole("button", { name: /已选择 1 个标签/ }));
    const selectedList = await screen.findByRole("list", { name: "已选标签" });

    expect(await within(selectedList).findByText("ID: 999")).toBeInTheDocument();
  });

  it("clears all selected tag IDs from the selected column", async () => {
    const user = userEvent.setup();
    const onChange = renderSelector({ value: [101, 201] });

    await user.click(screen.getByRole("button", { name: /已选择 2 个标签/ }));
    await user.click(screen.getByRole("button", { name: "清空已选标签" }));
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("loads additional pages and retries a failed group request", async () => {
    const user = userEvent.setup();
    workTagServiceMock.listWorkTagGroups
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue({ groups });
    workTagServiceMock.listWorkTags.mockImplementation(async ({ groupId, page = 1 }) => ({
      pagination: { hasNext: page === 1, page, pageSize: 50, total: 2 },
      tags: page === 1
        ? [createTag(101, "高意向", groupId, "意向标签组")]
        : [createTag(102, "低意向", groupId, "意向标签组")],
    }));
    renderSelector();

    await user.click(screen.getByRole("button", { name: /请选择标签/ }));
    await user.click(await screen.findByRole("button", { name: "重试" }));
    await screen.findByRole("checkbox", { name: "高意向" });
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(await screen.findByRole("checkbox", { name: "低意向" })).toBeInTheDocument();
    await waitFor(() => expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledTimes(2));
  });
});
