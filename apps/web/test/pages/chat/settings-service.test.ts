import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSubAccount,
  deleteSubAccount,
  listSubAccounts,
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
});
