export const WORKBENCH_DEFAULT_TITLE = "ChatAI 客服工作台";
export const WORKBENCH_NEW_MESSAGE_TITLE = "【新消息】ChatAI 客服工作台";
export const WORKBENCH_EMPTY_MESSAGE_TITLE = "【　　　】ChatAI 客服工作台";

const TITLE_FLASH_INTERVAL_MS = 1000;

let flashTimer: number | undefined;
let isShowingNewMessageTitle = false;
let didBindResetListeners = false;

export function notifyPulledCustomerMessage() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  if (isCurrentTabActive()) {
    resetWorkbenchTitleAlert();
    return;
  }

  bindResetListeners();
  document.title = WORKBENCH_NEW_MESSAGE_TITLE;
  isShowingNewMessageTitle = true;

  if (flashTimer) {
    return;
  }

  flashTimer = window.setInterval(() => {
    isShowingNewMessageTitle = !isShowingNewMessageTitle;
    document.title = isShowingNewMessageTitle
      ? WORKBENCH_NEW_MESSAGE_TITLE
      : WORKBENCH_EMPTY_MESSAGE_TITLE;
  }, TITLE_FLASH_INTERVAL_MS);
}

export function resetWorkbenchTitleAlert() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  if (flashTimer) {
    window.clearInterval(flashTimer);
    flashTimer = undefined;
  }

  isShowingNewMessageTitle = false;
  document.title = WORKBENCH_DEFAULT_TITLE;
}

function bindResetListeners() {
  if (didBindResetListeners) {
    return;
  }

  window.addEventListener("focus", resetWhenCurrentTabActive);
  document.addEventListener("visibilitychange", resetWhenCurrentTabActive);
  didBindResetListeners = true;
}

function resetWhenCurrentTabActive() {
  if (isCurrentTabActive()) {
    resetWorkbenchTitleAlert();
  }
}

function isCurrentTabActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}
