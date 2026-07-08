import { MoreHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AgentAssociationField,
  FeatureStatus,
  PermissionSettingRow,
  getInitial,
} from "./hosting-settings-shared";

type GroupChatHostingAgent = {
  id: string;
  isPublished: boolean;
  name: string;
};

type GroupChatHostingAutoReplyAccount = {
  avatarUrl: string;
  id: string;
  name: string;
};

type GroupChatHostingReplyRule = "at_customer" | "quote";

type GroupChatHostingItem = {
  agentId: string | null;
  autoReplyAccount: GroupChatHostingAutoReplyAccount | null;
  avatarUrl: string;
  fullAutoAuth: boolean;
  id: string;
  name: string;
  replyRule: GroupChatHostingReplyRule;
  semiAutoAuth: boolean;
};

type GroupChatHostingSettingsDraft = {
  agentId: string | undefined;
  autoReplyAccountId: string | undefined;
  fullAutoAuth: boolean;
  replyRule: GroupChatHostingReplyRule;
  semiAutoAuth: boolean;
};

const SELECTED_GROUP_PREVIEW_LIMIT = 5;
const fullAutoAuthUnavailableMessage = "该功能内测中，如需开通请联系客服";

const mockGroupChatHostingAgents: GroupChatHostingAgent[] = [
  {
    id: "301",
    isPublished: true,
    name: "群内护肤小助理",
  },
];

const mockAutoReplyAccounts: GroupChatHostingAutoReplyAccount[] = [
  {
    avatarUrl: "",
    id: "101",
    name: "护肤小助理-花花🌸",
  },
  {
    avatarUrl: "",
    id: "102",
    name: "护肤小助理-可可",
  },
];

const mockGroupChatHostingItems: GroupChatHostingItem[] = Array.from({ length: 4 }, (_, index) => ({
  agentId: "301",
  autoReplyAccount: mockAutoReplyAccounts[0],
  avatarUrl: "",
  fullAutoAuth: true,
  id: String(501 + index),
  name: "大鱼Studio护肤大本营 1群",
  replyRule: "quote",
  semiAutoAuth: true,
}));

