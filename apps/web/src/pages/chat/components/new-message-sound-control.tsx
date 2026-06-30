import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Clock01Icon,
  Notification01Icon,
  PlayIcon,
  Settings03Icon,
  Tick02Icon,
  ViewOffIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getNewMessageSoundOption,
  getNewMessageSoundPreference,
  getNewMessageSoundTriggerOption,
  isNewMessageSoundUnlocked,
  NEW_MESSAGE_SOUND_OPTIONS,
  playNewMessageSoundPreview,
  subscribeNewMessageSoundUnlockChange,
  unlockNewMessageSound,
  writeNewMessageSoundPreference,
  type NewMessageSoundId,
  type NewMessageSoundPreference,
  type NewMessageSoundTrigger,
} from "@/pages/chat/lib/new-message-sound-alert";

const SUMMARY_POPOVER_CLOSE_DELAY_MS = 120;

type SettingsDialogMode = "enable" | "edit";
type ActivePopover = "summary" | "reEnable";

const DEFAULT_SOUND_PREFERENCE: NewMessageSoundPreference = {
  enabled: false,
  soundId: "msg_sound1",
  trigger: "unfocused_only",
};
const SOUND_PLAYBACK_ERROR = "无法播放提示音，请检查浏览器权限";
const TRIGGER_SETTING_OPTIONS: Array<{
  description: string;
  icon: typeof VolumeHighIcon;
  label: string;
  value: NewMessageSoundTrigger;
}> = [
  {
    description: "只在离开当前页面后播放",
    icon: ViewOffIcon,
    label: "页面未聚焦时",
    value: "unfocused_only",
  },
  {
    description: "工作台收到新消息就播放",
    icon: Notification01Icon,
    label: "收到新消息时",
    value: "all_new_messages",
  },
];

