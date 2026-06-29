import type {
  KbChunkListItem,
  KbDocDetail,
  KbDocListItem,
  KbListItem,
} from "@chatai/contracts";
import type { KbDocChunkViewItem, KbDocViewItem, KbListViewItem } from "@/pages/chat/ai-hosting/kb-types";

const MOCK_KB_LIST: KbListViewItem[] = [
  {
    id: "W7zU2fWkVSp65OTAjDd3-w",
    name: "华为产品知识",
    description: "华为各系列产品规格、功能与常见问题",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "88",
    name: "售后问题解答",
    description: "退换货、维修、保修流程与话术",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "89",
    name: "续费话术指引",
    description: "不同场景下的续费引导话术与案例",
    lastUpdatedAt: "2025-06-19 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
];

const INITIAL_MOCK_KB_DOCS: KbDocViewItem[] = [
  {
    docUrl: "kb-docs/knowledge-1.doc",
    fileExtension: "doc",
    id: "knowledge-1",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "产品说明大全",
    type: "document",
    typeLabel: "文件（.doc）",
    sliceCount: 20,
    status: "completed",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    docUrl: "kb-images/knowledge-2.png",
    fileExtension: "png",
    id: "knowledge-2",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "图片解析大全",
    type: "image",
    typeLabel: "图片（.png）",
    sliceCount: null,
    status: "parsing",
    createdAt: "2026-06-17 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    docUrl: "kb-faq/knowledge-3.faq",
    fileExtension: "faq",
    id: "knowledge-3",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "常见问题解答",
    type: "qa",
    typeLabel: "FAQ",
    sliceCount: 45,
    status: "completed",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    docUrl: "kb-docs/knowledge-4.txt",
    fileExtension: "txt",
    id: "knowledge-4",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "文本知识集合",
    type: "document",
    typeLabel: "纯文本",
    sliceCount: null,
    status: "failed",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    docUrl: "kb-docs/knowledge-5.pdf",
    fileExtension: "pdf",
    id: "knowledge-5",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "售前场景话术",
    type: "document",
    typeLabel: "文件（.pdf）",
    sliceCount: null,
    status: "queued",
    createdAt: "2026-06-15 23:22:22",
    updatedAt: "2026-06-18 23:22:22",
  },
  {
    docUrl: "kb-docs/knowledge-6.doc",
    fileExtension: "doc",
    id: "knowledge-6",
    kbId: "88",
    name: "售后政策说明",
    type: "document",
    typeLabel: "文件（.doc）",
    sliceCount: 18,
    status: "completed",
    createdAt: "2026-06-18 10:12:22",
    updatedAt: "2026-06-19 18:22:22",
  },
  {
    docUrl: "kb-faq/knowledge-7.faq",
    fileExtension: "faq",
    id: "knowledge-7",
    kbId: "89",
    name: "续费 FAQ",
    type: "qa",
    typeLabel: "FAQ",
    sliceCount: 12,
    status: "completed",
    createdAt: "2026-06-17 10:12:22",
    updatedAt: "2026-06-18 18:22:22",
  },
  {
    docUrl: "kb-images/knowledge-8.png",
    fileExtension: "png",
    id: "knowledge-8",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "产品宣传图",
    type: "image",
    typeLabel: "图片（.png）",
    sliceCount: 1,
    status: "completed",
    createdAt: "2026-06-18 12:00:00",
    updatedAt: "2026-06-19 12:00:00",
  },
];

const INITIAL_MOCK_KB_CHUNKS: KbDocChunkViewItem[] = [
  {
    id: "chunk-doc-1",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-1",
    type: "document",
    source: "manual",
    title: "第一章 产品介绍",
    content: "华为 Mate 系列主打影像与续航，适合商务与日常拍摄场景",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    id: "chunk-doc-2",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-1",
    type: "document",
    source: "manual",
    title: "第二章 售后政策",
    content: "全国联保一年，支持官方售后网点检测与维修",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    id: "chunk-doc-image-1",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-1",
    type: "document",
    source: "system",
    title: "产品外观图",
    content: "对该图片的解析文字，展示产品外观与配色信息",
    imageUrls: ["https://b5.bokr.com.cn/dist/word.png"],
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    id: "chunk-qa-1",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    source: "manual",
    question: "如何恢复出厂设置",
    answer: "进入设置-系统-重置-恢复出厂设置，操作前请备份重要数据",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-qa-2",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    source: "manual",
    question: "保修期多久",
    answer: "整机保修一年，部分配件保修政策以购买凭证为准",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-qa-3",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    source: "manual",
    question: "如何查询物流",
    answer: "可在订单详情页查看物流单号，或联系在线客服协助查询",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-image-1",
    kbId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-8",
    type: "image",
    source: "system",
    title: "产品宣传图",
    content: "Mate 系列旗舰机型外观与核心卖点展示",
    imageUrls: ["https://b5.bokr.com.cn/dist/word.png"],
    createdAt: "2026-06-18 12:00:00",
    updatedAt: "2026-06-19 12:00:00",
  },
  {
    id: "chunk-doc-3",
    kbId: "88",
    docId: "knowledge-6",
    type: "document",
    source: "manual",
    title: "退换货流程",
    content: "7 天无理由退货需保持商品完好，15 天内质量问题可换货",
    createdAt: "2026-06-18 10:12:22",
    updatedAt: "2026-06-19 18:22:22",
  },
];

let mockKbListItems = [...MOCK_KB_LIST];
let mockKbDocItems = [...INITIAL_MOCK_KB_DOCS];
let mockKbChunkItems = [...INITIAL_MOCK_KB_CHUNKS];

function toIsoTimestamp(value: string) {
  if (value.includes("T")) {
    return value;
  }

  return new Date(`${value.replace(" ", "T")}+08:00`).toISOString();
}

function toKbListItem(item: KbListViewItem): KbListItem {
  return {
    createdAt: toIsoTimestamp(item.createdAt),
    description: item.description,
    kbId: item.id,
    name: item.name,
    updatedAt: toIsoTimestamp(item.lastUpdatedAt),
  };
}

function toKbDocListItem(record: KbDocViewItem): KbDocListItem {
  return {
    createdAt: toIsoTimestamp(record.createdAt),
    docId: record.id,
    docSuffix: record.fileExtension,
    docType: record.type,
    docUrl: record.docUrl,
    kbId: record.kbId,
    name: record.name,
    sliceCount: record.sliceCount,
    status: record.status,
    updatedAt: toIsoTimestamp(record.updatedAt),
  };
}

function toKbChunkListItem(chunk: KbDocChunkViewItem): KbChunkListItem {
  const chunkType = chunk.imageUrls?.length
    ? "image"
    : chunk.type === "qa"
      ? "faq"
      : chunk.type === "image"
        ? "image"
        : "text";

  return {
    chunkId: chunk.id,
    chunkType,
    content: chunk.answer ?? chunk.content ?? "",
    createdAt: toIsoTimestamp(chunk.createdAt),
    description: chunk.type === "image" ? chunk.content : undefined,
    docId: chunk.docId,
    imageUrls: chunk.imageUrls,
    kbId: chunk.kbId,
    source: chunk.source,
    title: chunk.question ?? chunk.title,
    updatedAt: toIsoTimestamp(chunk.updatedAt),
  };
}

export function resetMockKbData() {
  mockKbListItems = [...MOCK_KB_LIST];
  mockKbDocItems = [...INITIAL_MOCK_KB_DOCS];
  mockKbChunkItems = [...INITIAL_MOCK_KB_CHUNKS];
}

export function addMockKbListItem(input: Pick<KbListViewItem, "name" | "description">) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const item: KbListViewItem = {
    createdAt: now,
    description: input.description,
    id: `kb-created-${Date.now()}`,
    lastUpdatedAt: now,
    name: input.name,
  };

  mockKbListItems = [item, ...mockKbListItems];

  return item;
}

