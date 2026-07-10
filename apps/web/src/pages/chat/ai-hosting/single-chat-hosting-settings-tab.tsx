import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AiHostingSettingsAccount,
  AiHostingSettingsAgentOption,
} from "@chatai/contracts";
import { MoreHorizontalIcon, Search01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { listAiHostingSettings, updateAiHostingGroupSettings, updateAiHostingSettings } from "./agent-service";
import {
  GroupChatSettingsDialog,
  type GroupChatSettingsDraft,
} from "./group-chat-settings-dialog";
import {
  AgentAssociationField,
  HostingAgentCapabilityCell,
  PermissionSettingRow,
  getErrorMessage,
} from "./hosting-settings-shared";

type HostingAccount = AiHostingSettingsAccount;
type HostingAgent = AiHostingSettingsAgentOption;

type HostingSettingsDraft = {
  agentId: string;
  fullAutoAuth: boolean;
  semiAutoAuth: boolean;
};

const SELECTED_ACCOUNT_PREVIEW_LIMIT = 5;
const fullAutoAuthUnavailableMessage = "该功能内测中，如需开通请联系客服";

export function SingleChatHostingSettingsTab() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<HostingAgent[]>([]);
  const [accounts, setAccounts] = useState<HostingAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTargetAccountIds, setSettingsTargetAccountIds] = useState<string[]>([]);
  const [groupChatSettingsDialogOpen, setGroupChatSettingsDialogOpen] = useState(false);
  const [groupChatSettingsTargetAccountIds, setGroupChatSettingsTargetAccountIds] = useState<
    string[]
  >([]);
  const [fullAutoAuthAvailable, setFullAutoAuthAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadHostingSettings() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await listAiHostingSettings();

        if (!ignore) {
          setAccounts(response.accounts);
          setAgents(response.agents);
          setFullAutoAuthAvailable(response.fullAutoAuthAvailable);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(isRequestError(error) ? error.message : "托管设置加载失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadHostingSettings();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return accounts;
    }

    return accounts.filter((account) => account.name.toLowerCase().includes(normalizedQuery));
  }, [accounts, searchQuery]);

  const visibleAccountIdSet = useMemo(
    () => new Set(filteredAccounts.map((account) => account.id)),
    [filteredAccounts],
  );
  const visibleSelectedAccountIds = useMemo(
    () => selectedAccountIds.filter((id) => visibleAccountIdSet.has(id)),
    [selectedAccountIds, visibleAccountIdSet],
  );
  const selectedVisibleCount = visibleSelectedAccountIds.length;
  const allVisibleSelected =
    filteredAccounts.length > 0 && selectedVisibleCount === filteredAccounts.length;
  const headerCheckboxState: boolean | "indeterminate" =
    selectedVisibleCount === 0
      ? false
      : allVisibleSelected
        ? true
        : "indeterminate";

  function toggleAllAccounts(checked: boolean) {
    if (checked) {
      setSelectedAccountIds((current) => [
        ...new Set([...current, ...filteredAccounts.map((account) => account.id)]),
      ]);
      return;
    }

    setSelectedAccountIds((current) =>
      current.filter((id) => !visibleAccountIdSet.has(id)),
    );
  }

  function toggleAccountSelection(accountId: string) {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  }

  function openSettingsDialog(accountIds: string[]) {
    setSettingsTargetAccountIds(accountIds);
    setSettingsDialogOpen(true);
  }

  function openGroupChatSettingsDialog(accountIds: string[]) {
    setGroupChatSettingsTargetAccountIds(accountIds);
    setGroupChatSettingsDialogOpen(true);
  }

  async function handleSaveGroupChatSettings(
    accountIds: string[],
    draft: GroupChatSettingsDraft,
  ) {
    try {
      const response = await updateAiHostingGroupSettings({
        agentId: draft.agentId,
        fullAutoAuth: draft.fullAutoAuth,
        replyMode: draft.replyMode,
        semiAutoAuth: draft.semiAutoAuth,
        userSeatIds: accountIds,
      });

      setAccounts(response.accounts);
      setAgents(response.agents);
      setFullAutoAuthAvailable(response.fullAutoAuthAvailable);
      setSelectedAccountIds((current) => current.filter((id) => !accountIds.includes(id)));
      setGroupChatSettingsDialogOpen(false);
      setErrorMessage("");
    } catch (error) {
      throw new Error(isRequestError(error) ? error.message : "群聊设置保存失败");
    }
  }

  function handleGoToAddAgentForGroup() {
    setGroupChatSettingsDialogOpen(false);
  }

  async function handleSaveSettings(accountIds: string[], draft: HostingSettingsDraft) {
    try {
      const response = await updateAiHostingSettings({
        agentId: draft.agentId,
        fullAutoAuth: draft.fullAutoAuth,
        semiAutoAuth: draft.semiAutoAuth,
        userSeatIds: accountIds,
      });

      setAccounts(response.accounts);
      setAgents(response.agents);
      setFullAutoAuthAvailable(response.fullAutoAuthAvailable);
      setSelectedAccountIds((current) => current.filter((id) => !accountIds.includes(id)));
      setSettingsDialogOpen(false);
      setErrorMessage("");
    } catch (error) {
      throw new Error(isRequestError(error) ? error.message : "托管设置保存失败");
    }
  }

  function handleGoToAddAgent() {
    setSettingsDialogOpen(false);
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <>
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <section aria-label="托管设置列表">
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
              aria-label="搜索托管账号"
              className="h-10 rounded-[8px] pl-9"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索托管账号"
              value={searchQuery}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-10 gap-1 px-4"
                disabled={visibleSelectedAccountIds.length === 0}
                type="button"
                variant="outline"
              >
                <span>批量设置</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.8} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[120px]">
              <DropdownMenuItem
                onSelect={() => openSettingsDialog(visibleSelectedAccountIds)}
              >
                单聊设置
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openGroupChatSettingsDialog(visibleSelectedAccountIds)}
              >
                群聊设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4">
          <HostingSettingsTable
            accounts={filteredAccounts}
            agents={agents}
            headerCheckboxState={headerCheckboxState}
            loading={loading}
            onOpenGroupChatSettings={openGroupChatSettingsDialog}
            onOpenSingleChatSettings={openSettingsDialog}
            onToggleAccount={toggleAccountSelection}
            onToggleAll={toggleAllAccounts}
            selectedAccountIds={selectedAccountIds}
          />
        </div>
      </section>

      <SingleChatHostingSettingsDialog
        accounts={accounts}
        agents={agents}
        fullAutoAuthAvailable={fullAutoAuthAvailable}
        onGoToAddAgent={handleGoToAddAgent}
        onOpenChange={setSettingsDialogOpen}
        onSave={handleSaveSettings}
        open={settingsDialogOpen}
        targetAccountIds={settingsTargetAccountIds}
      />

      <GroupChatSettingsDialog
        accounts={accounts}
        agents={agents}
        fullAutoAuthAvailable={fullAutoAuthAvailable}
        onGoToAddAgent={handleGoToAddAgentForGroup}
        onOpenChange={setGroupChatSettingsDialogOpen}
        onSave={handleSaveGroupChatSettings}
        open={groupChatSettingsDialogOpen}
        targetAccountIds={groupChatSettingsTargetAccountIds}
      />
    </>
  );
}

