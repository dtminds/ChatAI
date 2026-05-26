import type { WorkbenchSmartReplyTextModerationResponse } from "@chatai/contracts";

type JavaTextModerationCustomizedHit = {
  keyWords?: string;
  libName?: string;
};

type JavaTextModerationRiskItem = {
  customizedHit?: JavaTextModerationCustomizedHit | JavaTextModerationCustomizedHit[];
  description?: string;
  label?: string;
  riskWords?: string;
};

export function mapJavaTextModerationPlus(
  data: unknown,
): WorkbenchSmartReplyTextModerationResponse {
  const payload = unwrapModerationPayload(data);
  const riskItems = extractRiskItems(payload);

  if (riskItems.length === 0) {
    return { result: null };
  }

  const categoryLabel = collectRiskItemCategoryLabel(riskItems);
  const words = collectRiskItemWords(riskItems);

  if (!categoryLabel || words.length === 0) {
    return { result: null };
  }

  return {
    result: {
      categoryLabel,
      words,
    },
  };
}

function unwrapModerationPayload(data: unknown) {
  if (isRecord(data) && isRecord(data.data)) {
    return data.data;
  }

  return isRecord(data) ? data : {};
}

function extractRiskItems(payload: Record<string, unknown>) {
  const riskItems = payload.riskItems;

  if (!Array.isArray(riskItems)) {
    return [];
  }

  return riskItems.filter(isRecord) as JavaTextModerationRiskItem[];
}

function collectRiskItemCategoryLabel(riskItems: JavaTextModerationRiskItem[]) {
  const descriptions = riskItems
    .map((item) => readString(item.description))
    .filter((description): description is string => Boolean(description));

  return descriptions.length > 0 ? descriptions.join(",") : undefined;
}

function collectRiskItemWords(riskItems: JavaTextModerationRiskItem[]) {
  const joinedWords = riskItems
    .map((item) => {
      if (item.label === "customized") {
        return extractCustomizedHitWords(item.customizedHit).join(",");
      }

      return readString(item.riskWords) ?? "";
    })
    .filter(Boolean)
    .join(",");

  if (!joinedWords) {
    return [];
  }

  return Array.from(
    new Set(
      joinedWords
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  );
}

function extractCustomizedHitWords(
  customizedHit: JavaTextModerationRiskItem["customizedHit"],
) {
  if (!customizedHit) {
    return [];
  }

  const hits = Array.isArray(customizedHit) ? customizedHit : [customizedHit];

  return hits
    .map((item) => readString(item.keyWords))
    .filter((keyWords): keyWords is string => Boolean(keyWords));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
