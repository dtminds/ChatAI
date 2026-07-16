import type {
  AiHostingGroupChatReplyMode,
  AiHostingGroupSettingsUpdateRequest,
  AiHostingSettingsAccount,
  AiHostingSettingsGroupChat,
  AiHostingSettingsResponse,
  AiHostingSettingsUpdateRequest,
} from "@chatai/contracts";
import type { Insertable, Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, ForbiddenError } from "../../shared/errors.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import {
  type AgentRow,
  AiHostingAgentService,
  isPublishedAgent,
} from "./ai-hosting-agent.service.js";
import { normalizeIdList, parseMySqlId } from "./ai-hosting-id-utils.js";

type SettingsScope = AuthenticatedWorkbenchScope;

type HostingSettingsSeatRow = {
  avatarUrl: string | null;
  id: number;
  third_user_name: string | null;
};

type UserSeatAgentRow = {
  agent_id: number;
  full_auto_auth: number | null;
  semi_auto_auth: number | null;
  user_seat_id: number;
};

type UserSeatGroupAgentRow = {
  agent_id: number;
  full_auto_auth: number | null;
  full_auto_config: string | null;
  semi_auto_auth: number | null;
  user_seat_id: number;
};

type UserSeatAgentInsert = Insertable<Database["xy_wap_embed_user_seat_agent"]>;
type UserSeatGroupAgentInsert = Insertable<Database["xy_wap_embed_user_seat_group_agent"]>;

const hostingSettingsSeatLimit = 200;
const fullAutoAuthUnavailableMessage = "该功能内测中，如需开通请联系客服";
const defaultGroupChatReplyMode: AiHostingGroupChatReplyMode = 1;

export class AiHostingSettingsService {
  private readonly agentService: AiHostingAgentService;

  constructor(private readonly db: Kysely<Database>) {
    this.agentService = new AiHostingAgentService(db);
  }

  async listHostingSettings(scope: SettingsScope): Promise<AiHostingSettingsResponse> {
    const [seats, agents] = await Promise.all([
      this.listHostingSettingSeats(scope),
      this.agentService.listAllAgentRows(scope.uid),
    ]);
    const seatIds = seats.map((seat) => seat.id);
    const [singleChatConfigs, groupChatConfigs] = await Promise.all([
      this.listUserSeatAgentRows(scope, seatIds),
      this.listUserSeatGroupAgentRows(scope, seatIds),
    ]);
    const singleChatConfigsBySeatId = new Map(
      singleChatConfigs.map((config) => [config.user_seat_id, config]),
    );
    const groupChatConfigsBySeatId = new Map(
      groupChatConfigs.map((config) => [config.user_seat_id, config]),
    );

    return {
      accounts: seats.map((seat) =>
        mapHostingSettingsAccount(
          seat,
          singleChatConfigsBySeatId.get(seat.id),
          groupChatConfigsBySeatId.get(seat.id),
        ),
      ),
      agents: agents.map(mapHostingSettingsAgent),
      fullAutoAuthAvailable: isFullAutoAuthAvailable(scope.uid),
    };
  }

  async updateHostingSettings(
    scope: SettingsScope,
    payload: AiHostingSettingsUpdateRequest,
  ): Promise<AiHostingSettingsResponse> {
    const agentId = parseMySqlId(payload.agentId);
    const userSeatIds = normalizeIdList(payload.userSeatIds);

    if (agentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (userSeatIds == null || userSeatIds.length === 0) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }

    await this.agentService.assertPublishedAgentInTenant(scope.uid, agentId);
    await this.assertUserSeatsInScope(scope, userSeatIds);

    const currentConfigs = await this.listUserSeatAgentRows(scope, userSeatIds);
    assertFullAutoAuthUpdateAllowed(scope.uid, payload, userSeatIds, currentConfigs);
    const values = {
      agent_id: agentId,
      full_auto_auth: payload.fullAutoAuth ? 1 : 0,
      semi_auto_auth: payload.semiAutoAuth ? 1 : 0,
    };
    const rows: UserSeatAgentInsert[] = userSeatIds.map((userSeatId) => ({
      ...values,
      uid: scope.uid,
      user_seat_id: userSeatId,
    }));

    await this.db
      .insertInto("xy_wap_embed_user_seat_agent")
      .values(rows)
      .onDuplicateKeyUpdate({
        ...values,
        update_time: new Date(),
      })
      .execute();

    return this.listHostingSettings(scope);
  }

