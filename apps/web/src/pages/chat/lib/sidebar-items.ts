import type { SettingsSidebarItem } from "@chatai/contracts";
import type { ChatMode } from "@/pages/chat/chat-types";

export function sidebarItemMatchesConversationMode(
  item: SettingsSidebarItem,
  conversationMode: ChatMode | undefined,
): boolean {
  const code =
    conversationMode === "group" ? "2" : conversationMode === "single" ? "1" : undefined;

  if (code === undefined) {
    return true;
  }

  return item.bindTypes.includes(code);
}

export function filterSidebarItemsForConversationMode(
  items: readonly SettingsSidebarItem[],
  conversationMode: ChatMode | undefined,
): SettingsSidebarItem[] {
  return items.filter((item) =>
    sidebarItemMatchesConversationMode(item, conversationMode),
  );
}

export function sortSidebarItems(items: readonly SettingsSidebarItem[]) {
  return [...items].sort((left, right) => {
    const sortDiff = left.sort - right.sort;

    if (sortDiff !== 0) {
      return sortDiff;
    }

    const leftId = Number(left.id);
    const rightId = Number(right.id);

    if (Number.isFinite(leftId) && Number.isFinite(rightId)) {
      return leftId - rightId;
    }

    return left.id.localeCompare(right.id);
  });
}
