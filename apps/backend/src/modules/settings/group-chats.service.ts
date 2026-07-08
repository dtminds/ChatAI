import type {
  SettingsGroupChat,
  SettingsGroupChatsQuery,
  SettingsGroupChatsResponse,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";

type TenantScope = AuthenticatedWorkbenchScope;

type GroupChatRow = {
  avatar: string | null;
  group_seat_id: number;
  group_name: string | null;
  group_remark: string | null;
  seat_avatar: string | null;
  seat_id: number;
  seat_name: string | null;
  third_group_id: string;
};

type ManagedAccountFilterRow = {
  id: number;
  name: string | null;
};

const dbActiveStatus = 1;
const groupChatListLimit = 500;

export class GroupChatSettingsService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    scope: TenantScope,
    query: SettingsGroupChatsQuery = {},
  ): Promise<SettingsGroupChatsResponse> {
    const [filterManagedAccounts, receptionSeatCountByGroupId, groupChatRows] = await Promise.all([
      this.listFilterManagedAccounts(scope),
      this.countReceptionSeatsByGroupId(scope),
      this.listGroupChatRows(scope, query),
    ]);

    return {
      filterManagedAccounts: filterManagedAccounts.map((account) => ({
        id: String(account.id),
        name: account.name || "未命名托管账号",
      })),
      groupChats: groupChatRows.map((row) =>
        mapGroupChat(row, receptionSeatCountByGroupId.get(row.third_group_id) ?? 0),
      ),
    };
  }

  private listFilterManagedAccounts(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_user_seat as seat")
      .select(["seat.id", "seat.third_user_name as name"])
      .where("seat.uid", "=", scope.uid)
      .where("seat.platform", "=", scope.platform)
      .orderBy("seat.id", "desc")
      .execute() as Promise<ManagedAccountFilterRow[]>;
  }

  private async countReceptionSeatsByGroupId(scope: TenantScope) {
    const rows = await this.db
      .selectFrom("xy_wap_embed_group_seat")
      .select([
        "third_group_id",
        sql<number>`count(distinct third_userid)`.as("reception_seat_count"),
      ])
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .groupBy("third_group_id")
      .execute();

    return new Map(
      rows.map((row) => [row.third_group_id, Number(row.reception_seat_count)]),
    );
  }

  private listGroupChatRows(scope: TenantScope, query: SettingsGroupChatsQuery) {
    let groupQuery = this.db
      .selectFrom("xy_wap_embed_group_seat as group_seat")
      .innerJoin("xy_wap_embed_user_seat as seat", (join) =>
        join
          .onRef("seat.third_userid", "=", "group_seat.third_userid")
          .onRef("seat.uid", "=", "group_seat.uid")
          .onRef("seat.platform", "=", "group_seat.platform"),
      )
      .select([
        "group_seat.avatar as avatar",
        "group_seat.id as group_seat_id",
        "group_seat.name as group_name",
        "group_seat.remark as group_remark",
        "group_seat.third_group_id as third_group_id",
        "seat.id as seat_id",
        "seat.third_avatar as seat_avatar",
        "seat.third_user_name as seat_name",
      ])
      .where("group_seat.uid", "=", scope.uid)
      .where("group_seat.platform", "=", scope.platform)
      .where("group_seat.biz_status", "=", dbActiveStatus)
      .orderBy("group_seat.id", "desc")
      .limit(groupChatListLimit);

    const managedAccountId = parseMySqlId(query.managedAccountId);

    if (managedAccountId != null) {
      groupQuery = groupQuery.where("seat.id", "=", managedAccountId);
    }

    const keyword = query.keyword?.trim();

    if (keyword) {
      const pattern = `%${escapeLikeKeyword(keyword)}%`;

      groupQuery = groupQuery.where((expressionBuilder) =>
        expressionBuilder.or([
          expressionBuilder("group_seat.name", "like", pattern),
          expressionBuilder("group_seat.remark", "like", pattern),
          expressionBuilder("group_seat.third_group_id", "like", pattern),
        ]),
      );
    }

    return groupQuery.execute() as Promise<GroupChatRow[]>;
  }
}

export function createGroupChatSettingsService(db: Kysely<Database>) {
  return new GroupChatSettingsService(db);
}

function mapGroupChat(row: GroupChatRow, receptionSeatCount: number): SettingsGroupChat {
  return {
    avatarUrl: row.avatar || "",
    id: String(row.group_seat_id),
    name: firstNonEmptyString(row.group_remark, row.group_name) ?? "未知群聊",
    openingManagedAccount: {
      avatarUrl: row.seat_avatar || "",
      id: String(row.seat_id),
      name: row.seat_name || "未命名托管账号",
    },
    receptionSeatCount,
    thirdGroupId: row.third_group_id,
  };
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function escapeLikeKeyword(keyword: string) {
  return keyword.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseMySqlId(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  const numericValue = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
}
