// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { SettingsSidebarItem } from "@chatai/contracts";
import {
  filterSidebarItemsForConversationMode,
  sortSidebarItems,
} from "@/pages/chat/lib/sidebar-items";

function createItem(
  overrides: Partial<SettingsSidebarItem> & Pick<SettingsSidebarItem, "id" | "name">,
): SettingsSidebarItem {
  return {
    bindTypes: ["1", "2"],
    sort: 1,
    status: "active",
    url: "https://example.com",
    ...overrides,
  };
}

describe("sidebar items", () => {
  it("sorts by sort value then numeric id", () => {
    expect(
      sortSidebarItems([
        createItem({ id: "3", name: "later", sort: 2 }),
        createItem({ id: "10", name: "higher-id", sort: 1 }),
        createItem({ id: "2", name: "lower-id", sort: 1 }),
      ]).map((item) => item.id),
    ).toEqual(["2", "10", "3"]);
  });

  it("keeps items that match the conversation bind type", () => {
    const items = [
      createItem({ bindTypes: ["1"], id: "single", name: "单聊" }),
      createItem({ bindTypes: ["2"], id: "group", name: "群聊" }),
    ];

    expect(
      filterSidebarItemsForConversationMode(items, "single").map((item) => item.id),
    ).toEqual(["single"]);
    expect(
      filterSidebarItemsForConversationMode(items, "group").map((item) => item.id),
    ).toEqual(["group"]);
  });
});
