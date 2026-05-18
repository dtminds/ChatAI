import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { AuthSessionResponseSchema } from "../src/auth/dto";
import {
  SettingsSidebarItemCreateRequestSchema,
  SettingsSidebarItemsResponseSchema,
  SettingsSidebarItemsSortUpdateRequestSchema,
  SettingsSubAccountCreateRequestSchema,
  SettingsSubAccountsResponseSchema,
  SettingsSubAccountUpdateRequestSchema,
} from "../src/settings/dto";
import {
  isValidSettingsSubAccountPassword,
  settingsSubAccountPasswordMessage,
} from "../src/settings/password";

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
            role: "admin",
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
        role: "admin",
        seatIds: ["101"],
      }),
    ).toBe(true);

    expect(
      Value.Check(SettingsSubAccountUpdateRequestSchema, {
        account: "agent002",
        name: "客服二号",
        password: "",
        role: "operator",
        seatIds: ["101"],
      }),
    ).toBe(false);

    expect(
      Value.Check(SettingsSubAccountUpdateRequestSchema, {
        name: "客服二号",
        password: "",
        role: "owner",
        seatIds: ["101"],
      }),
    ).toBe(false);

    expect(
      Value.Check(SettingsSubAccountCreateRequestSchema, {
        account: "agent003",
        name: "客服三号",
        password: "Strong1!",
        role: "viewer",
        seatIds: ["101"],
      }),
    ).toBe(true);

    expect(
      Value.Check(SettingsSubAccountCreateRequestSchema, {
        account: "agent004",
        name: "客服四号",
        password: "Strong1!",
        role: "agent",
        seatIds: ["101"],
      }),
    ).toBe(false);
  });

  it("validates sub-account password complexity", () => {
    expect(settingsSubAccountPasswordMessage).toBe(
      "密码必须包含大写字母、小写字母、数字、符号",
    );
    expect(isValidSettingsSubAccountPassword("Strong1!")).toBe(true);
    expect(isValidSettingsSubAccountPassword("strong1!")).toBe(false);
    expect(isValidSettingsSubAccountPassword("STRONG1!")).toBe(false);
    expect(isValidSettingsSubAccountPassword("Strong!!")).toBe(false);
    expect(isValidSettingsSubAccountPassword("Strong11")).toBe(false);
  });

  it("accepts sidebar item responses and rejects extra create fields", () => {
    expect(
      Value.Check(SettingsSidebarItemsResponseSchema, {
        items: [
          {
            id: "201",
            name: "企业名片",
            sort: 1,
            status: "active",
            url: "https://example.com/card",
          },
          {
            id: "202",
            name: "客户详情",
            sort: 2,
            status: "disabled",
            url: "https://example.com/customer",
          },
        ],
      }),
    ).toBe(true);

    expect(
      Value.Check(SettingsSidebarItemCreateRequestSchema, {
        name: "素材中心",
        show: 1,
        url: "https://example.com/assets",
      }),
    ).toBe(false);

    expect(
      Value.Check(SettingsSidebarItemsSortUpdateRequestSchema, {
        itemIds: ["202", "201"],
      }),
    ).toBe(true);
  });

  it("accepts auth session role and permissions", () => {
    expect(
      Value.Check(AuthSessionResponseSchema, {
        subUser: {
          accountType: "sub",
          displayName: "客服一号",
          permissions: ["chat.access", "chat.send", "chat.takeover"],
          role: "operator",
          subUserId: "101",
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        subUser: {
          accountType: "sub",
          displayName: "客服二号",
          permissions: ["chat.access"],
          role: "viewer",
          subUserId: "102",
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(AuthSessionResponseSchema, {
        subUser: {
          accountType: "sub",
          displayName: "客服二号",
          permissions: ["settings.unknown"],
          role: "operator",
          subUserId: "102",
        },
      }),
    ).toBe(false);
  });
});