  async updateGroupHostingSettings(
    scope: SettingsScope,
    payload: AiHostingGroupSettingsUpdateRequest,
  ): Promise<AiHostingSettingsResponse> {
    const agentId = parseMySqlId(payload.agentId);
    const userSeatIds = normalizeIdList(payload.userSeatIds);

    if (agentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (userSeatIds == null || userSeatIds.length === 0) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }

    await this.agentService.assertPublishedAgentInTenant(scope.uid, agentId);
    await this.assertUserSeatsInScope(scope, userSeatIds);

    const currentConfigs = await this.listUserSeatGroupAgentRows(scope, userSeatIds);
    assertGroupFullAutoAuthUpdateAllowed(scope.uid, payload, userSeatIds, currentConfigs);
    const values = {
      agent_id: agentId,
      full_auto_auth: payload.fullAutoAuth ? 1 : 0,
      full_auto_config: serializeGroupFullAutoConfig(payload.replyMode),
      semi_auto_auth: payload.semiAutoAuth ? 1 : 0,
    };
    const rows: UserSeatGroupAgentInsert[] = userSeatIds.map((userSeatId) => ({
      ...values,
      uid: scope.uid,
      user_seat_id: userSeatId,
    }));

    await this.db
      .insertInto("xy_wap_embed_user_seat_group_agent")
      .values(rows)
      .onDuplicateKeyUpdate({
        ...values,
        update_time: new Date(),
      })
      .execute();

    return this.listHostingSettings(scope);
  }

  private listHostingSettingSeats(scope: SettingsScope, seatIds?: number[]) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select([
        "seat.third_avatar as avatarUrl",
        "seat.id",
        "seat.third_user_name",
      ])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform);

    if (seatIds !== undefined) {
      query = query.where("seat.id", "in", seatIds);
    }

    query = query.orderBy("seat.id", "desc");

    if (seatIds === undefined) {
      query = query.limit(hostingSettingsSeatLimit);
    }

    return query.execute() as Promise<HostingSettingsSeatRow[]>;
  }

  private listUserSeatAgentRows(scope: SettingsScope, seatIds: number[]) {
    if (seatIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.db
      .selectFrom("xy_wap_embed_user_seat_agent")
      .select(["agent_id", "full_auto_auth", "semi_auto_auth", "user_seat_id"])
      .where("uid", "=", scope.uid)
      .where("user_seat_id", "in", seatIds)
      .execute() as Promise<UserSeatAgentRow[]>;
  }

  private listUserSeatGroupAgentRows(scope: SettingsScope, seatIds: number[]) {
    if (seatIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.db
      .selectFrom("xy_wap_embed_user_seat_group_agent")
      .select([
        "agent_id",
        "full_auto_auth",
        "full_auto_config",
        "semi_auto_auth",
        "user_seat_id",
      ])
      .where("uid", "=", scope.uid)
      .where("user_seat_id", "in", seatIds)
      .execute() as Promise<UserSeatGroupAgentRow[]>;
  }

  private async assertUserSeatsInScope(scope: SettingsScope, userSeatIds: number[]) {
    const seats = await this.listHostingSettingSeats(scope, userSeatIds);
    const validSeatIds = new Set(seats.map((seat) => seat.id));

    if (userSeatIds.some((userSeatId) => !validSeatIds.has(userSeatId))) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }
  }
}

export function createAiHostingSettingsService(db: Kysely<Database>) {
  return new AiHostingSettingsService(db);
}

