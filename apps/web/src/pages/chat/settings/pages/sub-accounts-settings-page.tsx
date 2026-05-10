import {
  Add01Icon,
  EyeIcon,
  MoreHorizontalIcon,
  Search01Icon,
  ShuffleIcon,
  UserAccountIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  SettingsSubAccount,
  SettingsSubAccountCreateRequest,
  SettingsSubAccountsResponse,
  SettingsSubAccountUpdateRequest,
  SettingsWeComSeat,
} from "@chatai/contracts";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  createSubAccount,
  deleteSubAccount,
  listSubAccounts,
  updateSubAccount,
  updateSubAccountStatus,
} from "@/pages/chat/settings/settings-service";
import { Field, PageHeader, StatusText } from "@/pages/chat/settings/shared";
import { cn } from "@/lib/utils";

type FormMode = "create" | "edit";

type DialogState =
  | {
      mode: "create";
      subAccount?: undefined;
    }
  | {
      mode: "edit";
      subAccount: SettingsSubAccount;
    };

type FormValues = {
  account: string;
  name: string;
  password: string;
  seatIds: string[];
};

const emptyData: SettingsSubAccountsResponse = {
  seats: [],
  subAccounts: [],
};

export function SubAccountsSettingsPage() {
  const [data, setData] = useState<SettingsSubAccountsResponse>(emptyData);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SettingsSubAccount | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await listSubAccounts();

        if (!ignore) {
          setData(response);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredSubAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return data.subAccounts;
    }

    return data.subAccounts.filter((subAccount) =>
      [subAccount.name, subAccount.account]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [data.subAccounts, query]);

  async function handleSubmit(values: FormValues, mode: FormMode) {
    const actionKey = mode === "create" ? "create" : `edit:${dialogState?.subAccount?.id}`;

    setPendingAction(actionKey);

    try {
      if (mode === "create") {
        const nextSubAccount = await createSubAccount({
          account: values.account.trim(),
          name: values.name.trim(),
          password: values.password,
          seatIds: values.seatIds,
        } satisfies SettingsSubAccountCreateRequest);

        setData((current) => ({
          ...current,
          subAccounts: [nextSubAccount, ...current.subAccounts],
        }));
        toast.success("子账号已新增");
      } else if (dialogState?.mode === "edit") {
        const nextSubAccount = await updateSubAccount(dialogState.subAccount.id, {
          name: values.name.trim(),
          password: values.password,
          seatIds: values.seatIds,
        } satisfies SettingsSubAccountUpdateRequest);

        setData((current) => ({
          ...current,
          subAccounts: current.subAccounts.map((subAccount) =>
            subAccount.id === nextSubAccount.id ? nextSubAccount : subAccount,
          ),
        }));
        toast.success("子账号已更新");
      }

      setDialogState(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggleStatus(subAccount: SettingsSubAccount) {
    const nextStatus = subAccount.status === "active" ? "disabled" : "active";

    setPendingAction(`status:${subAccount.id}`);

    try {
      const nextSubAccount = await updateSubAccountStatus(subAccount.id, nextStatus);

      setData((current) => ({
        ...current,
        subAccounts: current.subAccounts.map((item) =>
          item.id === nextSubAccount.id ? nextSubAccount : item,
        ),
      }));
      toast.success(nextStatus === "active" ? "子账号已启用" : "子账号已停用");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setPendingAction(`delete:${deleteTarget.id}`);

    try {
      await deleteSubAccount(deleteTarget.id);
      setData((current) => ({
        ...current,
        subAccounts: current.subAccounts.filter(
          (subAccount) => subAccount.id !== deleteTarget.id,
        ),
      }));
      setDeleteTarget(null);
      toast.success("子账号已删除");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <PageHeader
        description="管理登录工作台的子账号，以及子账号可接待的托管账号范围"
        eyebrow="SETTINGS / SUB ACCOUNTS"
        title="子账号管理"
      />

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-[280px]">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索子账号"
            className="h-10 rounded-[8px] pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索子账号"
            value={query}
          />
        </div>

        <Button
          className="h-10 px-4"
          onClick={() => setDialogState({ mode: "create" })}
          type="button"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={Add01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <span>新增子账号</span>
        </Button>
      </section>

      {errorMessage ? (
        <section className="mt-6 rounded-[10px] border border-destructive/30 bg-destructive-muted p-5 text-sm text-destructive">
          {errorMessage}
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-[10px] border border-border">
          <Table aria-label="子账号列表">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%] px-5 py-4">账号</TableHead>
                <TableHead className="w-[14%] px-5 py-4">账号状态</TableHead>
                <TableHead className="w-[30%] px-5 py-4">关联企微账号</TableHead>
                <TableHead className="px-5 py-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell className="px-5 py-10" colSpan={4}>
                    <div
                      aria-label="正在加载子账号"
                      className="flex items-center justify-center gap-3 text-sm text-muted-foreground"
                      role="status"
                    >
                      <DotMatrixLoader
                        ariaLabel="正在加载"
                        className="text-foreground"
                        dotSize={3}
                        size={22}
                      />
                      <span>正在加载子账号</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSubAccounts.length > 0 ? (
                filteredSubAccounts.map((subAccount) => (
                  <SubAccountRow
                    isDeleting={pendingAction === `delete:${subAccount.id}`}
                    isStatusPending={pendingAction === `status:${subAccount.id}`}
                    key={subAccount.id}
                    onDelete={() => setDeleteTarget(subAccount)}
                    onEdit={() => setDialogState({ mode: "edit", subAccount })}
                    onToggleStatus={() => {
                      void handleToggleStatus(subAccount);
                    }}
                    subAccount={subAccount}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={4}>
                    暂无子账号
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}

      <SubAccountDialog
        isSubmitting={
          pendingAction === "create" ||
          (dialogState?.mode === "edit" &&
            pendingAction === `edit:${dialogState.subAccount.id}`)
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
        onSubmit={handleSubmit}
        open={!!dialogState}
        seats={data.seats}
        state={dialogState}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除子账号</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该子账号将无法登录工作台，已关联企微账号不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction?.startsWith("delete:")}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingAction?.startsWith("delete:")}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              variant="destructive"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SubAccountRow({
  isDeleting,
  isStatusPending,
  onDelete,
  onEdit,
  onToggleStatus,
  subAccount,
}: {
  isDeleting: boolean;
  isStatusPending: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  subAccount: SettingsSubAccount;
}) {
  const isActive = subAccount.status === "active";
  const isMainAccount = subAccount.type === 1;

  return (
    <TableRow>
      <TableCell className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
            <HugeiconsIcon
              color="currentColor"
              icon={UserAccountIcon}
              size={16}
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-medium text-foreground">{subAccount.name}</p>
              {isMainAccount ? <Badge>主账号</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{subAccount.account}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <StatusText tone={isActive ? "success" : "muted"}>
          {isActive ? "启用" : "停用"}
        </StatusText>
      </TableCell>
      <TableCell className="px-5 py-5">
        <RelatedSeatsPreview seats={subAccount.seats} subAccountName={subAccount.name} />
      </TableCell>
      <TableCell className="px-5 py-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`打开 ${subAccount.name} 操作菜单`}
              className="size-8 rounded-[8px]"
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={MoreHorizontalIcon}
                size={16}
                strokeWidth={1.8}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[116px]">
            <DropdownMenuItem onSelect={() => onEdit()}>编辑</DropdownMenuItem>
            <DropdownMenuItem
              disabled={isMainAccount || isStatusPending}
              onSelect={() => onToggleStatus()}
            >
              {isActive ? "停用" : "启用"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive data-[highlighted]:text-destructive"
              disabled={isMainAccount || isDeleting}
              onSelect={() => onDelete()}
            >
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function RelatedSeatsPreview({
  seats,
  subAccountName,
}: {
  seats: SettingsWeComSeat[];
  subAccountName: string;
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (seats.length === 0) {
    return <span className="text-sm text-muted-foreground">未关联</span>;
  }

  const visibleSeats = seats.slice(0, 3);
  const hiddenCount = Math.max(seats.length - visibleSeats.length, 0);

  function openPopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }

  function scheduleClosePopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={`查看 ${subAccountName} 的全部关联企微账号`}
          className="h-8 justify-start rounded-full p-0 hover:bg-transparent"
          onBlur={scheduleClosePopover}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          type="button"
          variant="ghost"
        >
          <span className="flex items-center">
            {visibleSeats.map((seat, index) => (
              <SeatAvatar
                className={index === 0 ? undefined : "-ml-2"}
                key={seat.seatId}
                seat={seat}
              />
            ))}
            {hiddenCount > 0 ? (
              <span className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-muted text-xs font-semibold text-muted-foreground">
                +{hiddenCount}
              </span>
            ) : null}
          </span>
        </Button>
      </PopoverTrigger>
      <RelatedSeatsPopoverContent
        seats={seats}
        onCloseRequest={scheduleClosePopover}
        onOpenRequest={openPopover}
      />
    </Popover>
  );
}

function RelatedSeatsPopoverContent({
  onCloseRequest,
  onOpenRequest,
  seats,
}: {
  onCloseRequest: () => void;
  onOpenRequest: () => void;
  seats: SettingsWeComSeat[];
}) {
  return (
    <PopoverContent
      align="start"
      className="w-[20rem] p-3"
      onBlur={onCloseRequest}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onFocus={onOpenRequest}
      onMouseEnter={onOpenRequest}
      onMouseLeave={onCloseRequest}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-2.5">
          <p className="text-sm font-medium text-foreground">
            关联企微账号 · {seats.length}
          </p>
        </div>
        <ScrollArea className="h-[16rem]">
          <div className="space-y-1 pr-2">
            {seats.map((seat) => (
              <div
                className="flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground"
                key={seat.seatId}
              >
                <SeatAvatar seat={seat} />
                <span className="min-w-0 flex-1 truncate">{seat.name}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </PopoverContent>
  );
}

function SeatAvatar({
  className,
  seat,
}: {
  className?: string;
  seat: SettingsWeComSeat;
}) {
  return (
    <Avatar
      aria-label={`关联企微账号 ${seat.name}`}
      className={cn("size-8 rounded-full border-2 border-surface", className)}
      title={seat.name}
    >
      {seat.avatarUrl ? (
        <img
          alt={seat.name}
          className="absolute inset-0 size-full rounded-[inherit] object-cover"
          src={seat.avatarUrl}
        />
      ) : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        {getSeatInitial(seat.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function getSeatInitial(name: string) {
  return name.trim().slice(0, 1) || "?";
}

function SeatSelectionList({
  onQueryChange,
  onToggleSeat,
  query,
  seats,
  selectedSeatIds,
}: {
  onQueryChange: (query: string) => void;
  onToggleSeat: (seatId: string) => void;
  query: string;
  seats: SettingsWeComSeat[];
  selectedSeatIds: string[];
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const selectedSeatIdSet = new Set(selectedSeatIds);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSeats = normalizedQuery
    ? seats.filter((seat) => seat.name.toLowerCase().includes(normalizedQuery))
    : seats;
  const selectedSeats = seats.filter((seat) => selectedSeatIdSet.has(seat.seatId));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">分配托管账号</h2>
        <span className="text-xs text-muted-foreground">
          已选择 {selectedSeatIds.length} 个
        </span>
      </div>

      <Popover
        modal={false}
        onOpenChange={setIsPickerOpen}
        open={isPickerOpen}
      >
        <PopoverAnchor asChild>
          <div ref={pickerAnchorRef}>
            <Input
              aria-label="搜索并选择托管账号"
              className="h-9 rounded-[8px]"
              onChange={(event) => {
                onQueryChange(event.target.value);
                setIsPickerOpen(true);
              }}
              onFocus={() => setIsPickerOpen(true)}
              placeholder="搜索并选择托管账号"
              value={query}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popper-anchor-width)] rounded-[10px] p-2"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target;

            if (target instanceof Node && pickerAnchorRef.current?.contains(target)) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          sideOffset={8}
        >
          {seats.length > 0 ? (
            <ScrollArea className="h-[15rem]">
              <div className="space-y-1 pr-2">
                {filteredSeats.length > 0 ? (
                  filteredSeats.map((seat) => (
                    <label
                      className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground hover:bg-surface-hover"
                      key={seat.seatId}
                    >
                      <Checkbox
                        aria-label={seat.name}
                        checked={selectedSeatIdSet.has(seat.seatId)}
                        onCheckedChange={() => onToggleSeat(seat.seatId)}
                      />
                      <SeatAvatar seat={seat} />
                      <span className="min-w-0 flex-1 truncate">{seat.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
                    未找到匹配账号
                  </p>
                )}
              </div>
            </ScrollArea>
          ) : (
            <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
              暂无可分配企微账号
            </p>
          )}
        </PopoverContent>
      </Popover>

      {selectedSeats.length > 0 ? (
        <ScrollArea className="h-[9rem] rounded-[10px] border border-border">
          <div className="space-y-1 p-2">
            {selectedSeats.map((seat) => (
              <div
                className="flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground"
                key={seat.seatId}
              >
                <SeatAvatar seat={seat} />
                <span className="min-w-0 flex-1 truncate">{seat.name}</span>
                <Button
                  className="h-7 rounded-[8px] px-2 text-xs text-muted-foreground"
                  onClick={() => onToggleSeat(seat.seatId)}
                  type="button"
                  variant="ghost"
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          暂无已分配账号
        </div>
      )}
    </section>
  );
}

function SubAccountDialog({
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
  seats,
  state,
}: {
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FormValues, mode: FormMode) => Promise<void>;
  open: boolean;
  seats: SettingsWeComSeat[];
  state: DialogState | null;
}) {
  const [formValues, setFormValues] = useState<FormValues>({
    account: "",
    name: "",
    password: "",
    seatIds: [],
  });
  const [formError, setFormError] = useState("");
  const [seatQuery, setSeatQuery] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const accountId = useId();
  const nameId = useId();
  const passwordId = useId();
  const mode = state?.mode ?? "create";

  useEffect(() => {
    if (!state) {
      return;
    }

    setFormValues({
      account: state.subAccount?.account ?? "",
      name: state.subAccount?.name ?? "",
      password: "",
      seatIds: state.subAccount?.seats.map((seat) => seat.seatId) ?? [],
    });
    setFormError("");
    setSeatQuery("");
    setShowPassword(false);
  }, [state]);

  function updateField(field: keyof FormValues, value: string | string[]) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleSeat(seatId: string) {
    setFormValues((current) => ({
      ...current,
      seatIds: current.seatIds.includes(seatId)
        ? current.seatIds.filter((item) => item !== seatId)
        : [...current.seatIds, seatId],
    }));
  }

  function handleGeneratePassword() {
    updateField("password", generatePassword());
    setShowPassword(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formValues.account.trim() || !formValues.name.trim()) {
      setFormError("请完整填写子账号信息");
      return;
    }

    if (mode === "create" && !formValues.password.trim()) {
      setFormError("请填写密码");
      return;
    }

    await onSubmit(formValues, mode);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "添加子账号" : "编辑子账号"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "填写登录信息，并为子账号分配可接待的企微账号"
              : "登录用户名不可修改，密码留空时不更新"}
          </DialogDescription>
        </DialogHeader>

        <form aria-label="子账号表单" className="space-y-5" onSubmit={handleSubmit}>
          <Field htmlFor={accountId} label="登录用户名">
            <Input
              autoComplete="username"
              disabled={mode === "edit"}
              id={accountId}
              onChange={(event) => updateField("account", event.target.value)}
              placeholder="请输入"
              value={formValues.account}
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={passwordId}>密码</Label>
              <button
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                onClick={handleGeneratePassword}
                type="button"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={ShuffleIcon}
                  size={15}
                  strokeWidth={1.8}
                />
                <span>随机生成</span>
              </button>
            </div>
            <div className="relative">
              <Input
                autoComplete="new-password"
                id={passwordId}
                name={mode === "create" ? "newSubAccountPassword" : "updatedSubAccountPassword"}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="请输入"
                type={showPassword ? "text" : "password"}
                value={formValues.password}
              />
              <Button
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute right-2 top-1/2 size-8 -translate-y-1/2 rounded-[8px] text-muted-foreground"
                onClick={() => setShowPassword((current) => !current)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={showPassword ? ViewOffIcon : EyeIcon}
                  size={16}
                  strokeWidth={1.8}
                />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "create"
                ? "密码必须包含大写字母、小写字母、数字、符号"
                : "留空则不修改密码"}
            </p>
          </div>

          <Field htmlFor={nameId} label="姓名">
            <Input
              autoComplete="name"
              id={nameId}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="请输入"
              value={formValues.name}
            />
          </Field>

          <SeatSelectionList
            query={seatQuery}
            seats={seats}
            selectedSeatIds={formValues.seatIds}
            onQueryChange={setSeatQuery}
            onToggleSeat={toggleSeat}
          />

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isSubmitting} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={isSubmitting} type="submit">
              确认提交
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "操作失败，请稍后重试";
}

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = `${upper}${lower}${digits}${symbols}`;
  const required = [upper, lower, digits, symbols].map((chars) => pickRandomChar(chars));
  const rest = Array.from({ length: 8 }, () => pickRandomChar(all));
  const combined = [...required, ...rest];

  for (let index = combined.length - 1; index > 0; index -= 1) {
    const swapIndex = getRandomInt(index + 1);
    [combined[index], combined[swapIndex]] = [combined[swapIndex], combined[index]];
  }

  return combined.join("");
}

function pickRandomChar(chars: string) {
  return chars[getRandomInt(chars.length)];
}

function getRandomInt(maxExclusive: number) {
  const randomValues = new Uint32Array(1);
  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % maxExclusive);

  do {
    crypto.getRandomValues(randomValues);
  } while (randomValues[0] >= limit);

  return randomValues[0] % maxExclusive;
}
