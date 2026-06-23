import type { KbDocChunkParams, KbDocChunkStrategy, KbDocParseMode } from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

const VOLC_STRATEGY_RESOURCE_IDS = {
  standard: {
    length: {
      2000: "chat_kd_common_2000",
      1000: "chat_kd_common_1000",
      500: "chat_kd_common_500",
    },
    separator: {
      newline: "chat_kd_common_n",
    },
  },
  enhanced: {
    length: {
      2000: "chat_kd_ocr_2000",
      1000: "chat_kd_ocr_1000",
      500: "chat_kd_ocr_500",
    },
    separator: {
      newline: "chat_kd_ocr_n",
    },
  },
} as const;

export function resolveVolcStrategyResourceId(input: {
  chunkParams: KbDocChunkParams;
  chunkStrategy: KbDocChunkStrategy;
  parseMode: KbDocParseMode;
}) {
  if (input.chunkStrategy !== input.chunkParams.strategy) {
    throw new BadRequestError(
      "INVALID_KB_DOC_CHUNK_CONFIG",
      "切片配置无效",
    );
  }

  if (input.chunkParams.strategy === "length") {
    const strategyId =
      VOLC_STRATEGY_RESOURCE_IDS[input.parseMode].length[input.chunkParams.maxLength];

    if (!strategyId) {
      throw new BadRequestError(
        "INVALID_KB_DOC_CHUNK_CONFIG",
        "切片配置无效",
      );
    }

    return strategyId;
  }

  if (input.chunkParams.separator !== "newline") {
    throw new BadRequestError(
      "INVALID_KB_DOC_CHUNK_CONFIG",
      "切片配置无效",
    );
  }

  return VOLC_STRATEGY_RESOURCE_IDS[input.parseMode].separator.newline;
}
