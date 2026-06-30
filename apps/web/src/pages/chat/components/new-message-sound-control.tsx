import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PlayIcon,
  Settings03Icon,
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getNewMessageSoundOption,
  getNewMessageSoundPreference,
  getNewMessageSoundTriggerOption,
  isNewMessageSoundUnlocked,
  NEW_MESSAGE_SOUND_OPTIONS,
  NEW_MESSAGE_SOUND_TRIGGER_OPTIONS,
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

  function handleSummarySwitchChange(checked: boolean) {
    if (!checked) {
      syncPreference({ ...preference, enabled: false });
      setActivePopover(null);
      return;
    }

    openSettingsDialog("enable");
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
            onClick={openSummaryPopover}
            onMouseEnter={openSummaryPopover}
            onMouseLeave={scheduleCloseSummaryPopover}
            onPointerDown={(event) => {
              event.preventDefault();
              openSummaryPopover();
            }}
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
          className={cn(activePopover === "reEnable" ? "w-80 p-4" : "w-72 p-3")}
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
                <p className="mt-3 text-xs text-destructive" role="alert">
                  {reEnableError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
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
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">新消息提醒</p>
                <Button
                  aria-label="修改新消息提醒设置"
                  className="size-7 rounded-[8px] p-0"
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
              <div className="space-y-3 text-sm">
                <SummaryRow label="提示音" value={soundLabel} />
                <SummaryRow label="提示时机" value={triggerLabel} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">状态</span>
                  <Switch
                    aria-label="新消息提醒状态"
                    checked={preference.enabled}
                    onCheckedChange={handleSummarySwitchChange}
                  />
                </div>
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>新消息提醒</DialogTitle>
            <DialogDescription>
              设置工作台收到新消息时的本地提示音
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
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

            <div className="grid gap-2">
              <Label htmlFor="new-message-sound-trigger-select">提示时机</Label>
              <Select
                onValueChange={(value) =>
                  setFormTrigger(value as NewMessageSoundTrigger)
                }
                value={formTrigger}
              >
                <SelectTrigger
                  aria-label="提示时机"
                  className="w-full"
                  id="new-message-sound-trigger-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_MESSAGE_SOUND_TRIGGER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.value === "all_new_messages"
                        ? "收到新消息时"
                        : option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {settingsError ? (
              <p className="text-xs text-destructive" role="alert">
                {settingsError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-36 truncate text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
