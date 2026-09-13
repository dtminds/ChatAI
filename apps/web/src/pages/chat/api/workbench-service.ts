import { createHttpWorkbenchService } from "./workbench-http-service";
import { createMockWorkbenchService } from "./workbench-mock-service";
import type { WorkbenchService } from "./workbench-service-types";

export type {
  WorkbenchConversationListOptions,
  WorkbenchService,
  WorkbenchServiceMode,
} from "./workbench-service-types";
export { createHttpWorkbenchService } from "./workbench-http-service";
export { createMockWorkbenchService } from "./workbench-mock-service";

let activeWorkbenchService: WorkbenchService = createWorkbenchService();

export function getWorkbenchService() {
  return activeWorkbenchService;
}

export function setWorkbenchService(service: WorkbenchService) {
  activeWorkbenchService = service;
}

export function resetWorkbenchService() {
  activeWorkbenchService = createMockWorkbenchService();
}

export function createWorkbenchService(): WorkbenchService {
  return createHttpWorkbenchService();
}
