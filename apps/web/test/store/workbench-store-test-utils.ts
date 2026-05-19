import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";

export function resetWorkbenchStoreTestState() {
  resetWorkbenchService();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
}
