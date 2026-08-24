import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/request";
import {
  getSelectableFriendAddWays,
  listWorkflowFriendAddWays,
} from "@/pages/chat/workflow/workflow-friend-add-way-resource";

vi.mock("@/lib/request", () => ({
  http: {
    get: vi.fn(),
  },
}));

describe("workflow friend add-way resource", () => {
  beforeEach(() => {
    vi.mocked(http.get).mockReset();
  });

  it("loads the public friend add-way catalog once", async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        groups: [
          {
            children: [{ key: "scan.mini_program", title: "小程序" }],
            key: "scan",
            title: "扫描二维码",
          },
        ],
      },
      success: true,
    });

    await expect(listWorkflowFriendAddWays()).resolves.toEqual([
      {
        children: [{ key: "scan.mini_program", title: "小程序" }],
        key: "scan",
        title: "扫描二维码",
      },
    ]);
    expect(http.get).toHaveBeenCalledWith("/server/workflow/friend-add-ways");
  });

  it("exposes leaf keys for groups with children and parent keys otherwise", () => {
    expect(getSelectableFriendAddWays([
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
    ])).toEqual([
      { groupTitle: "扫描二维码", key: "scan.mini_program", title: "小程序" },
      { groupTitle: "扫描二维码", key: "scan.group", title: "群二维码" },
      { groupTitle: "搜索手机号", key: "search", title: "搜索手机号" },
    ]);
  });
});