export function GroupChatHostingSettingsTab() {
  const navigate = useNavigate();
  const [groupChats, setGroupChats] = useState(mockGroupChatHostingItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupChatIds, setSelectedGroupChatIds] = useState<string[]>([]);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTargetGroupChatIds, setSettingsTargetGroupChatIds] = useState<string[]>([]);

  const filteredGroupChats = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return groupChats;
    }

    return groupChats.filter((groupChat) => groupChat.name.toLowerCase().includes(normalizedQuery));
  }, [groupChats, searchQuery]);

  const visibleGroupChatIdSet = useMemo(
    () => new Set(filteredGroupChats.map((groupChat) => groupChat.id)),
    [filteredGroupChats],
  );
  const visibleSelectedGroupChatIds = useMemo(
    () => selectedGroupChatIds.filter((id) => visibleGroupChatIdSet.has(id)),
    [selectedGroupChatIds, visibleGroupChatIdSet],
  );
  const selectedVisibleCount = visibleSelectedGroupChatIds.length;
  const allVisibleSelected =
    filteredGroupChats.length > 0 && selectedVisibleCount === filteredGroupChats.length;
  const headerCheckboxState: boolean | "indeterminate" =
    selectedVisibleCount === 0
      ? false
      : allVisibleSelected
        ? true
        : "indeterminate";

  function toggleAllGroupChats(checked: boolean) {
    if (checked) {
      setSelectedGroupChatIds((current) => [
        ...new Set([...current, ...filteredGroupChats.map((groupChat) => groupChat.id)]),
      ]);
      return;
    }

    setSelectedGroupChatIds((current) =>
      current.filter((id) => !visibleGroupChatIdSet.has(id)),
    );
  }

  function toggleGroupChatSelection(groupChatId: string) {
    setSelectedGroupChatIds((current) =>
      current.includes(groupChatId)
        ? current.filter((id) => id !== groupChatId)
        : [...current, groupChatId],
    );
  }

  function openSettingsDialog(groupChatIds: string[]) {
    setSettingsTargetGroupChatIds(groupChatIds);
    setSettingsDialogOpen(true);
  }

  function handleSaveSettings(groupChatIds: string[], draft: GroupChatHostingSettingsDraft) {
    const selectedAutoReplyAccount = draft.autoReplyAccountId
      ? mockAutoReplyAccounts.find((account) => account.id === draft.autoReplyAccountId)
      : undefined;

    setGroupChats((current) =>
      current.map((groupChat) =>
        groupChatIds.includes(groupChat.id)
          ? {
              ...groupChat,
              agentId: draft.agentId ?? null,
              autoReplyAccount: selectedAutoReplyAccount ?? groupChat.autoReplyAccount,
              fullAutoAuth: draft.fullAutoAuth,
              replyRule: draft.replyRule,
              semiAutoAuth: draft.semiAutoAuth,
            }
          : groupChat,
      ),
    );
    setSelectedGroupChatIds((current) => current.filter((id) => !groupChatIds.includes(id)));
    setSettingsDialogOpen(false);
  }

  function handleGoToAddAgent() {
    setSettingsDialogOpen(false);
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <>
      <section aria-label="群聊托管设置列表">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-[280px] max-w-full">
            <HugeiconsIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              color="currentColor"
              icon={Search01Icon}
              size={17}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索群聊"
              className="h-10 rounded-[8px] pl-9"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索群聊"
              value={searchQuery}
            />
          </div>

          <Button
            className="h-10 px-4"
            disabled={visibleSelectedGroupChatIds.length === 0}
            onClick={() => openSettingsDialog(visibleSelectedGroupChatIds)}
            type="button"
            variant="outline"
          >
            <span>批量设置</span>
            {visibleSelectedGroupChatIds.length > 0 ? (
              <Badge className="-mr-1 px-2 py-0.5" variant="secondary">
                {visibleSelectedGroupChatIds.length}
              </Badge>
            ) : null}
          </Button>
        </div>

        <div className="mt-4">
          <GroupChatHostingSettingsTable
            agents={mockGroupChatHostingAgents}
            groupChats={filteredGroupChats}
            headerCheckboxState={headerCheckboxState}
            onOpenSettings={openSettingsDialog}
            onToggleAll={toggleAllGroupChats}
            onToggleGroupChat={toggleGroupChatSelection}
            selectedGroupChatIds={selectedGroupChatIds}
          />
        </div>
      </section>

      <GroupChatHostingSettingsDialog
        agents={mockGroupChatHostingAgents}
        autoReplyAccounts={mockAutoReplyAccounts}
        fullAutoAuthAvailable
        groupChats={groupChats}
        onGoToAddAgent={handleGoToAddAgent}
        onOpenChange={setSettingsDialogOpen}
        onSave={handleSaveSettings}
        open={settingsDialogOpen}
        targetGroupChatIds={settingsTargetGroupChatIds}
      />
    </>
  );
}

