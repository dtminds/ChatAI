import { useEffect, useRef, useState } from "react";
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
  unlockNewMessageSound,
  writeNewMessageSoundPreference,
  type NewMessageSoundId,
  type NewMessageSoundPreference,
  type NewMessageSoundTrigger,
} from "@/pages/chat/lib/new-message-sound-alert";

const SUMMARY_POPOVER_CLOSE_DELAY_MS = 120;

type SettingsDialogMode = "enable" | "edit";
type ActivePopover = "summary" | "reEnable";

export function NewMessageSoundControl() {
  const [preference, setPreference] = useState<NewMessageSoundPreference>(() =>
    getNewMessageSoundPreference(),
  );
  const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);
  const [settingsDialogMode, setSettingsDialogMode] =
    useState<SettingsDialogMode | null>(null);
  const [formSoundId, setFormSoundId] = useState<NewMessageSoundId>(
    preference.soundId,
  );
  const [formTrigger, setFormTrigger] = useState<NewMessageSoundTrigger>(
    preference.trigger,
  );
  const closeSummaryTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setPreference(getNewMessageSoundPreference());
  }, []);

  useEffect(() => {
    if (preference.enabled && !isNewMessageSoundUnlocked()) {
      setActivePopover("reEnable");
      return;
    }

    setActivePopover((current) => (current === "reEnable" ? null : current));
  }, [preference.enabled]);

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

  function openSettingsDialog(mode: SettingsDialogMode) {
    setFormSoundId(preference.soundId);
    setFormTrigger(preference.trigger);
    setSettingsDialogMode(mode);
    setActivePopover(null);
  }

  async function handleSaveSettings() {
    const didUnlock = await unlockNewMessageSound(formSoundId);
    if (!didUnlock) {
      return;
    }

    syncPreference({
      enabled: settingsDialogMode === "enable" ? true : preference.enabled,
      soundId: formSoundId,
      trigger: formTrigger,
    });
    setSettingsDialogMode(null);
  }

  async function handlePreview() {
    await playNewMessageSoundPreview(formSoundId);
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
    const didUnlock = await unlockNewMessageSound(preference.soundId);
    if (didUnlock) {
      setActivePopover(null);
    }
  }

  function handleIgnoreReEnable() {
    syncPreference({ ...preference, enabled: false });
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
              "group inline-flex h-[30px] min-w-[112px] items-center gap-2 rounded-[15px] border px-1.5 pl-3 text-xs font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/20",
              preference.enabled
                ? "border-primary/28 bg-primary/8 text-foreground hover:bg-primary/10"
                : "border-border bg-muted/45 text-muted-foreground hover:bg-muted/65 hover:text-foreground",
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
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full shadow-sm transition-colors",
                  preference.enabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
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
            setSettingsDialogMode(null);
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
              onClick={() => setSettingsDialogMode(null)}
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
