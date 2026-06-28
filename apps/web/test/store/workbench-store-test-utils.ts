import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { createWorkbenchStore, useWorkbenchStore } from "@/store/workbench-store";

export function resetWorkbenchStoreTestState() {
  resetWorkbenchService();
  useWorkbenchStore.getState().resetWorkbenchRuntime();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  useWorkbenchStore.getState().setChatSendPermission(true);
}

export function createFreshWorkbenchStoreForTest() {
  return createWorkbenchStore();
}
