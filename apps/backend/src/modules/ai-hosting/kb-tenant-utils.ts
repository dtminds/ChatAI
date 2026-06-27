import { NotFoundError } from "../../shared/errors.js";

export type AgentKbTenant = {
  subUserId: string;
  uid: number;
};

export function getAgentKbTenant(request: { user: AgentKbTenant }): AgentKbTenant {
  return {
    subUserId: request.user.subUserId,
    uid: request.user.uid,
  };
}

export function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseRequiredNumericId(value: string, code: string, message: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new NotFoundError(code, message);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new NotFoundError(code, message);
  }

  return parsed;
}
