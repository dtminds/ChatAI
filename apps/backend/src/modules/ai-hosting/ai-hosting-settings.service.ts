import type {
  AiHostingSettingsAccount,
  AiHostingSettingsResponse,
  AiHostingSettingsSyncSeatGroupsRequest,
  AiHostingSettingsSyncSeatGroupsResponse,
  AiHostingSettingsUpdateRequest,
} from "@chatai/contracts";
import type { Insertable, Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import {
  type AgentRow,
  AiHostingAgentService,
  isPublishedAgent,
} from "./ai-hosting-agent.service.js";
import { normalizeIdList, parseMySqlId } from "./ai-hosting-id-utils.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";

type SettingsScope = {
  platform: number;
  uid: number;
};

type HostingSettingsSeatRow = {
  avatarUrl: string | null;
  id: number;
  third_user_name: string | null;
  third_userid: string;
};

type UserSeatAgentRow = {
  agent_id: number;
  full_auto_auth: number | null;
  semi_auto_auth: number | null;
  user_seat_id: number;
};

type UserSeatAgentInsert = Insertable<Database["xy_wap_embed_user_seat_agent"]>;

const dbActiveStatus = 1;
const hostingSettingsSeatLimit = 200;

export class AiHostingSettingsService {
  private readonly agentService: AiHostingAgentService;

  constructor(private readonly db: Kysely<Database>) {
    this.agentService = new AiHostingAgentService(db);
  }

  async listHostingSettings(currentSubUserId: string): Promise<AiHostingSettingsResponse> {
    const scope = await this.getSettingsScope(currentSubUserId);
    const [seats, agents] = await Promise.all([
      this.listHostingSettingSeats(scope),
      this.agentService.listAllAgentRows(scope.uid),
    ]);
    const seatIds = seats.map((seat) => seat.id);
    const [configs, groupChatCountByThirdUserId] = await Promise.all([
      this.listUserSeatAgentRows(scope, seatIds),
      this.countGroupChatsByThirdUserIds(
        scope,
        seats.map((seat) => seat.third_userid),
      ),
    ]);
    const configsBySeatId = new Map(configs.map((config) => [config.user_seat_id, config]));

    return {
      accounts: seats.map((seat) =>
        mapHostingSettingsAccount(
          seat,
          configsBySeatId.get(seat.id),
          groupChatCountByThirdUserId.get(seat.third_userid) ?? 0,
        ),
      ),
      agents: agents.map(mapHostingSettingsAgent),
    };
  }

  async syncSeatGroups(
    currentSubUserId: string,
    userSeatId: string,
    payload: AiHostingSettingsSyncSeatGroupsRequest,
    javaClient: WorkbenchJavaClient,
  ): Promise<AiHostingSettingsSyncSeatGroupsResponse> {
    const scope = await this.getSettingsScope(currentSubUserId);
    const seatId = parseMySqlId(userSeatId);

    if (seatId == null) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }

    await this.assertUserSeatsInScope(scope, [seatId]);

    await javaClient.syncSeatGroups({
      platform: scope.platform,
      seatId,
      syncMembers: payload.syncMembers,
      uid: scope.uid,
    });

    return { synced: true };
  }

  async updateHostingSettings(
    currentSubUserId: string,
    payload: AiHostingSettingsUpdateRequest,
  ): Promise<AiHostingSettingsResponse> {
    const scope = await this.getSettingsScope(currentSubUserId);
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
    const existingSeatIds = new Set(currentConfigs.map((config) => config.user_seat_id));
    const insertRows: UserSeatAgentInsert[] = [];
    const updateSeatIds: number[] = [];
    const values = {
      agent_id: agentId,
      full_auto_auth: payload.fullAutoAuth ? 1 : 0,
      semi_auto_auth: payload.semiAutoAuth ? 1 : 0,
    };

    for (const userSeatId of userSeatIds) {
      if (existingSeatIds.has(userSeatId)) {
        updateSeatIds.push(userSeatId);
        continue;
      }

      insertRows.push({
        ...values,
        uid: scope.uid,
        user_seat_id: userSeatId,
      });
    }

    if (insertRows.length > 0) {
      await this.db
        .insertInto("xy_wap_embed_user_seat_agent")
        .values(insertRows)
        .executeTakeFirstOrThrow();
    }

    if (updateSeatIds.length > 0) {
      await this.db
        .updateTable("xy_wap_embed_user_seat_agent")
        .set({
          ...values,
          update_time: new Date(),
        })
        .where("uid", "=", scope.uid)
        .where("user_seat_id", "in", updateSeatIds)
        .execute();
    }

    return this.listHostingSettings(currentSubUserId);
  }

  private async getSettingsScope(currentSubUserId: string): Promise<SettingsScope> {
    const numericSubUserId = parseMySqlId(currentSubUserId);

    if (numericSubUserId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    const currentSubUser = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["platform", "uid"])
      .where("id", "=", numericSubUserId)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!currentSubUser) {
      throw new NotFoundError("SUB_ACCOUNT_NOT_FOUND", "当前账号不存在");
    }

    return {
      platform: currentSubUser.platform,
      uid: currentSubUser.uid,
    };
  }

  private listHostingSettingSeats(scope: SettingsScope, seatIds?: number[]) {
    let query = this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select([
        "seat.third_avatar as avatarUrl",
        "seat.id",
        "seat.third_user_name",
        "seat.third_userid",
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

  private async assertUserSeatsInScope(scope: SettingsScope, userSeatIds: number[]) {
    const seats = await this.listHostingSettingSeats(scope, userSeatIds);
    const validSeatIds = new Set(seats.map((seat) => seat.id));

    if (userSeatIds.some((userSeatId) => !validSeatIds.has(userSeatId))) {
      throw new BadRequestError("INVALID_USER_SEAT", "企微账号不存在");
    }
  }

  private async countGroupChatsByThirdUserIds(scope: SettingsScope, thirdUserIds: string[]) {
    const uniqueThirdUserIds = [...new Set(thirdUserIds.filter((id) => id.length > 0))];

    if (uniqueThirdUserIds.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.db
      .selectFrom("xy_wap_embed_group_seat")
      .select("third_userid")
      .select((expressionBuilder) => expressionBuilder.fn.count<number>("id").as("group_count"))
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .where("third_userid", "in", uniqueThirdUserIds)
      .groupBy("third_userid")
      .execute();

    return new Map(
      rows.map((row) => [row.third_userid, Number(row.group_count)]),
    );
  }
}

export function createAiHostingSettingsService(db: Kysely<Database>) {
  return new AiHostingSettingsService(db);
}

function mapHostingSettingsAccount(
  seat: HostingSettingsSeatRow,
  config: UserSeatAgentRow | undefined,
  groupChatCount: number,
): AiHostingSettingsAccount {
  return {
    agentId: config && config.agent_id > 0 ? String(config.agent_id) : null,
    avatarUrl: seat.avatarUrl || "",
    fullAutoAuth: config?.full_auto_auth === 1,
    groupChatCount,
    id: String(seat.id),
    name: seat.third_user_name || "未命名托管账号",
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
