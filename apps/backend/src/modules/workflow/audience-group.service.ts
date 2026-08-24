import type { WorkflowAudienceGroupListResponse } from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createCdpGroupJavaClient,
  type CdpGroupJavaClient,
} from "./cdp-group-java-client.js";

export class AudienceGroupService {
  constructor(private readonly javaClient: CdpGroupJavaClient) {}

  async listGroups(uid: number): Promise<WorkflowAudienceGroupListResponse> {
    return this.javaClient.listGroups({ uid });
  }
}

export function createAudienceGroupService(logger: AppLogger | RequestAwareLogger) {
  return new AudienceGroupService(createCdpGroupJavaClient(logger));
}
