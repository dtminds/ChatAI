import type { SettingsSidebarItem } from "@chatai/contracts";

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
