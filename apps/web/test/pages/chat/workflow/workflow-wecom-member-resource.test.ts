// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/request";
import {
  collectWeComMemberWorkUserIds,
  createWeComMemberRootsFromOptions,
  filterWeComMemberTree,
  findWeComMemberByWorkUserId,
  listWorkflowWeComMembers,
} from "@/pages/chat/workflow/workflow-wecom-member-resource";

vi.mock("@/lib/request", () => ({
  http: {
    get: vi.fn(),
  },
}));

const sales = {
  children: [
    {
      children: [],
      id: "1_201",
      kind: "member" as const,
      title: "张三",
      workUserId: 201,
    },
    {
      children: [],
      id: "1_202",
      kind: "member" as const,
      title: "李四",
      workUserId: 202,
    },
  ],
  id: "2_1",
  kind: "department" as const,
  title: "销售部",
};

describe("workflow wecom member resource", () => {
  beforeEach(() => {
    vi.mocked(http.get).mockReset();
  });

  it("loads the public WeCom member tree once", async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        memberLimit: 80,
        roots: [sales],
      },
      success: true,
    });

    await expect(listWorkflowWeComMembers()).resolves.toEqual({
      memberLimit: 80,
      roots: [sales],
    });
    expect(http.get).toHaveBeenCalledWith("/server/workflow/wecom-members");
  });

  it("maps fixture options into member nodes", () => {
    expect(createWeComMemberRootsFromOptions([
      { avatarUrl: "https://example.com/a.png", id: 201, label: "企微成员一" },
    ])).toEqual([
      {
        avatarUrl: "https://example.com/a.png",
        children: [],
        id: "member-201",
        kind: "member",
        title: "企微成员一",
        workUserId: 201,
      },
    ]);
  });

  it("collects unique member IDs and keeps department search ancestors", () => {
    expect(collectWeComMemberWorkUserIds([sales])).toEqual([201, 202]);
    expect(findWeComMemberByWorkUserId([sales], 202)?.title).toBe("李四");
    expect(filterWeComMemberTree([sales], "李四")).toEqual([
      {
        ...sales,
        children: [sales.children[1]],
      },
    ]);
  });

  it("does not collect unselectable members when checking a department", () => {
    expect(collectWeComMemberWorkUserIds([
      {
        ...sales,
        children: [
          ...sales.children,
          {
            children: [],
            id: "1_203",
            kind: "member",
            selectable: false,
            title: "未开通许可",
            workUserId: 203,
          },
        ],
      },
    ])).toEqual([201, 202]);
  });
});