export function NewMessageSoundControl() {
  const [preference, setPreference] =
    useState<NewMessageSoundPreference>(DEFAULT_SOUND_PREFERENCE);
  const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);
  const [settingsDialogMode, setSettingsDialogMode] =
    useState<SettingsDialogMode | null>(null);
  const [formSoundId, setFormSoundId] = useState<NewMessageSoundId>(
    DEFAULT_SOUND_PREFERENCE.soundId,
  );
  const [formTrigger, setFormTrigger] = useState<NewMessageSoundTrigger>(
    DEFAULT_SOUND_PREFERENCE.trigger,
  );
  const closeSummaryTimerRef = useRef<number | undefined>(undefined);
  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [unlockSignal, setUnlockSignal] = useState(0);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reEnableError, setReEnableError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    const savedPreference = getNewMessageSoundPreference();
    setPreference(savedPreference);
    setFormSoundId(savedPreference.soundId);
    setFormTrigger(savedPreference.trigger);

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (settingsDialogMode !== null) {
      return;
    }

    if (preference.enabled && !isNewMessageSoundUnlocked(preference.soundId)) {
      setActivePopover("reEnable");
      return;
    }

    setActivePopover((current) => (current === "reEnable" ? null : current));
  }, [preference.enabled, preference.soundId, settingsDialogMode, unlockSignal]);

  useEffect(() => (
    subscribeNewMessageSoundUnlockChange(() => {
      setUnlockSignal((current) => current + 1);
    })
  ), []);

  useEffect(() => () => {
    if (closeSummaryTimerRef.current) {
      window.clearTimeout(closeSummaryTimerRef.current);
    }
  }, []);

  const soundLabel = getNewMessageSoundOption(preference.soundId).label;
  const triggerLabel = getNewMessageSoundTriggerOption(preference.trigger).label;
  const statusLabel = preference.enabled ? "提示音开" : "提示音关";

  function syncPreference(nextPreference: NewMessageSoundPreference) {
    writeNewMessageSoundPreference(nextPreference);
    setPreference(nextPreference);
  }

  function closeSettingsDialog() {
    setSettingsDialogMode(null);
    setSettingsError(null);
  }

  function openSettingsDialog(mode: SettingsDialogMode) {
    setFormSoundId(preference.soundId);
    setFormTrigger(preference.trigger);
    setSettingsError(null);
    setReEnableError(null);
    setSummaryError(null);
    setSettingsDialogMode(mode);
    setActivePopover(null);
  }

  async function handleSaveSettings() {
    const requestId = ++requestIdRef.current;
    const didUnlock = await unlockNewMessageSound(formSoundId);
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    if (!didUnlock) {
      setSettingsError(SOUND_PLAYBACK_ERROR);
      return;
    }

    syncPreference({
      enabled: settingsDialogMode === "enable" ? true : preference.enabled,
      soundId: formSoundId,
      trigger: formTrigger,
    });
    setSettingsError(null);
    closeSettingsDialog();
  }

  async function handlePreview() {
    const requestId = ++requestIdRef.current;
    const didPlay = await playNewMessageSoundPreview(formSoundId);
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    setSettingsError(didPlay ? null : SOUND_PLAYBACK_ERROR);
  }

  async function handleCapsuleClick() {
    if (activePopover === "reEnable") {
      return;
    }

    if (preference.enabled) {
      syncPreference({ ...preference, enabled: false });
      setSummaryError(null);
      setActivePopover(null);
      return;
    }

    setSummaryError(null);
    const requestId = ++requestIdRef.current;
    const didUnlock = await unlockNewMessageSound(preference.soundId);
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    if (!didUnlock) {
      setSummaryError(SOUND_PLAYBACK_ERROR);
      setActivePopover("summary");
      return;
    }

    syncPreference({ ...preference, enabled: true });
    setSummaryError(null);
    setActivePopover("summary");
  }

  async function handleReEnable() {
    const requestId = ++requestIdRef.current;
    const didUnlock = await unlockNewMessageSound(preference.soundId);
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    if (didUnlock) {
      setReEnableError(null);
      setActivePopover(null);
      return;
    }

    setReEnableError(SOUND_PLAYBACK_ERROR);
  }

  function handleIgnoreReEnable() {
    syncPreference({ ...preference, enabled: false });
    setReEnableError(null);
    setSummaryError(null);
    setActivePopover(null);
  }

  function openSummaryPopover() {
    if (activePopover === "reEnable") {
      return;
    }

    if (closeSummaryTimerRef.current) {
      window.clearTimeout(closeSummaryTimerRef.current);
      closeSummaryTimerRef.current = undefined;
    }
    setActivePopover("summary");
  }

  function scheduleCloseSummaryPopover() {
    if (closeSummaryTimerRef.current) {
      window.clearTimeout(closeSummaryTimerRef.current);
    }

    closeSummaryTimerRef.current = window.setTimeout(() => {
      setActivePopover((current) => (current === "summary" ? null : current));
    }, SUMMARY_POPOVER_CLOSE_DELAY_MS);
  }

  return (
    <>
      <Popover
        modal={false}
        onOpenChange={(open) => {
          if (!open) {
            setActivePopover((current) => (current === "reEnable" ? current : null));
          }
        }}
        open={activePopover !== null}
      >
        <PopoverAnchor asChild>
          <button
            aria-label={preference.enabled ? "新消息提醒已开启" : "新消息提醒未开启"}
            className={cn(
              "group inline-flex h-[30px] min-w-[112px] items-center gap-2 rounded-[15px] border border-border bg-surface-muted px-1.5 pl-3 text-xs font-medium outline-none transition-colors hover:bg-surface-muted/80 focus-visible:ring-4 focus-visible:ring-ring/20",
              preference.enabled
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={handleCapsuleClick}
            onMouseEnter={openSummaryPopover}
            onMouseLeave={scheduleCloseSummaryPopover}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate text-left">{statusLabel}</span>
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 transition-colors",
                preference.enabled
                  ? "justify-end border-primary/25 bg-background"
                  : "justify-start border-border/80 bg-background/70",
              )}
            >
              <span
                className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={preference.enabled ? VolumeHighIcon : VolumeMute01Icon}
                  size={12}
                  strokeWidth={1.8}
                />
              </span>
            </span>
          </button>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className={cn(
            activePopover === "reEnable"
              ? "w-[380px] max-w-[calc(100vw-2rem)] p-5"
              : "w-[360px] max-w-[calc(100vw-2rem)] p-5",
          )}
          onInteractOutside={(event) => {
            if (activePopover === "reEnable") {
              event.preventDefault();
            }
          }}
          onMouseEnter={() => {
            if (activePopover === "summary") {
              openSummaryPopover();
            }
          }}
          onMouseLeave={scheduleCloseSummaryPopover}
        >
          {activePopover === "reEnable" ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  重新开启消息提示音
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  温馨提醒：浏览器刷新后需点击一次开启提示音，以免错过新消息哦
                </p>
              </div>
              {reEnableError ? (
                <p className="mt-4 text-xs leading-5 text-destructive" role="alert">
                  {reEnableError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-3">
                <Button
                  onClick={handleIgnoreReEnable}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  忽略
                </Button>
                <Button onClick={handleReEnable} size="sm" type="button">
                  点此开启
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-foreground">
                  新消息提醒
                </p>
                <Button
                  aria-label="修改新消息提醒设置"
                  className="size-8 rounded-[9px] p-0"
                  onClick={() => openSettingsDialog("edit")}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Settings03Icon}
                    size={15}
                    strokeWidth={1.8}
                  />
                </Button>
              </div>
              <div className="space-y-2 text-sm">
                <SummaryRow icon={VolumeHighIcon} label="提示音" value={soundLabel} />
                <SummaryRow icon={Clock01Icon} label="提示时机" value={triggerLabel} />
                <SummaryRow
                  icon={preference.enabled ? Tick02Icon : VolumeMute01Icon}
                  label="状态"
                  value={preference.enabled ? "开启" : "关闭"}
                />
                {summaryError ? (
                  <p className="pt-1 text-xs leading-5 text-destructive" role="alert">
                    {summaryError}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeSettingsDialog();
          }
        }}
        open={settingsDialogMode !== null}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="space-y-2 pr-8">
            <DialogTitle>新消息提醒</DialogTitle>
            <DialogDescription>
              设置工作台收到新消息时的本地提示音
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-1">
            <div className="grid gap-2.5">
              <Label htmlFor="new-message-sound-select">提示音</Label>
              <Select
                onValueChange={(value) => setFormSoundId(value as NewMessageSoundId)}
                value={formSoundId}
              >
                <SelectTrigger
                  aria-label="提示音"
                  className="w-full"
                  id="new-message-sound-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_MESSAGE_SOUND_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2.5">
              <Label>提示时机</Label>
              <div
                aria-label="提示时机"
                className="grid gap-3 sm:grid-cols-2"
                role="group"
              >
                {TRIGGER_SETTING_OPTIONS.map((option) => (
                  <TriggerOptionButton
                    key={option.value}
                    onClick={() => setFormTrigger(option.value)}
                    option={option}
                    selected={formTrigger === option.value}
                  />
                ))}
              </div>
            </div>
            {settingsError ? (
              <p className="text-xs leading-5 text-destructive" role="alert">
                {settingsError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-3 pt-1 sm:space-x-0">
            <Button
              className="mr-auto"
              onClick={handlePreview}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={PlayIcon}
                size={15}
                strokeWidth={1.8}
              />
              试听
            </Button>
            <Button
              onClick={closeSettingsDialog}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button onClick={handleSaveSettings} type="button">
              {settingsDialogMode === "enable" ? "保存并开启" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: typeof VolumeHighIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2.5">
      <span className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <HugeiconsIcon
          color="currentColor"
          icon={icon}
          size={15}
          strokeWidth={1.8}
        />
      </span>
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="max-w-40 truncate text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function TriggerOptionButton({
  onClick,
  option,
  selected,
}: {
  onClick: () => void;
  option: (typeof TRIGGER_SETTING_OPTIONS)[number];
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group flex min-h-[92px] items-start gap-3 rounded-[12px] border bg-background p-4 text-left outline-none transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-4 focus-visible:ring-ring/20",
        selected
          ? "border-primary/55 bg-primary/10 text-foreground shadow-xs"
          : "border-border text-muted-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-surface-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        <HugeiconsIcon
          color="currentColor"
          icon={option.icon}
          size={16}
          strokeWidth={1.8}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {option.label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {option.description}
        </span>
      </span>
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-transparent",
        )}
        aria-hidden="true"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={Tick02Icon}
          size={12}
          strokeWidth={2}
        />
      </span>
    </button>
  );
}