export function getMockKbChunksSnapshot() {
  return mockKbChunkItems;
}

export function addMockKbChunk(chunk: KbDocChunkViewItem) {
  mockKbChunkItems = [chunk, ...mockKbChunkItems];
}

export function updateMockKbDocStatus(
  docId: string,
  status: KbDocViewItem["status"],
) {
  mockKbDocItems = mockKbDocItems.map((doc) =>
    doc.id === docId ? { ...doc, status } : doc,
  );
}

export function updateMockKbChunk(
  chunkId: string,
  patch: Partial<Pick<KbDocChunkViewItem, "question" | "answer" | "title" | "content">>,
) {
  mockKbChunkItems = mockKbChunkItems.map((chunk) => {
    if (chunk.id !== chunkId) {
      return chunk;
    }

    return {
      ...chunk,
      ...patch,
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };
  });
}

export function deleteMockKbChunk(chunkId: string) {
  mockKbChunkItems = mockKbChunkItems.filter((chunk) => chunk.id !== chunkId);
}

export function createMockKbListResponse(query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  const kbs = mockKbListItems.filter((item) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery)
    );
  });

  return {
    kbs: kbs.map(toKbListItem),
    pagination: {
      page: 1,
      pageSize: 10,
      total: kbs.length,
    },
  };
}

export function createMockKbItem(kbId: string) {
  const kb =
    mockKbListItems.find((item) => item.id === kbId) ??
    MOCK_KB_LIST.find((item) => item.id === kbId);

  if (!kb) {
    throw new Error("KB_NOT_FOUND");
  }

  return toKbListItem(kb);
}

export function createMockKbDocsResponse(kbId: string, query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  const docs = mockKbDocItems.filter((record) => {
    if (record.kbId !== kbId) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      record.name.toLowerCase().includes(normalizedQuery) ||
      record.typeLabel.toLowerCase().includes(normalizedQuery)
    );
  });

  return {
    docs: docs.map(toKbDocListItem),
    pagination: {
      page: 1,
      pageSize: 10,
      total: docs.length,
    },
  };
}

export function createMockKbDocDetail(docId: string): KbDocDetail {
  const record =
    mockKbDocItems.find((item) => item.id === docId) ??
    INITIAL_MOCK_KB_DOCS.find((item) => item.id === docId);

  if (!record) {
    throw new Error("KB_DOC_NOT_FOUND");
  }

  return {
    ...toKbDocListItem(record),
    volcDocId: `volc-${record.id}`,
  };
}

export function createMockKbDocChunksResponse(docId: string, title?: string) {
  const normalizedTitle = title?.trim().toLowerCase();
  const chunks = mockKbChunkItems.filter((chunk) => {
    if (chunk.docId !== docId) {
      return false;
    }

    if (!normalizedTitle) {
      return true;
    }

    const chunkTitle = chunk.question ?? chunk.title ?? "";

    return chunkTitle.toLowerCase().includes(normalizedTitle);
  });

  return {
    chunks: chunks.map(toKbChunkListItem),
    pagination: {
      page: 1,
      pageSize: 10,
      total: chunks.length,
    },
  };
}
