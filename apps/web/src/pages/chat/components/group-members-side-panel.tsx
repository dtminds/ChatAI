import { useMemo, useState } from "react";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import {
  Cancel01Icon,
  ReloadIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/pages/chat/chat-types";

const GROUP_MEMBER_SORT_RANK = {
  [GROUP_MEMBER_TYPE.OWNER]: 0,
  [GROUP_MEMBER_TYPE.ADMIN]: 1,
  [GROUP_MEMBER_TYPE.NORMAL]: 2,
} as const;

const groupMemberNameSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export function GroupMembersSidePanel({
  groupMembers,
  isLoading,
  onRefresh,
}: {
  groupMembers: GroupMember[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const normalizedSearchKeyword = searchKeyword.trim().toLocaleLowerCase();
  const filteredGroupMembers = useMemo(
    () =>
      normalizedSearchKeyword
        ? groupMembers.filter((member) =>
            member.displayName.toLocaleLowerCase().includes(normalizedSearchKeyword),
          )
        : groupMembers,
    [groupMembers, normalizedSearchKeyword],
  );
  const groups = useMemo(
    () =>
      [
        {
          items: filteredGroupMembers
            .filter(
              (member) =>
                member.type === GROUP_MEMBER_TYPE.OWNER ||
                member.type === GROUP_MEMBER_TYPE.ADMIN,
            )
            .sort(sortGroupMembers),
          label: "管理员",
        },
        {
          items: filteredGroupMembers
            .filter((member) => member.type === GROUP_MEMBER_TYPE.NORMAL)
            .sort(sortGroupMembers),
          label: "普通成员",
        },
      ].filter((group) => group.items.length > 0),
    [filteredGroupMembers],
  );

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="space-y-4 px-4 py-4">
        <div className="flex h-6 items-center justify-between gap-2">
          <div className="flex h-6 min-w-0 flex-1 items-center">
            {isSearchOpen ? (
              <Input
                aria-label="搜索群成员"
                autoFocus
                className="h-6 rounded-[6px] px-2 py-0 text-xs leading-4 shadow-none md:text-xs"
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="搜索群成员"
                value={searchKeyword}
              />
            ) : (
              <h2 className="min-w-0 whitespace-nowrap text-xs font-semibold leading-4 text-muted-foreground">
                群成员 · 共 {groupMembers.length} 人
              </h2>
            )}
          </div>
          <div className="flex h-6 shrink-0 items-center gap-1">
            <Button
              aria-label={isSearchOpen ? "关闭搜索" : "搜索群成员"}
              className="size-6 shrink-0 rounded-[6px] text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => {
                if (isSearchOpen) {
                  setSearchKeyword("");
                  setIsSearchOpen(false);
                  return;
                }

                setIsSearchOpen(true);
              }}
              size="icon"
              title={isSearchOpen ? "关闭搜索" : "搜索群成员"}
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                icon={isSearchOpen ? Cancel01Icon : Search01Icon}
                size={13}
                strokeWidth={2}
              />
            </Button>
            <Button
              aria-label="刷新群成员"
              className="size-6 shrink-0 rounded-[6px] text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              disabled={isLoading}
              onClick={onRefresh}
              size="icon"
              title="刷新群成员"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={ReloadIcon} size={13} strokeWidth={2} />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[120px] items-center justify-center py-4">
            <DotMatrixLoader className="text-muted-foreground" type="square-5" />
          </div>
        ) : groups.length > 0 ? (
          groups.map((group) => (
            <section className="space-y-1.5" key={group.label}>
              <h3
                className={cn(
                  "text-xs font-medium leading-4",
                  group.label === "管理员" ? "text-success" : "text-warning",
                )}
              >
                {group.label}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((member) => (
                  <GroupMemberRow key={member.id} member={member} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="px-0 py-8 text-center text-sm text-muted-foreground">
            {normalizedSearchKeyword ? "暂无匹配成员" : "暂无群成员"}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function GroupMemberRow({ member }: { member: GroupMember }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-[6px] px-1 py-1.5"
      data-group-member-id={member.id}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarImage alt={member.displayName} src={member.avatarUrl} />
        <AvatarFallback className="text-[11px]">
          {getFirstGroupMemberNameGrapheme(member.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-4 text-foreground">
          {member.displayName}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {member.type === GROUP_MEMBER_TYPE.OWNER ? (
          <Badge variant="secondary" className="h-4 rounded-[4px] px-1 text-[10px]">
            群主
          </Badge>
        ) : null}
        {member.isOpeningAccount ? (
          <Badge className="h-4 rounded-[4px] bg-success/10 px-1 text-[10px] text-success">
            开通号
          </Badge>
        ) : null}
        {member.isReceptionAccount ? (
          <Badge className="h-4 rounded-[4px] bg-warning/10 px-1 text-[10px] text-warning">
            接待号
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function getFirstGroupMemberNameGrapheme(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return (
    groupMemberNameSegmenter?.segment(trimmedValue)[Symbol.iterator]().next()
      .value?.segment ??
    [...trimmedValue][0] ??
    ""
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