function mapHostingSettingsAccount(
  seat: HostingSettingsSeatRow,
  singleChatConfig: UserSeatAgentRow | undefined,
  groupChatConfig: UserSeatGroupAgentRow | undefined,
): AiHostingSettingsAccount {
  return {
    agentId:
      singleChatConfig && singleChatConfig.agent_id > 0
        ? String(singleChatConfig.agent_id)
        : null,
    avatarUrl: seat.avatarUrl || "",
    fullAutoAuth: singleChatConfig?.full_auto_auth === 1,
    groupChat: mapHostingSettingsGroupChat(groupChatConfig),
    id: String(seat.id),
    name: seat.third_user_name || "未命名托管账号",
    semiAutoAuth: singleChatConfig?.semi_auto_auth === 1,
  };
}

function mapHostingSettingsGroupChat(
  config: UserSeatGroupAgentRow | undefined,
): AiHostingSettingsGroupChat {
  const replyMode = parseGroupFullAutoConfig(config?.full_auto_config).replyMode;

  return {
    agentId: config && config.agent_id > 0 ? String(config.agent_id) : null,
    fullAutoAuth: config?.full_auto_auth === 1,
    replyMode: config?.full_auto_auth === 1 ? replyMode : null,
    semiAutoAuth: config?.semi_auto_auth === 1,
  };
}

function mapHostingSettingsAgent(agent: AgentRow) {
  return {
    id: String(agent.id),
    isPublished: isPublishedAgent(agent),
    name: agent.name,
  };
}

function assertFullAutoAuthUpdateAllowed(
  uid: number,
  payload: AiHostingSettingsUpdateRequest,
  userSeatIds: number[],
  currentConfigs: UserSeatAgentRow[],
) {
  if (!payload.fullAutoAuth || isFullAutoAuthAvailable(uid)) {
    return;
  }

  const enabledSeatIds = new Set(
    currentConfigs
      .filter((config) => config.full_auto_auth === 1)
      .map((config) => config.user_seat_id),
  );

  if (userSeatIds.some((userSeatId) => !enabledSeatIds.has(userSeatId))) {
    throw new ForbiddenError(
      "AI_HOSTING_FULL_AUTO_NOT_AVAILABLE",
      fullAutoAuthUnavailableMessage,
    );
  }
}

function assertGroupFullAutoAuthUpdateAllowed(
  uid: number,
  payload: AiHostingGroupSettingsUpdateRequest,
  userSeatIds: number[],
  currentConfigs: UserSeatGroupAgentRow[],
) {
  if (!payload.fullAutoAuth || isFullAutoAuthAvailable(uid)) {
    return;
  }

  const enabledSeatIds = new Set(
    currentConfigs
      .filter((config) => config.full_auto_auth === 1)
      .map((config) => config.user_seat_id),
  );

  if (userSeatIds.some((userSeatId) => !enabledSeatIds.has(userSeatId))) {
    throw new ForbiddenError(
      "AI_HOSTING_FULL_AUTO_NOT_AVAILABLE",
      fullAutoAuthUnavailableMessage,
    );
  }
}

function parseGroupFullAutoConfig(raw: string | null | undefined): {
  replyMode: AiHostingGroupChatReplyMode;
} {
  if (!raw?.trim()) {
    return { replyMode: defaultGroupChatReplyMode };
  }

  try {
    const parsed = JSON.parse(raw) as { replyMode?: unknown; replyRule?: unknown };

    if (parsed.replyMode === 1 || parsed.replyMode === 2) {
      return { replyMode: parsed.replyMode };
    }

    if (parsed.replyRule === "quote") {
      return { replyMode: 1 };
    }

    if (parsed.replyRule === "at_customer") {
      return { replyMode: 2 };
    }
  } catch {
    return { replyMode: defaultGroupChatReplyMode };
  }

  return { replyMode: defaultGroupChatReplyMode };
}

function serializeGroupFullAutoConfig(replyMode: AiHostingGroupChatReplyMode) {
  return JSON.stringify({ replyMode });
}

function isFullAutoAuthAvailable(uid: number) {
  return getFullAutoAuthAllowlist().has(uid);
}

function getFullAutoAuthAllowlist() {
  return new Set(process.env.NODE_ENV === "production" ? [101, 975, 3865] : [272]);
}
