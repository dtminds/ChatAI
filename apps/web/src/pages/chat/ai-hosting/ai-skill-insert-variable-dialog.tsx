import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown01Icon,
  BracketsIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { listCustomFields } from "./api/custom-field-service";
import {
  buildVariablePlaceholder,
  skillVariableStorageId,
  type SkillResourceItem,
  type SkillVariableConfig,
} from "./ai-skill-resource";

type VariableKind = "custom_field" | "customer_tags" | "system_variable";
type TagKind = "work_tag" | "mall_tag" | "auto_tag";
type WecomTagMode = "normal" | "exclusive";

export type InsertVariableInitialConfigure = {
  kind: VariableKind;
  tagKind?: TagKind;
};

type TagItem = {
  id: number;
  name: string;
};

type TagGroup = {
  id: number;
  name: string;
  tags: readonly TagItem[];
};

type CustomInfoFieldOption = {
  id: number;
  name: string;
};

const variableOptions: ReadonlyArray<{
  description: string;
  kind: VariableKind;
  title: string;
}> = [
  {
    description: "查询聊天客户的自定义属性后，插入到指定位置",
    kind: "custom_field",
    title: "客户自定义属性",
  },
  {
    description: "查询您指定的客户标签，然后插入到指定位置",
    kind: "customer_tags",
    title: "客户标签",
  },
  {
    description: "查询系统运行时变量，然后插入到指定位置",
    kind: "system_variable",
    title: "系统变量",
  },
];

const systemVariables = [
  { key: "last_handoff_time", name: "上一次转人工时间" },
  { key: "customer_nickname", name: "客户昵称" },
  { key: "current_agent_name", name: "当前接待 Agent" },
] as const;

const tagKindOptions: ReadonlyArray<{ label: string; value: TagKind }> = [
  { label: "企微标签", value: "work_tag" },
  { label: "小店标签", value: "mall_tag" },
  { label: "自动化标签", value: "auto_tag" },
];

const wecomNormalGroups: readonly TagGroup[] = [
  {
    id: 11,
    name: "意向标签组",
    tags: [
      { id: 111, name: "高意向" },
      { id: 112, name: "中意向" },
      { id: 113, name: "低意向" },
    ],
  },
  {
    id: 12,
    name: "客户阶段",
    tags: [
      { id: 121, name: "新客" },
      { id: 122, name: "活跃客" },
      { id: 123, name: "沉睡客" },
    ],
  },
];

const wecomExclusiveGroups: readonly TagGroup[] = [
  {
    id: 21,
    name: "会员等级组",
    tags: [
      { id: 211, name: "VIP" },
      { id: 212, name: "SVIP" },
      { id: 213, name: "普通会员" },
    ],
  },
];

const memberTagGroups: readonly TagGroup[] = [
  {
    id: 31,
    name: "基础会员标签",
    tags: [
      { id: 311, name: "银卡会员" },
      { id: 312, name: "金卡会员" },
      { id: 313, name: "黑卡会员" },
    ],
  },
  {
    id: 32,
    name: "消费行为",
    tags: [
      { id: 321, name: "复购用户" },
      { id: 322, name: "高消费" },
    ],
  },
];

/** 自动化标签先只支持系统标签分组（接口可扩展）；按文档仅选分组 select_id */
const automationTagGroups: readonly TagGroup[] = [
  { id: 41, name: "价值标签", tags: [] },
  { id: 42, name: "企微基础标签", tags: [] },
  { id: 43, name: "消费标签", tags: [] },
];

