import type { AccountPermission, AuthSubUser } from "@chatai/contracts";
import { create } from "zustand";

type AuthStatus = "anonymous" | "authenticated" | "checking";

type AuthState = {
  checkedPath: string | null;
  errorMessage?: string;
  status: AuthStatus;
  subUser?: AuthSubUser;
  clearSession: (checkedPath?: string | null) => void;
  hasPermission: (permission: AccountPermission) => boolean;
  setChecking: () => void;
  setSession: (subUser: AuthSubUser) => void;
};

function createInitialState() {
  return {
    checkedPath: null,
    errorMessage: undefined,
    status: "anonymous" as const,
    subUser: undefined,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...createInitialState(),
  clearSession(checkedPath = null) {
    set({
      checkedPath,
      errorMessage: undefined,
      status: "anonymous",
      subUser: undefined,
    });
  },
  hasPermission(permission) {
    return get().subUser?.permissions.includes(permission) ?? false;
  },
  setChecking() {
    set({
      checkedPath: null,
      errorMessage: undefined,
      status: "checking",
    });
  },
  setSession(subUser) {
    set({
      checkedPath: null,
      errorMessage: undefined,
      status: "authenticated",
      subUser,
    });
  },
}));
