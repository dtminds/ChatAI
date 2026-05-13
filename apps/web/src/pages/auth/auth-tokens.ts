export const AUTH_SESSION_CHANGED_EVENT = "chatai:auth-session-changed";

export function notifyAuthSessionChanged() {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function subscribeAuthSessionChanged(listener: () => void) {
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, listener);
  };
}
