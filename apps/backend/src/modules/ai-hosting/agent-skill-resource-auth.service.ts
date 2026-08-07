import type { AgentSkillResourceAuthResponse } from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import { BadGatewayError } from "../../shared/errors.js";
import {
  CHAT_AI_XINGYUN_RESOURCE_AUTHORIZATION_CONFIG_KEY,
  createUserLimitConfigJavaClient,
  USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
  USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
  type UserLimitConfigJavaClient,
} from "./user-limit-config-java-client.js";

export class AgentSkillResourceAuthService {
  constructor(private readonly javaClient: UserLimitConfigJavaClient) {}

  async getResourceAuth(uid: number): Promise<AgentSkillResourceAuthResponse> {
    const value = await this.javaClient.getByConfigKey({
      configKey: CHAT_AI_XINGYUN_RESOURCE_AUTHORIZATION_CONFIG_KEY,
      uid,
    });

    return {
      authorized: value === 1,
    };
  }

  async authorizeResource(uid: number): Promise<AgentSkillResourceAuthResponse> {
    const ok = await this.javaClient.setByConfigKey({
      configKey: CHAT_AI_XINGYUN_RESOURCE_AUTHORIZATION_CONFIG_KEY,
      uid,
      value: 1,
    });

    if (!ok) {
      throw new BadGatewayError(
        USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
        USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
        { operation: "user-limit-config-set-by-config-key" },
      );
    }

    return { authorized: true };
  }
}

export function createAgentSkillResourceAuthService(
  logger: AppLogger | RequestAwareLogger,
) {
  return new AgentSkillResourceAuthService(createUserLimitConfigJavaClient(logger));
}
