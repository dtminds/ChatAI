import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AiHostingAgentListItem } from "@chatai/contracts";
import { MoreHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { listAiHostingAgents } from "./agent-service";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

type HostingAccount = {
  associatedAgentId: string | null;
  autoHostingEnabled: boolean;
  id: string;
  name: string;
  scriptRecommendationEnabled: boolean;
};

type HostingSettingsDraft = {
  agentId: string | null;
  autoHostingEnabled: boolean;
  scriptRecommendationEnabled: boolean;
};

const HOSTING_SETTINGS_PAGE_SIZE = 10;
const SELECTED_ACCOUNT_PREVIEW_LIMIT = 5;

const initialHostingAccounts: HostingAccount[] = [
  {
    id: "wecom-account-1",
    name: "小助理1",
    associatedAgentId: null,
    autoHostingEnabled: false,
    scriptRecommendationEnabled: false,
  },
  {
    id: "wecom-account-2",
    name: "小助理2",
    associatedAgentId: null,
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
  {
    id: "wecom-account-3",
    name: "小助理3",
    associatedAgentId: null,
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
];

export function AgentHostingSettingsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AiHostingAgentListItem[]>([]);
  const [accounts, setAccounts] = useState(initialHostingAccounts);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTargetAccountIds, setSettingsTargetAccountIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      try {
        const response = await listAiHostingAgents({ page: 1, pageSize: 100 });

        if (!ignore) {
          setAgents(response.agents);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(isRequestError(error) ? error.message : "Agent 列表加载失败");
        }
      }
    }

    void loadAgents();

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

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: HOSTING_SETTINGS_PAGE_SIZE,
    total: filteredAccounts.length,
  });
  const pagedAccounts = useMemo(() => {
    const start = (activePage - 1) * HOSTING_SETTINGS_PAGE_SIZE;
    return filteredAccounts.slice(start, start + HOSTING_SETTINGS_PAGE_SIZE);
  }, [activePage, filteredAccounts]);
  const pagedAccountIdSet = useMemo(
    () => new Set(pagedAccounts.map((account) => account.id)),
    [pagedAccounts],
  );
  const visibleSelectedAccountIds = useMemo(
    () => selectedAccountIds.filter((id) => pagedAccountIdSet.has(id)),
    [pagedAccountIdSet, selectedAccountIds],
  );
  const selectedVisibleCount = visibleSelectedAccountIds.length;
  const allVisibleSelected =
    pagedAccounts.length > 0 && selectedVisibleCount === pagedAccounts.length;
  const headerCheckboxState: boolean | "indeterminate" =
    selectedVisibleCount === 0
      ? false
      : allVisibleSelected
        ? true
        : "indeterminate";

  function toggleAllAccounts(checked: boolean) {
    if (checked) {
      setSelectedAccountIds((current) => [
        ...new Set([...current, ...pagedAccounts.map((account) => account.id)]),
      ]);
      return;
    }

    setSelectedAccountIds((current) =>
      current.filter((id) => !pagedAccountIdSet.has(id)),
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

  function handleSaveSettings(accountIds: string[], draft: HostingSettingsDraft) {
    setAccounts((current) =>
      current.map((account) => {
        if (!accountIds.includes(account.id)) {
          return account;
        }

        return {
          ...account,
          associatedAgentId: draft.agentId,
          autoHostingEnabled: draft.autoHostingEnabled,
          scriptRecommendationEnabled: draft.scriptRecommendationEnabled,
        };
      }),
    );
    setSettingsDialogOpen(false);
  }

  function handleGoToAddAgent() {
    setSettingsDialogOpen(false);
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <AiHostingLayout title="托管设置">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="配置企微账号关联的 Agent 和托管能力"
          title="托管设置"
        />

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
                aria-label="搜索企微账号"
                className="h-10 rounded-[8px] pl-9"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜索企微账号"
                value={searchQuery}
              />
            </div>

            <Button
              className="h-10 px-4"
              disabled={visibleSelectedAccountIds.length === 0}
              onClick={() => openSettingsDialog(visibleSelectedAccountIds)}
              type="button"
              variant="outline"
            >
              <span>批量设置</span>
              {visibleSelectedAccountIds.length > 0 ? (
                <Badge className="-mr-1 px-2 py-0.5" variant="secondary">
                  {visibleSelectedAccountIds.length}
                </Badge>
              ) : null}
            </Button>
          </div>

          <div className="mt-4">
            <HostingSettingsTable
              accounts={pagedAccounts}
              agents={agents}
              headerCheckboxState={headerCheckboxState}
              onOpenSettings={openSettingsDialog}
              onToggleAccount={toggleAccountSelection}
              onToggleAll={toggleAllAccounts}
              selectedAccountIds={selectedAccountIds}
            />
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={filteredAccounts.length}
              totalPages={totalPages}
            />
          </div>
        </section>

        <HostingSettingsDialog
          accounts={accounts}
          agents={agents}
          onGoToAddAgent={handleGoToAddAgent}
          onOpenChange={setSettingsDialogOpen}
          onSave={handleSaveSettings}
          open={settingsDialogOpen}
          targetAccountIds={settingsTargetAccountIds}
        />
      </div>
    </AiHostingLayout>
  );
}

function HostingSettingsDialog({
  accounts,
  agents,
  onGoToAddAgent,
  onOpenChange,
  onSave,
  open,
  targetAccountIds,
}: {
  accounts: HostingAccount[];
  agents: AiHostingAgentListItem[];
  onGoToAddAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (accountIds: string[], draft: HostingSettingsDraft) => void;
  open: boolean;
  targetAccountIds: string[];
}) {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [autoHostingEnabled, setAutoHostingEnabled] = useState(false);
  const [scriptRecommendationEnabled, setScriptRecommendationEnabled] = useState(false);

  const targetAccounts = useMemo(
    () => accounts.filter((account) => targetAccountIds.includes(account.id)),
    [accounts, targetAccountIds],
  );

  useEffect(() => {
    if (!open || targetAccounts.length === 0) {
      return;
    }

    if (targetAccounts.length === 1) {
      const account = targetAccounts[0];
      const matchedAgentId =
        account.associatedAgentId && agents.some((agent) => agent.id === account.associatedAgentId)
          ? account.associatedAgentId
          : undefined;

      setAgentId(matchedAgentId);
      setAutoHostingEnabled(account.autoHostingEnabled);
      setScriptRecommendationEnabled(account.scriptRecommendationEnabled);
      return;
    }

    setAgentId(undefined);
    setAutoHostingEnabled(false);
    setScriptRecommendationEnabled(false);
  }, [agents, open, targetAccounts]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (targetAccountIds.length === 0) {
      return;
    }

    onSave(targetAccountIds, {
      agentId: agentId ?? null,
      autoHostingEnabled,
      scriptRecommendationEnabled,
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-[480px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>批量设置</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>已选企微账号</Label>
            <SelectedAccountsPreview accounts={targetAccounts} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hosting-settings-agent">关联 Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={agents}
              onAgentIdChange={setAgentId}
              onGoToAddAgent={onGoToAddAgent}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="hosting-settings-auto-hosting">全自动托管权限</Label>
            <Switch
              checked={autoHostingEnabled}
              id="hosting-settings-auto-hosting"
              onCheckedChange={setAutoHostingEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="hosting-settings-script-recommendation">话术推荐</Label>
            <Switch
              checked={scriptRecommendationEnabled}
              id="hosting-settings-script-recommendation"
              onCheckedChange={setScriptRecommendationEnabled}
            />
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

function AgentAssociationField({
  agentId,
  agents,
  onAgentIdChange,
  onGoToAddAgent,
}: {
  agentId: string | undefined;
  agents: AiHostingAgentListItem[];
  onAgentIdChange: (agentId: string) => void;
  onGoToAddAgent: () => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-10 items-center justify-center rounded-[8px] border border-border bg-background px-3 text-sm text-muted-foreground">
        暂无 Agent，
        <Button
          className="h-auto p-0 text-primary"
          onClick={onGoToAddAgent}
          type="button"
          variant="link"
        >
          请去添加
        </Button>
      </div>
    );
  }

  return (
    <Select onValueChange={onAgentIdChange} value={agentId}>
      <SelectTrigger className="w-full" id="hosting-settings-agent">
        <SelectValue placeholder="请选择 Agent" />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
              "size-8 rounded-full border-2 border-background",
              index > 0 && "-ml-2",
            )}
            key={account.id}
            title={account.name}
          >
            <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
              {account.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        ))}
        {remainingCount > 0 ? (
          <span
            aria-hidden="true"
            className="-ml-2 inline-flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground"
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
  onOpenSettings,
  onToggleAccount,
  onToggleAll,
  selectedAccountIds,
}: {
  accounts: HostingAccount[];
  agents: AiHostingAgentListItem[];
  headerCheckboxState: boolean | "indeterminate";
  onOpenSettings: (accountIds: string[]) => void;
  onToggleAccount: (accountId: string) => void;
  onToggleAll: (checked: boolean) => void;
  selectedAccountIds: string[];
}) {
  const selectedAccountIdSet = new Set(selectedAccountIds);
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <>
      <Table aria-label="托管设置列表" className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-10">
              <Checkbox
                aria-label="全选企微账号"
                checked={headerCheckboxState}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
              />
            </TableHead>
            <TableHead className="h-11 w-[24%]">企微账号</TableHead>
            <TableHead className="h-11 w-[16%]">关联 Agent</TableHead>
            <TableHead className="h-11 w-[18%]">全自动托管权限</TableHead>
            <TableHead className="h-11 w-[16%]">话术推荐</TableHead>
            <TableHead className="h-11 w-[100px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={6}>
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="w-10 py-4">
                  <Checkbox
                    aria-label={`选择${account.name}`}
                    checked={selectedAccountIdSet.has(account.id)}
                    onCheckedChange={() => onToggleAccount(account.id)}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <WeComAccountIdentity name={account.name} />
                </TableCell>
                <TableCell className="py-4 text-muted-foreground">
                  {account.associatedAgentId
                    ? agentNameById.get(account.associatedAgentId) ?? "-"
                    : "-"}
                </TableCell>
                <TableCell className="py-4">
                  <FeatureStatus enabled={account.autoHostingEnabled} />
                </TableCell>
                <TableCell className="py-4">
                  <FeatureStatus enabled={account.scriptRecommendationEnabled} />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <Button
                    className="h-auto p-0 text-primary"
                    onClick={() => onOpenSettings([account.id])}
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
    </>
  );
}

function WeComAccountIdentity({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-8 rounded-[8px]">
        <AvatarFallback className="rounded-[8px] bg-muted text-muted-foreground" />
      </Avatar>
      <span className="font-medium text-foreground">{name}</span>
    </div>
  );
}

function FeatureStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className={cn("text-sm", enabled ? "text-emerald-600" : "text-foreground")}>
      {enabled ? "启用" : "关闭"}
    </span>
  );
}
