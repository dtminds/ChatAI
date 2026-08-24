import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
  type WorkflowAudienceGroupListResponse,
} from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createCdpGroupJavaClient,
  type CdpGroupJavaClient,
} from "./cdp-group-java-client.js";

export class AudienceGroupService {
  constructor(private readonly javaClient: CdpGroupJavaClient) {}

  async listGroups(
    uid: number,
    options: {
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<WorkflowAudienceGroupListResponse> {
    const page = Math.max(1, normalizePositiveInteger(options.page, 1));
    const pageSize = Math.min(
      WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
      Math.max(1, normalizePositiveInteger(options.pageSize, WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE)),
    );
    return this.javaClient.listGroups({ page, pageSize, uid });
  }
}

export function createAudienceGroupService(logger: AppLogger | RequestAwareLogger) {
  return new AudienceGroupService(createCdpGroupJavaClient(logger));
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : fallback;
}
