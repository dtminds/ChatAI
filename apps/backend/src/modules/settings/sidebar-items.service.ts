import type {
  SettingsSidebarItem,
  SettingsSidebarItemCreateRequest,
  SettingsSidebarItemsResponse,
  SettingsSidebarItemsSortUpdateRequest,
  SettingsSidebarItemStatus,
  SettingsSidebarItemUpdateRequest,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

type TenantScope = {
  platform: number;
  uid: number;
};

type SidebarItemRow = {
  id: number;
  name: string;
  show: number | null;
  sort: number;
  url: string;
};

const dbActiveStatus = 1;
const dbDeletedStatus = 0;
const dbShown = 1;
const dbHidden = 0;

export class SidebarItemsSettingsService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(currentSubUserId: string): Promise<SettingsSidebarItemsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);

    return {
      items: (await this.listRows(scope)).map(mapSidebarItem),
    };
  }

  async create(
    currentSubUserId: string,
    payload: SettingsSidebarItemCreateRequest,
  ): Promise<SettingsSidebarItem> {
    const scope = await this.getTenantScope(currentSubUserId);
    const normalized = normalizeSidebarPayload(payload);
    const sort = payload.sort ?? (await this.getNextSort(scope));

    const inserted = await this.db
      .insertInto("xy_wap_embed_sider_bar_config")
      .values({
        biz_status: dbActiveStatus,
        name: normalized.name,
        platform: scope.platform,
        show: dbShown,
        sort,
        uid: scope.uid,
        url: normalized.url,
      })
      .executeTakeFirstOrThrow();
    const sidebarItemId = Number(
      "insertId" in inserted ? inserted.insertId : (inserted as { id?: number }).id,
    );

    return this.getItemOrThrow(scope, sidebarItemId);
  }

  async update(
    currentSubUserId: string,
    sidebarItemId: string,
    payload: SettingsSidebarItemUpdateRequest,
  ): Promise<SettingsSidebarItem> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericSidebarItemId = parseMySqlId(sidebarItemId);
    const normalized = normalizeSidebarPayload(payload);

    if (numericSidebarItemId == null) {
      throw new BadRequestError("INVALID_SIDEBAR_ITEM", "侧边栏页面不存在");
    }

    await this.assertItemInScope(scope, numericSidebarItemId);
    await this.db
      .updateTable("xy_wap_embed_sider_bar_config")
      .set({
        name: normalized.name,
        update_time: new Date(),
        url: normalized.url,
      })
      .where("id", "=", numericSidebarItemId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .execute();

    return this.getItemOrThrow(scope, numericSidebarItemId);
  }

  async updateStatus(
    currentSubUserId: string,
    sidebarItemId: string,
    status: SettingsSidebarItemStatus,
  ): Promise<SettingsSidebarItem> {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericSidebarItemId = parseMySqlId(sidebarItemId);

    if (numericSidebarItemId == null) {
      throw new BadRequestError("INVALID_SIDEBAR_ITEM", "侧边栏页面不存在");
    }

    await this.assertItemInScope(scope, numericSidebarItemId);
    await this.db
      .updateTable("xy_wap_embed_sider_bar_config")
      .set({
        show: status === "active" ? dbShown : dbHidden,
        update_time: new Date(),
      })
      .where("id", "=", numericSidebarItemId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .execute();

    return this.getItemOrThrow(scope, numericSidebarItemId);
  }

  async updateSort(
    currentSubUserId: string,
    payload: SettingsSidebarItemsSortUpdateRequest,
  ): Promise<SettingsSidebarItemsResponse> {
    const scope = await this.getTenantScope(currentSubUserId);
    const itemIds = normalizeSidebarItemIds(payload.itemIds);

    if (itemIds.length !== payload.itemIds.length || itemIds.length === 0) {
      throw new BadRequestError("INVALID_SIDEBAR_SORT", "侧边栏排序无效");
    }

    const existingRows = await this.listRows(scope);
    const existingIds = new Set(existingRows.map((item) => item.id));

    if (itemIds.length !== existingIds.size || itemIds.some((itemId) => !existingIds.has(itemId))) {
      throw new BadRequestError("INVALID_SIDEBAR_SORT", "侧边栏排序无效");
    }

    const now = new Date();

    await this.db.transaction().execute(async (trx) => {
      await Promise.all(
        itemIds.map((itemId, index) =>
          trx
            .updateTable("xy_wap_embed_sider_bar_config")
            .set({
              sort: index + 1,
              update_time: now,
            })
            .where("id", "=", itemId)
            .where("uid", "=", scope.uid)
            .where("platform", "=", scope.platform)
            .where("biz_status", "=", dbActiveStatus)
            .execute(),
        ),
      );
    });

    return this.list(currentSubUserId);
  }

  async remove(currentSubUserId: string, sidebarItemId: string) {
    const scope = await this.getTenantScope(currentSubUserId);
    const numericSidebarItemId = parseMySqlId(sidebarItemId);

    if (numericSidebarItemId == null) {
      throw new BadRequestError("INVALID_SIDEBAR_ITEM", "侧边栏页面不存在");
    }

    await this.assertItemInScope(scope, numericSidebarItemId);
    await this.db
      .updateTable("xy_wap_embed_sider_bar_config")
      .set({
        biz_status: dbDeletedStatus,
        update_time: new Date(),
      })
      .where("id", "=", numericSidebarItemId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .execute();

    return { deleted: true };
  }

  private async getTenantScope(currentSubUserId: string): Promise<TenantScope> {
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

  private listRows(scope: TenantScope) {
    return this.db
      .selectFrom("xy_wap_embed_sider_bar_config")
      .select(["id", "name", "show", "sort", "url"])
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .orderBy("sort", "asc")
      .orderBy("id", "asc")
      .execute() as Promise<SidebarItemRow[]>;
  }

  private async getNextSort(scope: TenantScope) {
    const rows = await this.listRows(scope);
    const maxSort = rows.reduce((current, item) => Math.max(current, item.sort), 0);

    return maxSort + 1;
  }

  private async assertItemInScope(scope: TenantScope, sidebarItemId: number) {
    const sidebarItem = await this.db
      .selectFrom("xy_wap_embed_sider_bar_config")
      .select("id")
      .where("id", "=", sidebarItemId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!sidebarItem) {
      throw new NotFoundError("SIDEBAR_ITEM_NOT_FOUND", "侧边栏页面不存在");
    }
  }

  private async getItemOrThrow(scope: TenantScope, sidebarItemId: number) {
    const sidebarItem = await this.db
      .selectFrom("xy_wap_embed_sider_bar_config")
      .select(["id", "name", "show", "sort", "url"])
      .where("id", "=", sidebarItemId)
      .where("uid", "=", scope.uid)
      .where("platform", "=", scope.platform)
      .where("biz_status", "=", dbActiveStatus)
      .executeTakeFirst() as SidebarItemRow | undefined;

    if (!sidebarItem) {
      throw new NotFoundError("SIDEBAR_ITEM_NOT_FOUND", "侧边栏页面不存在");
    }

    return mapSidebarItem(sidebarItem);
  }
}

export function createSidebarItemsSettingsService(db: Kysely<Database> | undefined) {
  if (!db) {
    throw new ServiceUnavailableError("DATABASE_NOT_CONFIGURED", "设置服务暂不可用");
  }

  return new SidebarItemsSettingsService(db);
}

function mapSidebarItem(row: SidebarItemRow): SettingsSidebarItem {
  return {
    id: String(row.id),
    name: row.name,
    sort: row.sort,
    status: row.show === dbHidden ? "disabled" : "active",
    url: row.url,
  };
}

function normalizeSidebarPayload(payload: {
  name: string;
  url: string;
}) {
  const name = payload.name.trim();
  const url = payload.url.trim();

  if (!name || !url) {
    throw new BadRequestError("INVALID_SIDEBAR_ITEM", "请完整填写侧边栏页面信息");
  }

  return { name, url };
}

function normalizeSidebarItemIds(rawItemIds: string[]) {
  const itemIds = Array.from(new Set(rawItemIds.map(parseMySqlId))).filter(
    (itemId): itemId is number => itemId != null,
  );

  return itemIds.length === rawItemIds.length ? itemIds : [];
}

function parseMySqlId(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && String(parsed) === value ? parsed : undefined;
}
