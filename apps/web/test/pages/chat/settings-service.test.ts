import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSubAccount,
  deleteSubAccount,
  listGroupChats,
  listSubAccounts,
  syncManagedAccountSeatGroups,
  updateGroupChatReception,
  updateSubAccount,
  updateSubAccountStatus,
} from "@/pages/chat/settings/settings-service";
import { requestInstance } from "@/lib/request";

const mock = new MockAdapter(requestInstance);

describe("settings service", () => {
  afterEach(() => {
    mock.reset();
  });

  it("uses public /server settings endpoints for sub-account CRUD", async () => {
    mock.onGet("/server/settings/sub-accounts").reply(200, {
      data: {
        seats: [],
        subAccounts: [],
      },
      success: true,
    });
    mock.onPost("/server/settings/sub-accounts").reply((config) => [
      200,
      {
        data: JSON.parse(config.data ?? "{}"),
        success: true,
      },
    ]);
    mock.onPut("/server/settings/sub-accounts/11").reply((config) => [
      200,
      {
        data: JSON.parse(config.data ?? "{}"),
        success: true,
      },
    ]);
    mock.onPatch("/server/settings/sub-accounts/11/status").reply((config) => [
      200,
      {
        data: JSON.parse(config.data ?? "{}"),
        success: true,
      },
    ]);
    mock.onDelete("/server/settings/sub-accounts/11").reply(200, {
      data: { deleted: true },
      success: true,
    });

    await listSubAccounts();
    await createSubAccount({
      account: "agent001",
      name: "客服一号",
      password: "Strong1!",
      role: "admin",
      seatIds: ["101"],
    });
    await updateSubAccount("11", {
      name: "客服一号改",
      password: "",
      role: "operator",
      seatIds: [],
    });
    await updateSubAccountStatus("11", "disabled");
    await deleteSubAccount("11");

    expect(mock.history.get[0]?.url).toBe("/server/settings/sub-accounts");
    expect(mock.history.post[0]?.url).toBe("/server/settings/sub-accounts");
    expect(mock.history.put[0]?.url).toBe("/server/settings/sub-accounts/11");
    expect(mock.history.patch[0]?.url).toBe("/server/settings/sub-accounts/11/status");
    expect(mock.history.delete[0]?.url).toBe("/server/settings/sub-accounts/11");
  });

  it("uses public /server settings endpoints for managed-account seat group sync", async () => {
    mock.onPost("/server/settings/managed-accounts/102/sync-seat-groups").reply(200, {
      data: { synced: true },
      success: true,
    });

    await syncManagedAccountSeatGroups("102", { syncMembers: true });

    expect(mock.history.post[0]?.url).toBe(
      "/server/settings/managed-accounts/102/sync-seat-groups",
    );
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      syncMembers: true,
    });
  });

  it("uses public /server settings endpoints for group chat listing", async () => {
    mock.onGet("/server/settings/group-chats").reply(200, {
      data: {
        filterManagedAccounts: [{ id: "101", name: "德瑞可" }],
        groupChats: [],
      },
      success: true,
    });

    await listGroupChats({ keyword: "护肤", managedAccountId: "101" });

    expect(mock.history.get[0]?.url).toBe("/server/settings/group-chats");
    expect(mock.history.get[0]?.params).toEqual({
      keyword: "护肤",
      managedAccountId: "101",
    });
  });

  it("uses public /server settings endpoints for group chat reception updates", async () => {
    mock.onPut("/server/settings/group-chats/reception").reply(200, {
      data: { updated: true },
      success: true,
    });

    await updateGroupChatReception({
      groupChatIds: ["501"],
      hostUserSeatIds: ["102"],
    });

    expect(mock.history.put[0]?.url).toBe("/server/settings/group-chats/reception");
    expect(JSON.parse(mock.history.put[0]?.data ?? "{}")).toEqual({
      groupChatIds: ["501"],
      hostUserSeatIds: ["102"],
    });
  });
});
