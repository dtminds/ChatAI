import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  SettingsSubAccountCreateRequestSchema,
  SettingsSubAccountsResponseSchema,
  SettingsSubAccountUpdateRequestSchema,
} from "../src/settings/dto";

describe("settings sub-account DTOs", () => {
  it("accepts sub-account list responses with related seats", () => {
    expect(
      Value.Check(SettingsSubAccountsResponseSchema, {
        seats: [
          {
            avatarUrl: "https://example.com/drc.png",
            seatId: "101",
            name: "德瑞可",
          },
        ],
        subAccounts: [
          {
            account: "agent001",
            id: "11",
            name: "客服一号",
            seats: [
              {
                avatarUrl: "https://example.com/drc.png",
                seatId: "101",
                name: "德瑞可",
              },
            ],
            status: "active",
            type: 0,
          },
        ],
      }),
    ).toBe(true);
  });

  it("keeps login account immutable on updates", () => {
    expect(
      Value.Check(SettingsSubAccountCreateRequestSchema, {
        account: "agent001",
        name: "客服一号",
        password: "Strong1!",
        seatIds: ["101"],
      }),
    ).toBe(true);

    expect(
      Value.Check(SettingsSubAccountUpdateRequestSchema, {
        account: "agent002",
        name: "客服二号",
        password: "",
        seatIds: ["101"],
      }),
    ).toBe(false);
  });
});
