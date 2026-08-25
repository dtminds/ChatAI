import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
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
      name?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<WorkflowAudienceGroupListResponse> {
    const page = Math.max(1, normalizePositiveInteger(options.page, 1));
    const pageSize = Math.min(
      WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE_MAX,
      Math.max(1, normalizePositiveInteger(options.pageSize, WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE)),
    );
    const name = typeof options.name === "string"
      ? options.name.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH)
      : "";
    return this.javaClient.listGroups({
      page,
      pageSize,
      uid,
      ...(name ? { name } : {}),
    });
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