function SingleChatHostingSettingsDialog({
  accounts,
  agents,
  fullAutoAuthAvailable,
  onGoToAddAgent,
  onOpenChange,
  onSave,
  open,
  targetAccountIds,
}: {
  accounts: HostingAccount[];
  agents: HostingAgent[];
  fullAutoAuthAvailable: boolean;
  onGoToAddAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (accountIds: string[], draft: HostingSettingsDraft) => void | Promise<void>;
  open: boolean;
  targetAccountIds: string[];
}) {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [fullAutoAuth, setFullAutoAuth] = useState(false);
  const [semiAutoAuth, setSemiAutoAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const targetAccounts = useMemo(
    () => accounts.filter((account) => targetAccountIds.includes(account.id)),
    [accounts, targetAccountIds],
  );
  const dialogTitle = targetAccounts.length === 1 ? "单聊设置" : "单聊批量设置";
  const fullAutoAuthDisabled = !fullAutoAuthAvailable && !fullAutoAuth;

  useEffect(() => {
    if (!open || targetAccounts.length === 0) {
      return;
    }

    if (targetAccounts.length === 1) {
      const account = targetAccounts[0];
      const matchedAgentId =
        account.agentId &&
        agents.some((agent) => agent.id === account.agentId && agent.isPublished)
          ? account.agentId
          : undefined;

      setAgentId(matchedAgentId);
      setFullAutoAuth(account.fullAutoAuth);
      setSemiAutoAuth(account.semiAutoAuth);
      setSaving(false);
      setValidationMessage("");
      return;
    }

    setAgentId(undefined);
    setFullAutoAuth(false);
    setSemiAutoAuth(false);
    setSaving(false);
    setValidationMessage("");
  }, [agents, open, targetAccounts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (targetAccountIds.length === 0 || saving) {
      return;
    }

    const selectedAgent = agents.find((agent) => agent.id === agentId);

    if (!selectedAgent?.isPublished) {
      setValidationMessage("请选择已发布 Agent");
      return;
    }

    setSaving(true);
    setValidationMessage("");

    try {
      await onSave(targetAccountIds, {
        agentId: selectedAgent.id,
        fullAutoAuth,
        semiAutoAuth,
      });
    } catch (error) {
      setValidationMessage(getErrorMessage(error, "托管设置保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          <div>
            <SelectedAccountsPreview accounts={targetAccounts} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hosting-settings-agent">关联 Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={agents}
              onAgentIdChange={(value) => {
                setAgentId(value);
                setValidationMessage("");
              }}
              onGoToAddAgent={onGoToAddAgent}
            />
            {validationMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {validationMessage}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">托管设置</h3>
            <div className="overflow-hidden rounded-[8px] border border-border">
              <PermissionSettingRow
                checked={fullAutoAuth}
                description="客服可开启 AI 回复， Agent 将自动回复客户的消息"
                disabled={fullAutoAuthDisabled}
                id="hosting-settings-auto-hosting"
                onCheckedChange={setFullAutoAuth}
                title="允许开启 AI 回复"
                tooltip={fullAutoAuthDisabled ? fullAutoAuthUnavailableMessage : undefined}
              />
              <PermissionSettingRow
                checked={semiAutoAuth}
                description="Agent 会自动生成回复建议，提升客服服务效率"
                id="hosting-settings-script-recommendation"
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
            <Button disabled={saving} type="submit">
              {saving ? (
                <>
                  <Spinner aria-hidden="true" size={14} />
                  <span>保存中</span>
                </>
              ) : (
                "保存设置"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectedAccountsPreview({ accounts }: { accounts: HostingAccount[] }) {
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
              {account.name.slice(0, 1)}
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

function HostingSettingsTable({
  accounts,
  agents,
  headerCheckboxState,
  loading,
  onOpenGroupChatSettings,
  onOpenSingleChatSettings,
  onToggleAccount,
  onToggleAll,
  selectedAccountIds,
}: {
  accounts: HostingAccount[];
  agents: HostingAgent[];
  headerCheckboxState: boolean | "indeterminate";
  loading: boolean;
  onOpenGroupChatSettings: (accountIds: string[]) => void;
  onOpenSingleChatSettings: (accountIds: string[]) => void;
  onToggleAccount: (accountId: string) => void;
  onToggleAll: (checked: boolean) => void;
  selectedAccountIds: string[];
}) {
  const selectedAccountIdSet = new Set(selectedAccountIds);
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const tableColumnCount = 5;

  return (
    <Table aria-label="托管设置列表" className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 w-10">
            <Checkbox
              aria-label="全选托管账号"
              checked={headerCheckboxState}
              disabled={loading || accounts.length === 0}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
            />
          </TableHead>
          <TableHead className="h-11 w-[18%]">托管账号</TableHead>
          <TableHead className="h-11 w-[24%]">单聊Agent</TableHead>
          <TableHead className="h-11 w-[24%]">群聊Agent</TableHead>
          <TableHead className="h-11 w-[160px] text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell className="py-10 text-center" colSpan={tableColumnCount}>
              <div
                aria-label="正在加载"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <Spinner aria-hidden="true" size={14} />
                <span>正在加载</span>
              </div>
            </TableCell>
          </TableRow>
        ) : accounts.length === 0 ? (
          <TableRow>
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={tableColumnCount}>
              暂无数据
            </TableCell>
          </TableRow>
        ) : (
          accounts.map((account) => {
            const singleChatAgentName = account.agentId
              ? agentNameById.get(account.agentId) ?? null
              : null;
            const groupChatAgentName = account.groupChat.agentId
              ? agentNameById.get(account.groupChat.agentId) ?? null
              : null;

            return (
              <TableRow key={account.id}>
                <TableCell className="w-10 py-4">
                  <Checkbox
                    aria-label={`选择${account.name}`}
                    checked={selectedAccountIdSet.has(account.id)}
                    onCheckedChange={() => onToggleAccount(account.id)}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <WeComAccountIdentity avatarUrl={account.avatarUrl} name={account.name} />
                </TableCell>
                <TableCell className="py-4">
                  <HostingAgentCapabilityCell
                    agentName={singleChatAgentName}
                    fullAutoAuth={account.fullAutoAuth}
                    semiAutoAuth={account.semiAutoAuth}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <HostingAgentCapabilityCell
                    agentName={groupChatAgentName}
                    fullAutoAuth={account.groupChat.fullAutoAuth}
                    semiAutoAuth={account.groupChat.semiAutoAuth}
                  />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="inline-flex items-center gap-3">
                    <Button
                      aria-label={`${account.name}单聊设置`}
                      className="h-auto p-0 text-primary"
                      onClick={() => onOpenSingleChatSettings([account.id])}
                      type="button"
                      variant="link"
                    >
                      单聊设置
                    </Button>
                    <Button
                      aria-label={`${account.name}群聊设置`}
                      className="h-auto p-0 text-primary"
                      onClick={() => onOpenGroupChatSettings([account.id])}
                      type="button"
                      variant="link"
                    >
                      群聊设置
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function WeComAccountIdentity({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-8 rounded-full">
        {avatarUrl ? <AvatarImage alt={`${name}头像`} src={avatarUrl} /> : null}
        <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
          {name.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{name}</span>
    </div>
  );
}
