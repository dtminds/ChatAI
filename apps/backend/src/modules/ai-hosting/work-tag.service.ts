import type {
  WorkTagAttr,
  WorkTagComponentType,
  WorkTagGroupItem,
  WorkTagGroupListResponse,
  WorkTagItem,
  WorkTagListResponse,
} from "@chatai/contracts";
import {
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import {
  createWorkTagJavaClient,
  type WorkTagJavaClient,
  type WorkTagJavaComponentItem,
  type WorkTagJavaGroupItem,
} from "./work-tag-java-client.js";

const workTagAttrs = new Set<WorkTagAttr>([1, 2]);
const workTagComponentTypes = new Set<WorkTagComponentType>([0, 1, 10, 11, 12]);

const defaultPage = 1;
const defaultPageSize = 100;
const maxPageSize = 200;

export class WorkTagService {
  constructor(
    private readonly javaClient: WorkTagJavaClient,
    private readonly logger: AppLogger | RequestAwareLogger = noopLogger,
  ) {}

  async listGroups(
    uid: number,
    options: {
      attr?: WorkTagAttr;
      type?: WorkTagComponentType;
    } = {},
  ): Promise<WorkTagGroupListResponse> {
    // 企微标签组：attr 默认 1（普通），type 默认 0（外部联系人）
    const result = await this.javaClient.listGroups({
      attr: options.attr ?? 1,
      type: options.type ?? 0,
      uid,
    });

    return {
      groups: result.groups
        .map(mapGroupItem)
        .filter((item): item is WorkTagGroupItem => item != null)
        .sort((left, right) => left.id - right.id),
      ...(result.tagLimit != null && result.tagLimit > 0
        ? { tagLimit: result.tagLimit }
        : {}),
    };
  }

  async listTags(
    uid: number,
    options: {
      attr?: WorkTagAttr;
      groupId?: number;
      keyword?: string;
      page?: number;
      pageSize?: number;
      type?: WorkTagComponentType;
    } = {},
  ): Promise<WorkTagListResponse> {
    const page = normalizePositiveInteger(options.page, defaultPage);
    const pageSize = Math.min(
      normalizePositiveInteger(options.pageSize, defaultPageSize),
      maxPageSize,
    );

    const result = await this.javaClient.listTags({
      attr: options.attr,
      groupId: options.groupId,
      keyWord: options.keyword,
      page,
      pageSize,
      type: options.type,
      uid,
    });

    const tags = result.items
      .map((item) => mapTagItem(item, options.type, options.groupId))
      .filter((item): item is WorkTagItem => item != null)
      .sort(
        (left, right) =>
          right.groupSort - left.groupSort || left.groupId - right.groupId || left.id - right.id,
      );

    if (result.items.length > 0 && tags.length === 0) {
      const sample = result.items[0];
      this.logger.warn(
        {
          groupId: options.groupId,
          itemCount: result.items.length,
          sampleKeys:
            sample && typeof sample === "object" ? Object.keys(sample) : [],
          sample,
          type: options.type,
          uid,
        },
        "work-tags 上游有列表项但字段映射后为空",
      );
    }

    return {
      pagination: {
        hasNext: result.hasNext,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
      tags,
    };
  }
}

export function createWorkTagService(logger: AppLogger | RequestAwareLogger) {
  return new WorkTagService(createWorkTagJavaClient(logger), logger);
}

function mapGroupItem(item: WorkTagJavaGroupItem): WorkTagGroupItem | null {
  const id = normalizePositiveInteger(item.id, 0);
  const name = typeof item.group_name === "string" ? item.group_name.trim() : "";
  const attr = normalizeAttr(item.attr);

  if (id <= 0 || !name || attr == null) {
    return null;
  }

  return {
    attr,
    id,
    name,
    tagCount: Math.max(0, normalizeInteger(item.num) ?? 0),
  };
}

function mapTagItem(
  item: WorkTagJavaComponentItem,
  fallbackType?: WorkTagComponentType,
  fallbackGroupId?: number,
): WorkTagItem | null {
  const id = normalizePositiveInteger(item.id, 0);
  const name = firstNonEmptyString(
    item.name,
    item.tagName,
    item.tag_name,
    item.label,
  );
  const groupName = firstNonEmptyString(item.groupName, item.group_name);
  // 小店标签（type=12）常见只返回 id/name/groupName，缺 groupId：用分组名生成稳定 id
  const groupId =
    normalizePositiveInteger(item.groupId ?? item.group_id, 0) ||
    (fallbackGroupId != null && fallbackGroupId > 0 ? fallbackGroupId : 0) ||
    (groupName ? stablePositiveIdFromString(groupName) : 0);
  const resolvedGroupName = groupName || (groupId > 0 ? `分组${groupId}` : "");
  const groupAttr =
    normalizeAttr(item.groupAttr ?? item.group_attr ?? item.attr) ?? 1;
  const type = normalizeComponentType(item.type) ?? fallbackType ?? null;

  if (id <= 0 || groupId <= 0 || !name || !resolvedGroupName || type == null) {
    return null;
  }

  return {
    groupAttr,
    groupId,
    groupName: resolvedGroupName,
    groupSort: normalizeInteger(item.groupSort ?? item.group_sort) ?? 0,
    id,
    name,
    type,
  };
}

/** 由分组名生成稳定正整数，供缺 groupId 的上游对齐前端分组 */
function stablePositiveIdFromString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash === 0 ? 1 : hash;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeAttr(value: unknown): WorkTagAttr | null {
  const numeric = normalizeInteger(value);
  if (numeric == null || !workTagAttrs.has(numeric as WorkTagAttr)) {
    return null;
  }

  return numeric as WorkTagAttr;
}

function normalizeComponentType(value: unknown): WorkTagComponentType | null {
  const numeric = normalizeInteger(value);
  if (numeric == null || !workTagComponentTypes.has(numeric as WorkTagComponentType)) {
    return null;
  }

  return numeric as WorkTagComponentType;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numeric = normalizeInteger(value);
  return numeric != null && numeric > 0 ? numeric : fallback;
}

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}
