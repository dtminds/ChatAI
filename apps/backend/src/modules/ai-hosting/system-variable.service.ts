import type {
  SystemVariableItem,
  SystemVariableListResponse,
} from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createSystemVariableJavaClient,
  type SystemVariableJavaClient,
  type SystemVariableJavaItem,
} from "./system-variable-java-client.js";

export class SystemVariableService {
  constructor(private readonly javaClient: SystemVariableJavaClient) {}

  async listAvailable(uid: number): Promise<SystemVariableListResponse> {
    const result = await this.javaClient.listAvailable({ uid });

    return {
      variables: result.items
        .map(mapSystemVariableItem)
        .filter((item): item is SystemVariableItem => item != null),
    };
  }
}

export function createSystemVariableService(
  logger: AppLogger | RequestAwareLogger,
) {
  return new SystemVariableService(createSystemVariableJavaClient(logger));
}

function mapSystemVariableItem(
  item: SystemVariableJavaItem,
): SystemVariableItem | null {
  const key = typeof item.key === "string" ? item.key.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";

  if (!key || !name) {
    return null;
  }

  return { key, name };
}
