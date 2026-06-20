import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MoreHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
import {
  mockApplicationScopeAccounts,
  resolveApplicationScopeAgentLabel,
  type AgentRecord,
  type ApplicationScopeAccount,
} from "./agent-management-mock-data";

const selectedAccountPreviewLimit = 5;

type ApplicationScopeSettingsDraft = {
  agentId: string | null;
  autoHostingEnabled: boolean;
  scriptRecommendationEnabled: boolean;
};

export function ApplicationScopePanel({
  agents,
  onGoToAddAgent,
}: {
  agents: AgentRecord[];
  onGoToAddAgent: () => void;
}) {
  const [accounts, setAccounts] = useState(mockApplicationScopeAccounts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTargetAccountIds, setSettingsTargetAccountIds] = useState<string[]>([]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return accounts;
    }

    return accounts.filter((account) => account.name.toLowerCase().includes(normalizedQuery));
  }, [accounts, searchQuery]);

  const filteredAccountIdSet = useMemo(
    () => new Set(filteredAccounts.map((account) => account.id)),
    [filteredAccounts],
  );
  const visibleSelectedAccountIds = useMemo(
    () => selectedAccountIds.filter((id) => filteredAccountIdSet.has(id)),
    [selectedAccountIds, filteredAccountIdSet],
  );
  const selectedFilteredCount = visibleSelectedAccountIds.length;
  const allFilteredSelected =
    filteredAccounts.length > 0 && selectedFilteredCount === filteredAccounts.length;
  const headerCheckboxState: boolean | "indeterminate" =
    selectedFilteredCount === 0
      ? false
      : allFilteredSelected
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
      current.filter((id) => !filteredAccountIdSet.has(id)),
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

  function handleSaveSettings(accountIds: string[], draft: ApplicationScopeSettingsDraft) {
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
    onGoToAddAgent();
  }

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-[280px]">
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
            onChange={(event) => setSearchQuery(event.target.value)}
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
          批量设置
        </Button>
      </section>

      <ApplicationScopeTable
        accounts={filteredAccounts}
        headerCheckboxState={headerCheckboxState}
        onOpenSettings={openSettingsDialog}
        onToggleAccount={toggleAccountSelection}
        onToggleAll={toggleAllAccounts}
        selectedAccountIds={selectedAccountIds}
      />

      <ApplicationScopeSettingsDialog
        agents={agents}
        onGoToAddAgent={handleGoToAddAgent}
        onOpenChange={setSettingsDialogOpen}
        onSave={handleSaveSettings}
        open={settingsDialogOpen}
        scopeAccounts={accounts}
        targetAccountIds={settingsTargetAccountIds}
      />
    </>
  );
}

function ApplicationScopeSettingsDialog({
  agents,
  onGoToAddAgent,
  onOpenChange,
  onSave,
  open,
  scopeAccounts,
  targetAccountIds,
}: {
  agents: AgentRecord[];
  onGoToAddAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (accountIds: string[], draft: ApplicationScopeSettingsDraft) => void;
  open: boolean;
  scopeAccounts: ApplicationScopeAccount[];
  targetAccountIds: string[];
}) {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [autoHostingEnabled, setAutoHostingEnabled] = useState(false);
  const [scriptRecommendationEnabled, setScriptRecommendationEnabled] = useState(false);

  const targetAccounts = useMemo(
    () => scopeAccounts.filter((account) => targetAccountIds.includes(account.id)),
    [scopeAccounts, targetAccountIds],
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
            <Label htmlFor="application-scope-agent">关联Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={agents}
              onAgentIdChange={setAgentId}
              onGoToAddAgent={onGoToAddAgent}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="application-scope-auto-hosting">全自动托管权限</Label>
            <Switch
              checked={autoHostingEnabled}
              id="application-scope-auto-hosting"
              onCheckedChange={setAutoHostingEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="application-scope-script-recommendation">话术推荐</Label>
            <Switch
              checked={scriptRecommendationEnabled}
              id="application-scope-script-recommendation"
              onCheckedChange={setScriptRecommendationEnabled}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
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
  agents: AgentRecord[];
  onAgentIdChange: (agentId: string) => void;
  onGoToAddAgent: () => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-10 items-center justify-center rounded-[8px] border border-border bg-background px-3 text-sm text-muted-foreground">
        暂无Agent，
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
      <SelectTrigger className="w-full" id="application-scope-agent">
        <SelectValue placeholder="请选择Agent" />
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

function SelectedAccountsPreview({ accounts }: { accounts: ApplicationScopeAccount[] }) {
  const previewAccounts = accounts.slice(0, selectedAccountPreviewLimit);
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

function ApplicationScopeTable({
  accounts,
  headerCheckboxState,
  onOpenSettings,
  onToggleAccount,
  onToggleAll,
  selectedAccountIds,
}: {
  accounts: ApplicationScopeAccount[];
  headerCheckboxState: boolean | "indeterminate";
  onOpenSettings: (accountIds: string[]) => void;
  onToggleAccount: (accountId: string) => void;
  onToggleAll: (checked: boolean) => void;
  selectedAccountIds: string[];
}) {
  const selectedAccountIdSet = new Set(selectedAccountIds);

  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-background">
      <Table aria-label="应用范围列表">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 px-5 py-4">
              <Checkbox
                aria-label="全选企微账号"
                checked={headerCheckboxState}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
              />
            </TableHead>
            <TableHead className="w-[24%] px-5 py-4">企微账号</TableHead>
            <TableHead className="w-[16%] px-5 py-4">关联Agent</TableHead>
            <TableHead className="w-[18%] px-5 py-4">全自动托管权限</TableHead>
            <TableHead className="w-[16%] px-5 py-4">话术推荐</TableHead>
            <TableHead className="w-[100px] px-5 py-4">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={6}>
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="px-5 py-4">
                  <Checkbox
                    aria-label={`选择${account.name}`}
                    checked={selectedAccountIdSet.has(account.id)}
                    onCheckedChange={() => onToggleAccount(account.id)}
                  />
                </TableCell>
                <TableCell className="px-5 py-4">
                  <WeComAccountIdentity name={account.name} />
                </TableCell>
                <TableCell className="px-5 py-4 text-muted-foreground">
                  {resolveApplicationScopeAgentLabel(account.associatedAgentId)}
                </TableCell>
                <TableCell className="px-5 py-4">
                  <FeatureStatus enabled={account.autoHostingEnabled} />
                </TableCell>
                <TableCell className="px-5 py-4">
                  <FeatureStatus enabled={account.scriptRecommendationEnabled} />
                </TableCell>
                <TableCell className="px-5 py-4">
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
    </section>
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
