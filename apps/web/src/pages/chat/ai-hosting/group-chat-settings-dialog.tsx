import { useEffect, useState, type FormEvent } from "react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
  AgentAssociationField,
  PermissionSettingRow,
  getInitial,
} from "./hosting-settings-shared";

export type GroupChatSettingsTargetAccount = {
  avatarUrl: string;
  id: string;
  name: string;
};

type GroupChatReplyScope = "all_customers" | "quoted_only";

type GroupChatHostingAgent = {
  id: string;
  isPublished: boolean;
  name: string;
};

const SELECTED_ACCOUNT_PREVIEW_LIMIT = 5;

const mockGroupChatHostingAgents: GroupChatHostingAgent[] = [
  {
    id: "301",
    isPublished: true,
    name: "群内护肤小助理",
  },
];

export function GroupChatSettingsDialog({
  onOpenChange,
  open,
  targetAccounts,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  targetAccounts: GroupChatSettingsTargetAccount[];
}) {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [fullAutoAuth, setFullAutoAuth] = useState(false);
  const [replyScope, setReplyScope] = useState<GroupChatReplyScope>("quoted_only");
  const [semiAutoAuth, setSemiAutoAuth] = useState(false);

  const isBatchMode = targetAccounts.length > 1;
  const singleAccount = targetAccounts.length === 1 ? targetAccounts[0] : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setAgentId(undefined);
    setFullAutoAuth(false);
    setReplyScope("quoted_only");
    setSemiAutoAuth(false);
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onOpenChange(false);
  }

  function handleGoToAddAgent() {
    onOpenChange(false);
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-[34rem]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{isBatchMode ? "群聊批量设置" : "群聊设置"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          {singleAccount ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-8 rounded-full">
                {singleAccount.avatarUrl ? (
                  <AvatarImage alt={`${singleAccount.name}头像`} src={singleAccount.avatarUrl} />
                ) : null}
                <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
                  {getInitial(singleAccount.name)}
                </AvatarFallback>
              </Avatar>
              <p className="truncate text-sm font-medium text-foreground">{singleAccount.name}</p>
            </div>
          ) : isBatchMode ? (
            <SelectedAccountsPreview accounts={targetAccounts} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="group-chat-settings-agent">关联Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={mockGroupChatHostingAgents}
              id="group-chat-settings-agent"
              onAgentIdChange={setAgentId}
              onGoToAddAgent={handleGoToAddAgent}
              placeholder="请选择使用哪个Agent在群内进行回复"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">托管设置</h3>
            <div className="overflow-hidden rounded-[8px] border border-border">
              <PermissionSettingRow
                checked={fullAutoAuth}
                description="开启后群聊自动进入托管模式，Agent将自动回复群内被@的消息"
                id="group-chat-settings-auto-hosting"
                onCheckedChange={setFullAutoAuth}
                title="允许开启 AI回复"
              />
              {fullAutoAuth ? (
                <div className="space-y-2 border-b border-border bg-muted/35 px-4 py-3.5">
                  <p className="text-sm font-medium text-foreground">回复规则</p>
                  <ReplyScopeSelector onValueChange={setReplyScope} value={replyScope} />
                </div>
              ) : null}
              <PermissionSettingRow
                checked={semiAutoAuth}
                description="Agent 会自动生成回复建议，提升客服服务效率"
                id="group-chat-settings-script-recommendation"
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
            <Button type="submit">保存设置</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReplyScopeSelector({
  onValueChange,
  value,
}: {
  onValueChange: (value: GroupChatReplyScope) => void;
  value: GroupChatReplyScope;
}) {
  return (
    <SegmentedControl
      aria-label="回复规则"
      className="h-auto w-full flex-wrap gap-2 rounded-none border-0 bg-transparent p-0"
      onValueChange={(nextValue) => {
        if (nextValue) {
          onValueChange(nextValue as GroupChatReplyScope);
        }
      }}
      type="single"
      value={value}
    >
      <SegmentedControlItem
        className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-4 text-sm font-medium text-foreground data-[state=on]:border-primary/70 data-[state=on]:bg-primary/[0.06] data-[state=on]:text-primary data-[state=on]:shadow-none"
        value="quoted_only"
      >
        回复时引用消息
      </SegmentedControlItem>
      <SegmentedControlItem
        className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-4 text-sm font-medium text-foreground data-[state=on]:border-primary/70 data-[state=on]:bg-primary/[0.06] data-[state=on]:text-primary data-[state=on]:shadow-none"
        value="all_customers"
      >
        回复时@客户
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

function SelectedAccountsPreview({ accounts }: { accounts: GroupChatSettingsTargetAccount[] }) {
  const previewAccounts = accounts.slice(0, SELECTED_ACCOUNT_PREVIEW_LIMIT);
  const remainingCount = accounts.length - previewAccounts.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{accounts.map((account) => account.name).join("、")}</span>
      <div className="flex items-center">
        {previewAccounts.map((account, index) => (
          <Avatar
            className={cn(
              "size-10 rounded-full border-2 border-background",
              index > 0 && "-ml-2",
            )}
            key={account.id}
            title={account.name}
          >
            {account.avatarUrl ? (
              <AvatarImage alt={`${account.name}头像`} src={account.avatarUrl} />
            ) : null}
            <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
              {getInitial(account.name)}
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
        <span className="text-sm text-muted-foreground">等{remainingCount}个账号</span>
      ) : null}
    </div>
  );
}
