import type { PointerEvent as ReactPointerEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CustomerBasicInfoPanel } from "@/pages/chat/components/customer-basic-info-panel";
import { GroupMembersSidePanel } from "@/pages/chat/components/group-members-side-panel";
import type {
  ChatMode,
  CustomerProfile,
  GroupMember,
} from "@/pages/chat/chat-types";
import type { SettingsSidebarItem } from "@chatai/contracts";

type CustomerSidePanelProps = {
  accountName?: string;
  conversationMode?: ChatMode;
  customer?: CustomerProfile;
  groupMembers: GroupMember[];
  isGroupMembersLoading: boolean;
  isResizing: boolean;
  panelWidth: number;
  sidebarItems: SettingsSidebarItem[];
  onRefreshGroupMembers: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function CustomerSidePanel({
  accountName,
  conversationMode,
  customer,
  groupMembers,
  isGroupMembersLoading,
  isResizing,
  panelWidth,
  sidebarItems,
  onRefreshGroupMembers,
  onResizeStart,
}: CustomerSidePanelProps) {
  const isGroupConversation = conversationMode === "group";
  const activeSidebarItems = sortSidebarItems(sidebarItems).filter(
    (item) => item.status === "active",
  );

  return (
    <>
      <button
        aria-label="调整客户信息栏宽度"
        className={cn(
          "relative flex w-1 shrink-0 cursor-col-resize items-stretch justify-center bg-surface",
          isResizing ? "bg-accent" : "hover:bg-surface-hover",
        )}
        onPointerDown={onResizeStart}
        type="button"
      >
        <span
          className={cn(
            "h-full w-px bg-divider",
            isResizing && "bg-primary/45",
          )}
        />
      </button>

      <aside
        aria-label={isGroupConversation ? "群成员信息栏" : "客户信息栏"}
        className="flex min-h-0 min-w-0 flex-col bg-surface"
        style={{ width: `${panelWidth}px` }}
      >
        <Tabs className="h-full min-h-0 gap-0" defaultValue="system">
          <div className="border-b border-divider px-4 py-2">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-x-4 gap-y-1 rounded-none bg-transparent p-0">
              <TabsTrigger
                className="h-10 min-w-0 rounded-none bg-transparent px-0 py-2 text-[13px] font-medium text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="system"
              >
                <span className="truncate">基础信息</span>
              </TabsTrigger>
              {activeSidebarItems.map((item) => (
                <TabsTrigger
                  className="h-10 min-w-0 rounded-none bg-transparent px-0 py-2 text-[13px] font-medium text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  key={item.id}
                  value={getSidebarTabValue(item)}
                >
                  <span className="truncate">{item.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value="system">
            {isGroupConversation ? (
              <GroupMembersSidePanel
                groupMembers={groupMembers}
                isLoading={isGroupMembersLoading}
                onRefresh={onRefreshGroupMembers}
              />
            ) : (
              <CustomerBasicInfoPanel accountName={accountName} customer={customer} />
            )}
          </TabsContent>

          {activeSidebarItems.map((item) => (
            <TabsContent
              className="mt-0 min-h-0 flex-1 overflow-hidden"
              key={item.id}
              value={getSidebarTabValue(item)}
            >
              <iframe
                className="h-full w-full border-0 bg-background"
                src={item.url}
                title={`${item.name}扩展页`}
              />
            </TabsContent>
          ))}
        </Tabs>
      </aside>
    </>
  );
}

function getSidebarTabValue(item: SettingsSidebarItem) {
  return `sidebar:${item.id}`;
}

function sortSidebarItems(items: SettingsSidebarItem[]) {
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
