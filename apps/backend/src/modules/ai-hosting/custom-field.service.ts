import type {
  CustomFieldItem,
  CustomFieldListResponse,
  CustomFieldType,
} from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createCustomFieldJavaClient,
  type CustomFieldJavaClient,
  type CustomFieldJavaItem,
} from "./custom-field-java-client.js";

const customFieldTypes = new Set<CustomFieldType>([1, 2, 3, 4, 5, 6, 7, 8]);

export class CustomFieldService {
  constructor(private readonly javaClient: CustomFieldJavaClient) {}

  async listFields(
    uid: number,
    options: { status?: 0 | 1 } = {},
  ): Promise<CustomFieldListResponse> {
    const result = await this.javaClient.selectList({
      status: options.status,
      uid,
    });

    return {
      fields: result.items
        .map(mapCustomFieldItem)
        .filter((item): item is CustomFieldItem => item != null)
        .sort((left, right) => left.sort - right.sort || left.id - right.id),
    };
  }
}

export function createCustomFieldService(
  logger: AppLogger | RequestAwareLogger,
) {
  return new CustomFieldService(createCustomFieldJavaClient(logger));
}

function mapCustomFieldItem(item: CustomFieldJavaItem): CustomFieldItem | null {
  const id = normalizePositiveInteger(item.fieldId);
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const type = normalizeCustomFieldType(item.type);

  if (id == null || !title || type == null) {
    return null;
  }

  const key =
    typeof item.key === "string" && item.key.trim().length > 0
      ? item.key.trim()
      : String(id);

  return {
    id,
    key,
    options: Array.isArray(item.optionInfoList)
      ? item.optionInfoList
          .map((option) => {
            const optionMatch =
              typeof option.optionMatch === "string" ? option.optionMatch : "";
            const optionValue = normalizeInteger(option.optionValue);

            if (!optionMatch || optionValue == null) {
              return null;
            }

            return { optionMatch, optionValue };
          })
          .filter((option): option is NonNullable<typeof option> => option != null)
      : [],
    sort: normalizeInteger(item.sort) ?? 0,
    title,
    type,
  };
}

function normalizeCustomFieldType(value: unknown): CustomFieldType | null {
  const numeric = normalizeInteger(value);
  if (numeric == null || !customFieldTypes.has(numeric as CustomFieldType)) {
    return null;
  }

  return numeric as CustomFieldType;
}

function normalizePositiveInteger(value: unknown) {
  const numeric = normalizeInteger(value);
  return numeric != null && numeric > 0 ? numeric : null;
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
