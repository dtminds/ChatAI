import type { KbDocChunkParams, KbDocChunkStrategy, KbDocParseMode } from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

const VOLC_STRATEGY_RESOURCE_IDS = {
  standard: {
    length: {
      2000: "kb-strategy-233abb0cd67b8429",
      1000: "kb-strategy-bb86846bd8964b93",
      500: "kb-strategy-309dc4df244db26d",
    },
    separator: {
      newline: "kb-strategy-c0593b44acfbc5e8",
    },
  },
  enhanced: {
    length: {
      2000: "kb-strategy-e1e2a815d50c4692",
      1000: "kb-strategy-d4a3777d577b8e32",
      500: "kb-strategy-51899c0babcd5d25",
    },
    separator: {
      newline: "kb-strategy-76c06c05cf06ac2c",
    },
  },
} as const;

/** FAQ / 图片创建使用的系统策略（key: chat_knowledge_init_version-auto） */
export const KB_INIT_VOLC_STRATEGY_RESOURCE_ID = "kb-strategy-def92e30c1456c07";

export function resolveKbInitVolcStrategyResourceId() {
  return KB_INIT_VOLC_STRATEGY_RESOURCE_ID;
}

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