function GroupChatHostingSettingsDialog({
  agents,
  autoReplyAccounts,
  fullAutoAuthAvailable,
  groupChats,
  onGoToAddAgent,
  onOpenChange,
  onSave,
  open,
  targetGroupChatIds,
}: {
  agents: GroupChatHostingAgent[];
  autoReplyAccounts: GroupChatHostingAutoReplyAccount[];
  fullAutoAuthAvailable: boolean;
  groupChats: GroupChatHostingItem[];
  onGoToAddAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (groupChatIds: string[], draft: GroupChatHostingSettingsDraft) => void;
  open: boolean;
  targetGroupChatIds: string[];
}) {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [autoReplyAccountId, setAutoReplyAccountId] = useState<string | undefined>(undefined);
  const [fullAutoAuth, setFullAutoAuth] = useState(false);
  const [replyRule, setReplyRule] = useState<GroupChatHostingReplyRule>("quote");
  const [semiAutoAuth, setSemiAutoAuth] = useState(false);

  const targetGroupChats = useMemo(
    () => groupChats.filter((groupChat) => targetGroupChatIds.includes(groupChat.id)),
    [groupChats, targetGroupChatIds],
  );
  const isBatchMode = targetGroupChats.length > 1;
  const singleGroupChat = targetGroupChats.length === 1 ? targetGroupChats[0] : null;
  const fullAutoAuthDisabled = !fullAutoAuthAvailable && !fullAutoAuth;

  useEffect(() => {
    if (!open || targetGroupChats.length === 0) {
      return;
    }

    if (targetGroupChats.length === 1) {
      const groupChat = targetGroupChats[0];
      const matchedAgentId =
        groupChat.agentId &&
        agents.some((agent) => agent.id === groupChat.agentId && agent.isPublished)
          ? groupChat.agentId
          : undefined;

      setAgentId(matchedAgentId);
      setAutoReplyAccountId(groupChat.autoReplyAccount?.id);
      setFullAutoAuth(groupChat.fullAutoAuth);
      setReplyRule(groupChat.replyRule);
      setSemiAutoAuth(groupChat.semiAutoAuth);
      return;
    }

    setAgentId(undefined);
    setAutoReplyAccountId(undefined);
    setFullAutoAuth(false);
    setReplyRule("quote");
    setSemiAutoAuth(false);
  }, [agents, open, targetGroupChats]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (targetGroupChatIds.length === 0) {
      return;
    }

    onSave(targetGroupChatIds, {
      agentId,
      autoReplyAccountId,
      fullAutoAuth,
      replyRule,
      semiAutoAuth,
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-[34rem]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{isBatchMode ? "群聊托管批量设置" : "群聊托管设置"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          {singleGroupChat ? (
            <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border px-3 py-3">
              <GroupChatAvatar avatarUrl={singleGroupChat.avatarUrl} name={singleGroupChat.name} />
              <p className="truncate text-sm font-medium text-foreground">{singleGroupChat.name}</p>
            </div>
          ) : isBatchMode ? (
            <SelectedGroupChatsPreview groupChats={targetGroupChats} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="group-hosting-settings-agent">关联Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={agents}
              id="group-hosting-settings-agent"
              onAgentIdChange={setAgentId}
              onGoToAddAgent={onGoToAddAgent}
              placeholder="请选择使用哪个Agent进行回复"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">托管设置</h3>
            <div className="overflow-hidden rounded-[8px] border border-border">
              <PermissionSettingRow
                checked={fullAutoAuth}
                description="开启后群聊自动进入托管模式，Agent将自动回复群内被@的消息。"
                disabled={fullAutoAuthDisabled}
                id="group-hosting-settings-auto-hosting"
                onCheckedChange={setFullAutoAuth}
                title="允许开启AI回复"
                tooltip={fullAutoAuthDisabled ? fullAutoAuthUnavailableMessage : undefined}
              />
              <div className="space-y-2 border-b border-border px-4 py-3.5">
                <Label htmlFor="group-hosting-settings-auto-reply-account">自动回复账号</Label>
                <Select onValueChange={setAutoReplyAccountId} value={autoReplyAccountId}>
                  <SelectTrigger className="w-full" id="group-hosting-settings-auto-reply-account">
                    <SelectValue placeholder="请选择使用账号进行回复" />
                  </SelectTrigger>
                  <SelectContent>
                    {autoReplyAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 border-b border-border px-4 py-3.5">
                <p className="text-sm font-medium text-foreground">回复规则</p>
                <RadioGroup
                  aria-label="回复规则"
                  className="flex flex-wrap gap-x-6 gap-y-2"
                  onValueChange={(value) => setReplyRule(value as GroupChatHostingReplyRule)}
                  value={replyRule}
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <RadioGroupItem aria-label="回复时引用消息" value="quote" />
                    <span>回复时引用消息</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <RadioGroupItem aria-label="回复时@客户" value="at_customer" />
                    <span>回复时@客户</span>
                  </label>
                </RadioGroup>
              </div>
              <PermissionSettingRow
                checked={semiAutoAuth}
                description="Agent会自动生成回复建议，提升客服服务效率"
                id="group-hosting-settings-script-recommendation"
                onCheckedChange={setSemiAutoAuth}
                title="允许话术推荐"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button type="submit">确认提交</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GroupChatAvatar({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  return (
    <Avatar
      aria-label={`群聊 ${name}`}
      className="size-8 rounded-[8px] border border-border"
      title={name}
    >
      {avatarUrl ? <AvatarImage alt={name} className="rounded-[8px]" src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-[8px] bg-muted text-xs text-muted-foreground">
        {getInitial(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function SelectedGroupChatsPreview({ groupChats }: { groupChats: GroupChatHostingItem[] }) {
  const previewGroupChats = groupChats.slice(0, SELECTED_GROUP_PREVIEW_LIMIT);
  const remainingCount = groupChats.length - previewGroupChats.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{groupChats.map((groupChat) => groupChat.name).join("、")}</span>
      <div className="flex items-center">
        {previewGroupChats.map((groupChat, index) => (
          <Avatar
            className={cn(
              "size-10 rounded-[8px] border-2 border-background",
              index > 0 && "-ml-2",
            )}
            key={groupChat.id}
            title={groupChat.name}
          >
            {groupChat.avatarUrl ? (
              <AvatarImage alt={`${groupChat.name}头像`} src={groupChat.avatarUrl} />
            ) : null}
            <AvatarFallback className="rounded-[8px] bg-muted text-xs text-muted-foreground">
              {getInitial(groupChat.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {remainingCount > 0 ? (
          <span
            aria-hidden="true"
            className="-ml-2 inline-flex size-10 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
          </span>
        ) : null}
      </div>
      {remainingCount > 0 ? (
        <span className="text-sm text-muted-foreground">等{remainingCount}个群聊</span>
      ) : null}
    </div>
  );
}

function GroupChatHostingSettingsTable({
  agents,
  groupChats,
  headerCheckboxState,
  onOpenSettings,
  onToggleAll,
  onToggleGroupChat,
  selectedGroupChatIds,
}: {
  agents: GroupChatHostingAgent[];
  groupChats: GroupChatHostingItem[];
  headerCheckboxState: boolean | "indeterminate";
  onOpenSettings: (groupChatIds: string[]) => void;
  onToggleAll: (checked: boolean) => void;
  onToggleGroupChat: (groupChatId: string) => void;
  selectedGroupChatIds: string[];
}) {
  const selectedGroupChatIdSet = new Set(selectedGroupChatIds);
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const tableColumnCount = 7;

  return (
    <Table aria-label="群聊托管设置列表" className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-10">
            <Checkbox
              aria-label="全选群聊"
              checked={headerCheckboxState}
              disabled={groupChats.length === 0}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
            />
          </TableHead>
          <TableHead className="h-11 w-[22%]">群聊</TableHead>
          <TableHead className="h-11 w-[14%]">关联 Agent</TableHead>
          <TableHead className="h-11 w-[14%]">允许开启 AI 回复</TableHead>
          <TableHead className="h-11 w-[14%]">允许话术推荐</TableHead>
          <TableHead className="h-11 w-[18%]">自动回复账号</TableHead>
          <TableHead className="h-11 w-[120px] text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groupChats.length === 0 ? (
          <TableRow>
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={tableColumnCount}>
              暂无数据
            </TableCell>
          </TableRow>
        ) : (
          groupChats.map((groupChat) => (
            <TableRow key={groupChat.id}>
              <TableCell className="w-10 py-4">
                <Checkbox
                  aria-label={`选择${groupChat.name}`}
                  checked={selectedGroupChatIdSet.has(groupChat.id)}
                  onCheckedChange={() => onToggleGroupChat(groupChat.id)}
                />
              </TableCell>
              <TableCell className="py-4">
                <GroupChatIdentity avatarUrl={groupChat.avatarUrl} name={groupChat.name} />
              </TableCell>
              <TableCell className="py-4 text-muted-foreground">
                {groupChat.agentId ? agentNameById.get(groupChat.agentId) ?? "-" : "-"}
              </TableCell>
              <TableCell className="py-4">
                <FeatureStatus enabled={groupChat.fullAutoAuth} />
              </TableCell>
              <TableCell className="py-4">
                <FeatureStatus enabled={groupChat.semiAutoAuth} />
              </TableCell>
              <TableCell className="py-4">
                {groupChat.autoReplyAccount ? (
                  <AutoReplyAccountIdentity account={groupChat.autoReplyAccount} />
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="py-4 text-right">
                <Button
                  className="h-auto p-0 text-primary"
                  onClick={() => onOpenSettings([groupChat.id])}
                  type="button"
                  variant="link"
                >
                  设置
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function GroupChatIdentity({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-8 rounded-[8px]">
        {avatarUrl ? <AvatarImage alt={`${name}头像`} src={avatarUrl} /> : null}
        <AvatarFallback className="rounded-[8px] bg-muted text-xs text-muted-foreground">
          {getInitial(name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-medium text-foreground">{name}</span>
    </div>
  );
}

function AutoReplyAccountIdentity({ account }: { account: GroupChatHostingAutoReplyAccount }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7 rounded-full">
        {account.avatarUrl ? <AvatarImage alt={`${account.name}头像`} src={account.avatarUrl} /> : null}
        <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
          {getInitial(account.name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-sm text-foreground">{account.name}</span>
    </div>
  );
}
