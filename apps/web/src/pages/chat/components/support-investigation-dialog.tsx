import { useMemo, useRef, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SUPPORT_INVESTIGATION_REASONS,
  type SupportInvestigationReason,
  type SupportInvestigationTargetAccount,
} from "@chatai/contracts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import {
  getSupportInvestigationAccounts,
  startSupportInvestigation,
} from "@/pages/auth/auth-service";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

type SupportInvestigationDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function SupportInvestigationDialog({
  onOpenChange,
  open,
}: SupportInvestigationDialogProps) {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const resetWorkbenchSession = useWorkbenchStore(
    (state) => state.resetWorkbenchSession,
  );
  const queryIdRef = useRef(0);
  const [accounts, setAccounts] = useState<SupportInvestigationTargetAccount[]>([]);
  const [uidError, setUidError] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [reason, setReason] = useState<SupportInvestigationReason>();
  const [selectedSubUserId, setSelectedSubUserId] = useState("");
  const [starting, setStarting] = useState(false);
  const [uidInput, setUidInput] = useState("");

  const filteredAccounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();

    if (!normalizedKeyword) {
      return accounts;
    }

    return accounts.filter((account) =>
      account.displayName.toLocaleLowerCase().includes(normalizedKeyword)
      || account.maskedAccount.toLocaleLowerCase().includes(normalizedKeyword));
  }, [accounts, keyword]);

  const reset = () => {
    queryIdRef.current += 1;
    setAccounts([]);
    setUidError(undefined);
    setKeyword("");
    setLoadingAccounts(false);
    setReason(undefined);
    setSelectedSubUserId("");
    setStarting(false);
    setUidInput("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }

    onOpenChange(nextOpen);
  };

  const handleQuery = async () => {
    const uid = Number(uidInput.trim());

    if (!/^[1-9]\d*$/.test(uidInput.trim()) || !Number.isSafeInteger(uid)) {
      setUidError("请输入有效的 UID");
      return;
    }

    const queryId = queryIdRef.current + 1;
    queryIdRef.current = queryId;
    setAccounts([]);
    setUidError(undefined);
    setKeyword("");
    setLoadingAccounts(true);
    setSelectedSubUserId("");

    try {
      const response = await getSupportInvestigationAccounts(uid);

      if (queryIdRef.current !== queryId) {
        return;
      }

      setAccounts(response.data.accounts);
    } catch (error) {
      if (queryIdRef.current === queryId) {
        toast.error(getErrorMessage(error, "查询失败，请稍后重试"));
      }
    } finally {
      if (queryIdRef.current === queryId) {
        setLoadingAccounts(false);
      }
    }
  };

  const handleStart = async () => {
    const uid = Number(uidInput.trim());

    if (!selectedSubUserId || !reason || !Number.isSafeInteger(uid)) {
      return;
    }

    setStarting(true);

    try {
      const response = await startSupportInvestigation({
        reason,
        subUserId: selectedSubUserId,
        uid,
      });

      resetWorkbenchSession();
      setSession(response.data.subUser);
      handleOpenChange(false);
      navigate("/chat", { replace: true });
      notifyAuthSessionChanged();
    } catch {
      toast.error("操作失败，请稍后重试");
      setStarting(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(760px,calc(100svh-2rem))] flex-col overflow-hidden sm:max-w-[560px]"
        closeButtonDisabled={starting}
      >
        <DialogHeader>
          <DialogTitle>问题排查</DialogTitle>
        </DialogHeader>

        <div className="-mx-1 min-h-0 space-y-4 overflow-y-auto px-1 pb-1">
          <div className="space-y-2">
            <Label htmlFor="support-investigation-uid">租户 UID</Label>
            <div className="flex gap-2">
              <Input
                aria-invalid={uidError ? true : undefined}
                autoComplete="off"
                disabled={loadingAccounts || starting}
                id="support-investigation-uid"
                inputMode="numeric"
                onChange={(event) => {
                  setUidInput(event.target.value);
                  setUidError(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleQuery();
                  }
                }}
                placeholder="输入 UID"
                value={uidInput}
              />
              <Button
                disabled={loadingAccounts || starting}
                onClick={() => void handleQuery()}
                type="button"
                variant="outline"
              >
                {loadingAccounts ? <Spinner size={16} /> : (
                  <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} />
                )}
                <span>查询</span>
              </Button>
            </div>
            {uidError ? (
              <p className="text-xs text-destructive" role="alert">
                {uidError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-investigation-filter">目标账号</Label>
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={15}
                strokeWidth={1.8}
              />
              <Input
                className="pl-9"
                disabled={loadingAccounts || accounts.length === 0 || starting}
                id="support-investigation-filter"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="筛选账号名称或登录账号"
                value={keyword}
              />
            </div>
            <div className="h-56 overflow-hidden rounded-[8px] border">
              {loadingAccounts ? (
                <div
                  className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Spinner size={16} />
                  <span>正在加载</span>
                </div>
              ) : accounts.length > 0 && filteredAccounts.length > 0 ? (
                <ScrollArea className="h-full">
                  <RadioGroup
                    aria-label="目标账号"
                    className="gap-1 p-2"
                    disabled={starting}
                    onValueChange={setSelectedSubUserId}
                    value={selectedSubUserId}
                  >
                    {filteredAccounts.map((account) => (
                      <Label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors",
                          selectedSubUserId === account.subUserId
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/60",
                        )}
                        htmlFor={`support-account-${account.subUserId}`}
                        key={account.subUserId}
                      >
                        <RadioGroupItem
                          id={`support-account-${account.subUserId}`}
                          value={account.subUserId}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {account.displayName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {account.maskedAccount}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {account.accountType === "main" ? "主账号" : "子账号"}
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                </ScrollArea>
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-investigation-reason">排查原因</Label>
            <Select
              disabled={loadingAccounts || accounts.length === 0 || starting}
              onValueChange={(value) => setReason(value as SupportInvestigationReason)}
              value={reason}
            >
              <SelectTrigger className="w-full" id="support-investigation-reason">
                <SelectValue placeholder="选择排查原因" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_INVESTIGATION_REASONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter>
          <Button
            disabled={starting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={!selectedSubUserId || !reason || starting}
            onClick={() => void handleStart()}
            type="button"
          >
            {starting ? <Spinner size={16} /> : null}
            <span>开始排查</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return isRequestError(error) ? error.message : fallback;
}