type InsertVariableDialogProps = {
  initialConfigure?: InsertVariableInitialConfigure | null;
  onConfirm: (item: SkillResourceItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function InsertVariableDialog({
  initialConfigure = null,
  onConfirm,
  onOpenChange,
  open,
}: InsertVariableDialogProps) {
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [variableKind, setVariableKind] = useState<VariableKind | null>(null);
  const [customFieldId, setCustomFieldId] = useState("");
  const [customInfoFields, setCustomInfoFields] = useState<CustomInfoFieldOption[]>(
    [],
  );
  const [customInfoFieldsLoading, setCustomInfoFieldsLoading] = useState(false);
  const [customInfoFieldsError, setCustomInfoFieldsError] = useState(false);
  const [systemVariableKey, setSystemVariableKey] = useState("");
  const [tagKind, setTagKind] = useState<TagKind>("work_tag");
  const [wecomMode, setWecomMode] = useState<WecomTagMode>("normal");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedAutoGroupId, setSelectedAutoGroupId] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [groupQuery, setGroupQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialConfigure) {
      startConfigure(initialConfigure.kind, initialConfigure.tagKind);
      return;
    }

    resetToPick();
  }, [initialConfigure, open]);

  useEffect(() => {
    if (!open || step !== "configure" || variableKind !== "custom_field") {
      return;
    }

    let cancelled = false;

    async function loadCustomFields() {
      setCustomInfoFieldsLoading(true);
      setCustomInfoFieldsError(false);

      try {
        const response = await listCustomFields({ status: 1 });
        if (cancelled) {
          return;
        }

        setCustomInfoFields(
          response.fields.map((field) => ({
            id: field.id,
            name: field.title,
          })),
        );
      } catch {
        if (!cancelled) {
          setCustomInfoFields([]);
          setCustomInfoFieldsError(true);
          toast.error("自定义属性加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setCustomInfoFieldsLoading(false);
        }
      }
    }

    void loadCustomFields();

    return () => {
      cancelled = true;
    };
  }, [open, step, variableKind]);

  const tagGroups = useMemo(() => {
    if (tagKind === "work_tag") {
      return wecomMode === "normal" ? wecomNormalGroups : wecomExclusiveGroups;
    }

    if (tagKind === "mall_tag") {
      return memberTagGroups;
    }

    return automationTagGroups;
  }, [tagKind, wecomMode]);

  const filteredGroups = useMemo(() => {
    const query = groupQuery.trim().toLowerCase();
    if (!query) {
      return tagGroups;
    }

    return tagGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groupQuery, tagGroups]);

  const resolvedActiveGroupId =
    activeGroupId && filteredGroups.some((group) => group.id === activeGroupId)
      ? activeGroupId
      : (filteredGroups[0]?.id ?? null);

  const activeGroup = useMemo(
    () => filteredGroups.find((group) => group.id === resolvedActiveGroupId) ?? null,
    [filteredGroups, resolvedActiveGroupId],
  );

  const filteredTags = useMemo(() => {
    const tags = activeGroup?.tags ?? [];
    const query = tagQuery.trim().toLowerCase();
    if (!query) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [activeGroup, tagQuery]);

  const selectedTagNames = useMemo(() => {
    if (!activeGroup) {
      return [];
    }

    return selectedTagIds
      .map((id) => activeGroup.tags.find((tag) => tag.id === id)?.name)
      .filter((name): name is string => Boolean(name));
  }, [activeGroup, selectedTagIds]);

  const selectedAutoGroup = useMemo(
    () => automationTagGroups.find((group) => group.id === selectedAutoGroupId) ?? null,
    [selectedAutoGroupId],
  );

  const canConfirm =
    variableKind === "custom_field"
      ? customFieldId.length > 0
      : variableKind === "system_variable"
        ? systemVariableKey.length > 0
        : variableKind === "customer_tags"
          ? tagKind === "auto_tag"
            ? selectedAutoGroupId !== null
            : selectedTagIds.length > 0 && resolvedActiveGroupId !== null
          : false;

  function resetToPick() {
    setStep("pick");
    setVariableKind(null);
    setCustomFieldId("");
    setSystemVariableKey("");
    setTagKind("work_tag");
    setWecomMode("normal");
    setSelectedTagIds([]);
    setSelectedAutoGroupId(null);
    setActiveGroupId(null);
    setGroupQuery("");
    setTagQuery("");
    setTagPickerOpen(false);
  }

  function startConfigure(kind: VariableKind, nextTagKind: TagKind = "work_tag") {
    setVariableKind(kind);
    setCustomFieldId("");
    setSystemVariableKey("");
    setTagKind(nextTagKind);
    setWecomMode("normal");
    setSelectedTagIds([]);
    setSelectedAutoGroupId(null);
    const nextGroups =
      nextTagKind === "work_tag"
        ? wecomNormalGroups
        : nextTagKind === "mall_tag"
          ? memberTagGroups
          : automationTagGroups;
    setActiveGroupId(nextGroups[0]?.id ?? null);
    setGroupQuery("");
    setTagQuery("");
    setTagPickerOpen(false);
    setStep("configure");
  }

  function handleBack() {
    resetToPick();
    setStep("pick");
  }

  function emitVariable(variable: SkillVariableConfig, description: string, title: string) {
    onConfirm({
      description,
      id: skillVariableStorageId(variable),
      placeholder: buildVariablePlaceholder(variable),
      title,
      variable,
    });
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!variableKind || !canConfirm) {
      return;
    }

    if (variableKind === "custom_field") {
      const field = customInfoFields.find((item) => String(item.id) === customFieldId);
      if (!field) {
        return;
      }

      emitVariable(
        {
          name: field.name,
          select_id: field.id,
          type: "custom_field",
        },
        "查询聊天客户的自定义属性后，插入到指定位置",
        `客户自定义属性 · ${field.name}`,
      );
      return;
    }

    if (variableKind === "system_variable") {
      const systemVariable = systemVariables.find((item) => item.key === systemVariableKey);
      if (!systemVariable) {
        return;
      }

      emitVariable(
        {
          name: systemVariable.name,
          select_key: systemVariable.key,
          type: "system_variable",
        },
        "查询系统运行时变量，然后插入到指定位置",
        `系统变量 · ${systemVariable.name}`,
      );
      return;
    }

    if (tagKind === "auto_tag") {
      if (!selectedAutoGroup) {
        return;
      }

      emitVariable(
        {
          name: selectedAutoGroup.name,
          select_id: selectedAutoGroup.id,
          type: "auto_tag",
        },
        "查询您指定的自动化标签分组，然后插入到指定位置",
        `客户标签 · 自动化标签 · ${selectedAutoGroup.name}`,
      );
      return;
    }

    if (!activeGroup || selectedTagIds.length === 0) {
      return;
    }

    const tagKindLabel =
      tagKindOptions.find((option) => option.value === tagKind)?.label ?? "客户标签";
    const summary =
      selectedTagNames.length <= 2
        ? selectedTagNames.join("、")
        : `${selectedTagNames.slice(0, 2).join("、")} 等${selectedTagNames.length}个`;

    emitVariable(
      {
        name: activeGroup.name,
        select_id: activeGroup.id,
        select_sub_ids: [...selectedTagIds],
        type: tagKind,
      },
      "查询您指定的客户标签，然后插入到指定位置",
      `客户标签 · ${tagKindLabel} · ${summary}`,
    );
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[639px] max-h-[calc(100vh-2rem)] w-[min(792px,calc(100vw-2rem))] max-w-[792px] flex-col gap-0 overflow-hidden p-0 sm:rounded-[14px]">
        <div className="flex shrink-0 items-center px-6 pb-2 pt-6 pr-14">
          <DialogTitle className="text-lg font-semibold text-foreground">
            插入变量
          </DialogTitle>
          <DialogDescription className="sr-only">
            选择并配置要插入的变量
          </DialogDescription>
        </div>

        {step === "pick" ? (
          <ul aria-label="插入变量" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-3">
            {variableOptions.map((option) => (
              <li className="flex items-start gap-3" key={option.kind}>
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={BracketsIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{option.title}</p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                <Button
                  aria-label={`添加${option.title}`}
                  className="mt-0.5 h-8 shrink-0 px-3 text-primary"
                  onClick={() => startConfigure(option.kind)}
                  type="button"
                  variant="outline"
                >
                  添加
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4 pt-2">
              <div className="flex h-11 items-center gap-2 rounded-[10px] border border-border bg-muted/30 px-3 text-sm text-foreground">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="text-muted-foreground"
                  icon={BracketsIcon}
                  size={16}
                  strokeWidth={1.8}
                />
                <span>
                  {variableKind === "custom_field"
                    ? "客户自定义属性"
                    : variableKind === "system_variable"
                      ? "系统变量"
                      : "客户标签"}
                </span>
              </div>

              {variableKind === "custom_field" ? (
                <div className="space-y-2">
                  <Label htmlFor="skill-variable-custom-field">
                    <span className="text-destructive">*</span> 字段
                  </Label>
                  {customInfoFieldsLoading ? (
                    <div
                      className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : customInfoFieldsError ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                      role="alert"
                    >
                      加载失败
                    </div>
                  ) : customInfoFields.length === 0 ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      暂无数据
                    </div>
                  ) : (
                    <Select onValueChange={setCustomFieldId} value={customFieldId || undefined}>
                      <SelectTrigger
                        className="h-10 w-full"
                        id="skill-variable-custom-field"
                      >
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {customInfoFields.map((field) => (
                          <SelectItem key={field.id} value={String(field.id)}>
                            {field.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-sm leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">温馨提示：</span>
                    工具会查询指定的自定义属性字段，然后告诉智能体该自定义属性字段的内容。
                  </p>
                </div>
              ) : null}

              {variableKind === "system_variable" ? (
                <div className="space-y-2">
                  <Label htmlFor="skill-variable-system-key">
                    <span className="text-destructive">*</span> 变量
                  </Label>
                  <Select
                    onValueChange={setSystemVariableKey}
                    value={systemVariableKey || undefined}
                  >
                    <SelectTrigger
                      className="h-10 w-full"
                      id="skill-variable-system-key"
                    >
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {systemVariables.map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">温馨提示：</span>
                    工具会读取指定的系统变量，然后告诉智能体该变量当前的值。
                  </p>
                </div>
              ) : null}

              {variableKind === "customer_tags" ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Label>
                      <span className="text-destructive">*</span> 标签类型
                    </Label>
                    <RadioGroup
                      className="flex flex-wrap gap-5"
                      onValueChange={(value) => {
                        const nextKind = value as TagKind;
                        setTagKind(nextKind);
                        setSelectedTagIds([]);
                        setSelectedAutoGroupId(null);
                        setWecomMode("normal");
                        setGroupQuery("");
                        setTagQuery("");
                        const nextGroups =
                          nextKind === "work_tag"
                            ? wecomNormalGroups
                            : nextKind === "mall_tag"
                              ? memberTagGroups
                              : automationTagGroups;
                        setActiveGroupId(nextGroups[0]?.id ?? null);
                      }}
                      value={tagKind}
                    >
                      {tagKindOptions.map((option) => (
                        <label
                          className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                          key={option.value}
                        >
                          <RadioGroupItem
                            aria-label={option.label}
                            value={option.value}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      <span className="text-destructive">*</span>{" "}
                      {tagKind === "auto_tag" ? "标签分组" : "标签"}
                    </Label>

                    {tagKind === "auto_tag" ? (
                      <Select
                        onValueChange={(value) => setSelectedAutoGroupId(Number(value))}
                        value={
                          selectedAutoGroupId !== null
                            ? String(selectedAutoGroupId)
                            : undefined
                        }
                      >
                        <SelectTrigger
                          aria-label="选择自动化标签分组"
                          className="h-10 w-full"
                        >
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          {automationTagGroups.map((group) => (
                            <SelectItem key={group.id} value={String(group.id)}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Popover modal={false} onOpenChange={setTagPickerOpen} open={tagPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            aria-expanded={tagPickerOpen}
                            aria-label="选择标签"
                            className="h-10 w-full justify-between px-3.5 font-normal"
                            type="button"
                            variant="outline"
                          >
                            <span
                              className={cn(
                                "truncate",
                                selectedTagNames.length === 0 && "text-muted-foreground",
                              )}
                            >
                              {selectedTagNames.length === 0
                                ? "请选择"
                                : selectedTagNames.length <= 3
                                  ? selectedTagNames.join("、")
                                  : `已选 ${selectedTagNames.length} 个标签`}
                            </span>
                            <HugeiconsIcon
                              aria-hidden="true"
                              className="opacity-50"
                              icon={ArrowDown01Icon}
                              size={16}
                              strokeWidth={1.8}
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[min(44rem,calc(100vw-4rem))] p-0"
                          sideOffset={8}
                        >
                          {tagKind === "work_tag" ? (
                            <div className="border-b border-border px-3 pt-2">
                              <Tabs
                                onValueChange={(value) => {
                                  const nextMode = value as WecomTagMode;
                                  setWecomMode(nextMode);
                                  setSelectedTagIds([]);
                                  setGroupQuery("");
                                  setTagQuery("");
                                  const nextGroups =
                                    nextMode === "normal"
                                      ? wecomNormalGroups
                                      : wecomExclusiveGroups;
                                  setActiveGroupId(nextGroups[0]?.id ?? null);
                                }}
                                value={wecomMode}
                              >
                                <TabsList aria-label="企微标签分类" variant="underline">
                                  <TabsTrigger
                                    className="px-3 py-2.5"
                                    value="normal"
                                    variant="underline"
                                  >
                                    普通标签
                                  </TabsTrigger>
                                  <TabsTrigger
                                    className="px-3 py-2.5"
                                    value="exclusive"
                                    variant="underline"
                                  >
                                    互斥标签
                                  </TabsTrigger>
                                </TabsList>
                              </Tabs>
                            </div>
                          ) : null}

                          <div className="grid h-72 grid-cols-2">
                            <div className="flex min-h-0 flex-col border-r border-border">
                              <div className="shrink-0 p-3">
                                <div className="relative">
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    icon={Search01Icon}
                                    size={15}
                                    strokeWidth={1.8}
                                  />
                                  <Input
                                    aria-label="搜索标签组"
                                    className="h-9 pl-9"
                                    onChange={(event) => setGroupQuery(event.target.value)}
                                    placeholder="搜索"
                                    value={groupQuery}
                                  />
                                </div>
                              </div>
                              <ul
                                aria-label="标签组"
                                className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
                              >
                                {filteredGroups.length === 0 ? (
                                  <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </li>
                                ) : (
                                  filteredGroups.map((group) => (
                                    <li key={group.id}>
                                      <button
                                        className={cn(
                                          "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                                          group.id === resolvedActiveGroupId
                                            ? "bg-accent text-foreground"
                                            : "text-foreground hover:bg-muted/60",
                                        )}
                                        onClick={() => {
                                          setActiveGroupId(group.id);
                                          setSelectedTagIds([]);
                                          setTagQuery("");
                                        }}
                                        type="button"
                                      >
                                        {group.name}
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>

                            <div className="flex min-h-0 flex-col">
                              <div className="shrink-0 p-3">
                                <div className="relative">
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    icon={Search01Icon}
                                    size={15}
                                    strokeWidth={1.8}
                                  />
                                  <Input
                                    aria-label="搜索标签"
                                    className="h-9 pl-9"
                                    onChange={(event) => setTagQuery(event.target.value)}
                                    placeholder="搜索"
                                    value={tagQuery}
                                  />
                                </div>
                              </div>
                              <ul
                                aria-label="标签列表"
                                className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
                              >
                                {filteredTags.length === 0 ? (
                                  <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </li>
                                ) : (
                                  filteredTags.map((tag) => {
                                    const checked = selectedTagIds.includes(tag.id);

                                    return (
                                      <li key={tag.id}>
                                        <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm hover:bg-muted/60">
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleTag(tag.id)}
                                          />
                                          <span>{tag.name}</span>
                                        </label>
                                      </li>
                                    );
                                  })
                                )}
                              </ul>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}

                    <p className="text-sm leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">温馨提示：</span>
                      {tagKind === "auto_tag"
                        ? "工具会查询指定的自动化标签分组，然后告诉智能体该客户命中了该分组下的哪些标签。"
                        : "工具会查询指定的标签，然后告诉智能体该客户命中了所选标签中的哪些标签。"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button onClick={handleBack} type="button" variant="outline">
                上一步
              </Button>
              <Button disabled={!canConfirm} onClick={handleConfirm} type="button">
                确认插入
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
