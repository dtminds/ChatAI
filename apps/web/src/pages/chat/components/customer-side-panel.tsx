import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CustomerSystemPanel } from "@/pages/chat/components/customer-system-panel";
import type {
  ChatMode,
  CustomerProfile,
  GroupMember,
} from "@/pages/chat/chat-types";

const GROUP_MEMBER_SORT_RANK = {
  [GROUP_MEMBER_TYPE.OWNER]: 0,
  [GROUP_MEMBER_TYPE.ADMIN]: 1,
  [GROUP_MEMBER_TYPE.NORMAL]: 2,
} as const;

type CustomerSidePanelProps = {
  accountName?: string;
  conversationMode?: ChatMode;
  customer?: CustomerProfile;
  groupMembers: GroupMember[];
  isResizing: boolean;
  panelWidth: number;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function CustomerSidePanel({
  accountName,
  conversationMode,
  customer,
  groupMembers,
  isResizing,
  panelWidth,
  onResizeStart,
}: CustomerSidePanelProps) {
  const isGroupConversation = conversationMode === "group";

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
          <div className="border-b border-divider px-4">
            <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
              <TabsTrigger
                className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="system"
              >
                系统
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="baidu"
              >
                百度
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value="system">
            {isGroupConversation ? (
              <GroupMembersPanel groupMembers={groupMembers} />
            ) : (
              <CustomerSystemPanel accountName={accountName} customer={customer} />
            )}
          </TabsContent>

          <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="baidu">
            <iframe
              className="h-full w-full border-0 bg-background"
              src="https://www.baidu.com"
              title="百度客户扩展页"
            />
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}

function GroupMembersPanel({ groupMembers }: { groupMembers: GroupMember[] }) {
  const groups = useMemo(
    () =>
      [
        {
          items: groupMembers
            .filter(
              (member) =>
                member.type === GROUP_MEMBER_TYPE.OWNER ||
                member.type === GROUP_MEMBER_TYPE.ADMIN,
            )
            .sort(sortGroupMembers),
          label: "管理员",
        },
        {
          items: groupMembers
            .filter((member) => member.type === GROUP_MEMBER_TYPE.NORMAL)
            .sort(sortGroupMembers),
          label: "普通成员",
        },
      ].filter((group) => group.items.length > 0),
    [groupMembers],
  );

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="space-y-5 px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">群成员</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            共 {groupMembers.length} 人
          </p>
        </div>

        {groups.length > 0 ? (
          groups.map((group) => (
            <section className="space-y-2" key={group.label}>
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((member) => (
                  <GroupMemberRow key={member.id} member={member} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-[8px] border border-dashed border-divider px-3 py-8 text-center text-sm text-muted-foreground">
            暂无群成员
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function GroupMemberRow({ member }: { member: GroupMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[6px] px-1 py-2">
      <Avatar className="size-8 shrink-0">
        <AvatarImage alt={member.displayName} src={member.avatarUrl} />
        <AvatarFallback className="text-xs">
          {member.displayName.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {member.displayName}
        </div>
      </div>
      {member.type === GROUP_MEMBER_TYPE.OWNER ? (
        <Badge variant="secondary" className="shrink-0 rounded-[6px] text-[11px]">
          群主
        </Badge>
      ) : null}
    </div>
  );
}

function sortGroupMembers(left: GroupMember, right: GroupMember) {
  const leftRank = GROUP_MEMBER_SORT_RANK[left.type];
  const rightRank = GROUP_MEMBER_SORT_RANK[right.type];

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const nameOrder = left.displayName.localeCompare(right.displayName, "zh-Hans-CN");

  if (nameOrder !== 0) {
    return nameOrder;
  }

  return left.id.localeCompare(right.id, "zh-Hans-CN");
}
