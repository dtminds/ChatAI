export type PollingPauseReason = "sync-gap" | "background-timeout" | "other-tab";

export function getPollingPausedDialogCopy(reason: PollingPauseReason | null) {
  if (reason === "sync-gap") {
    return {
      actionText: "重新同步",
      description: "消息同步遇到了问题，请点击下方按钮重新同步",
      title: "消息同步已暂停",
    };
  }

  if (reason === "background-timeout") {
    return {
      actionText: "刷新页面",
      description: "检测到你已离开页面一段时间，已暂停消息同步。",
      title: "已暂停新消息同步",
    };
  }

  return {
    actionText: "刷新页面",
    description: "当前页面已暂停消息同步。若要在此页面继续，请刷新页面",
    title: "实时同步已被其他页面占用",
  };
}

export function resolveStickyPollingPauseReason(
  current: PollingPauseReason | null,
  incoming: PollingPauseReason,
) {
  return current ?? incoming;
}
