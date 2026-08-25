import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/request";
import {
  friendAddWayHasSecondary,
  getFriendAddWayDisplayTitle,
  isFriendAddWaySelectionInvalid,
  listWorkflowFriendAddWayActivities,
  listWorkflowFriendAddWays,
  resolveFriendAddWayPath,
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

  it("loads one activity page for the selected add-way key", async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        items: [{ addWayId: "live-1", title: "门店活码" }],
        pagination: { hasNext: true, page: 1, pageSize: 20, total: 21 },
      },
      success: true,
    });

    await expect(listWorkflowFriendAddWayActivities({
      key: "scan",
      page: 1,
      pageSize: 20,
      title: "门店",
    })).resolves.toEqual({
      items: [{ addWayId: "live-1", title: "门店活码" }],
      pagination: { hasNext: true, page: 1, pageSize: 20, total: 21 },
    });
    expect(http.get).toHaveBeenCalledWith(
      "/server/workflow/friend-add-way-activities?key=scan&page=1&pageSize=20&title=%E9%97%A8%E5%BA%97",
    );
  });

  it("resolves parent and child keys for the cascading path", () => {
    const scan = {
      children: [{ key: "scan.mini_program", title: "小程序" }],
      key: "scan",
      title: "扫描二维码",
    };
    const search = {
      children: [],
      key: "search",
      title: "搜索手机号",
    };

    expect(resolveFriendAddWayPath([scan, search], "scan.mini_program")).toEqual({
      child: { key: "scan.mini_program", title: "小程序" },
      group: scan,
    });
    expect(getFriendAddWayDisplayTitle({
      child: { key: "scan.mini_program", title: "小程序" },
      group: scan,
    })).toBe("扫描二维码 / 小程序");
    expect(friendAddWayHasSecondary({ child: null, group: scan })).toBe(true);
    expect(friendAddWayHasSecondary({ child: null, group: search })).toBe(false);
    expect(isFriendAddWaySelectionInvalid([scan, search], {
      addWayKey: "scan.mini_program",
      sourceIds: ["activity-1"],
    })).toBe(false);
    expect(isFriendAddWaySelectionInvalid([scan, search], {
      sourceIds: ["scan.mini_program"],
    })).toBe(false);
    expect(isFriendAddWaySelectionInvalid([scan, search], {
      addWayKey: "removed-way",
      sourceIds: ["removed-way"],
    })).toBe(true);
    expect(isFriendAddWaySelectionInvalid([scan, search], {
      sourceIds: ["activity-1", "activity-2"],
    })).toBe(true);
  });
});
