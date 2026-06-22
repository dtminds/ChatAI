export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description: string;
  lastUpdatedAt: string;
  createdAt: string;
};

export type KnowledgeStatus = "completed" | "parsing" | "failed" | "queued";

export type KnowledgeDocType = "qa" | "image" | "document";

export type KnowledgeRecord = {
  fileExtension: string;
  id: string;
  knowledgeBaseId: string;
  name: string;
  type: KnowledgeDocType;
  typeLabel: string;
  sliceCount: number | null;
  status: KnowledgeStatus;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  knowledgeBaseId: string;
  docId: string;
  type: KnowledgeDocType;
  question?: string;
  answer?: string;
  title?: string;
  content?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export const MOCK_KNOWLEDGE_BASES: KnowledgeBaseItem[] = [
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

type KnowledgeBaseStoreListener = () => void;

const knowledgeBaseStoreListeners = new Set<KnowledgeBaseStoreListener>();
let knowledgeBaseStoreItems = [...MOCK_KNOWLEDGE_BASES];

function emitKnowledgeBaseStoreChange() {
  knowledgeBaseStoreListeners.forEach((listener) => listener());
}

export function getMockKnowledgeBasesSnapshot() {
  return knowledgeBaseStoreItems;
}

export function subscribeMockKnowledgeBases(listener: KnowledgeBaseStoreListener) {
  knowledgeBaseStoreListeners.add(listener);

  return () => {
    knowledgeBaseStoreListeners.delete(listener);
  };
}

export function addMockKnowledgeBase(item: KnowledgeBaseItem) {
  knowledgeBaseStoreItems = [item, ...knowledgeBaseStoreItems];
  emitKnowledgeBaseStoreChange();
}

export function resetMockKnowledgeBases() {
  knowledgeBaseStoreItems = [...MOCK_KNOWLEDGE_BASES];
  emitKnowledgeBaseStoreChange();
}

export function getLocalTimeString(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

export const MOCK_KNOWLEDGE_RECORDS: KnowledgeRecord[] = [
  {
    fileExtension: "doc",
    id: "knowledge-1",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "产品说明大全",
    type: "document",
    typeLabel: "文件（.doc）",
    sliceCount: 20,
    status: "completed",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    fileExtension: "png",
    id: "knowledge-2",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "图片解析大全",
    type: "image",
    typeLabel: "图片（.png）",
    sliceCount: null,
    status: "parsing",
    createdAt: "2026-06-17 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    fileExtension: "faq",
    id: "knowledge-3",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "常见问题解答",
    type: "qa",
    typeLabel: "FAQ",
    sliceCount: 45,
    status: "completed",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    fileExtension: "txt",
    id: "knowledge-4",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "文本知识集合",
    type: "document",
    typeLabel: "纯文本",
    sliceCount: null,
    status: "failed",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    fileExtension: "pdf",
    id: "knowledge-5",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "售前场景话术",
    type: "document",
    typeLabel: "文件（.pdf）",
    sliceCount: null,
    status: "queued",
    createdAt: "2026-06-15 23:22:22",
    updatedAt: "2026-06-18 23:22:22",
  },
  {
    fileExtension: "doc",
    id: "knowledge-6",
    knowledgeBaseId: "88",
    name: "售后政策说明",
    type: "document",
    typeLabel: "文件（.doc）",
    sliceCount: 18,
    status: "completed",
    createdAt: "2026-06-18 10:12:22",
    updatedAt: "2026-06-19 18:22:22",
  },
  {
    fileExtension: "faq",
    id: "knowledge-7",
    knowledgeBaseId: "89",
    name: "续费 FAQ",
    type: "qa",
    typeLabel: "FAQ",
    sliceCount: 12,
    status: "completed",
    createdAt: "2026-06-17 10:12:22",
    updatedAt: "2026-06-18 18:22:22",
  },
  {
    fileExtension: "png",
    id: "knowledge-8",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "产品宣传图",
    type: "image",
    typeLabel: "图片（.png）",
    sliceCount: 1,
    status: "completed",
    createdAt: "2026-06-18 12:00:00",
    updatedAt: "2026-06-19 12:00:00",
  },
];

export function getKnowledgeRecordById(id: string): KnowledgeRecord | undefined {
  return MOCK_KNOWLEDGE_RECORDS.find((record) => record.id === id);
}

const INITIAL_MOCK_KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  {
    id: "chunk-doc-1",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-1",
    type: "document",
    title: "第一章 产品介绍",
    content: "华为 Mate 系列主打影像与续航，适合商务与日常拍摄场景",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    id: "chunk-doc-2",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-1",
    type: "document",
    title: "第二章 售后政策",
    content: "全国联保一年，支持官方售后网点检测与维修",
    createdAt: "2026-06-18 23:22:22",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    id: "chunk-qa-1",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    question: "如何恢复出厂设置",
    answer: "进入设置-系统-重置-恢复出厂设置，操作前请备份重要数据",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-qa-2",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    question: "保修期多久",
    answer: "整机保修一年，部分配件保修政策以购买凭证为准",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-qa-3",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-3",
    type: "qa",
    question: "如何查询物流",
    answer: "可在订单详情页查看物流单号，或联系在线客服协助查询",
    createdAt: "2026-06-16 23:22:22",
    updatedAt: "2026-06-19 23:22:22",
  },
  {
    id: "chunk-image-1",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    docId: "knowledge-8",
    type: "image",
    title: "产品宣传图",
    content: "Mate 系列旗舰机型外观与核心卖点展示",
    fileUrl: "https://b5.bokr.com.cn/dist/word.png",
    createdAt: "2026-06-18 12:00:00",
    updatedAt: "2026-06-19 12:00:00",
  },
  {
    id: "chunk-doc-3",
    knowledgeBaseId: "88",
    docId: "knowledge-6",
    type: "document",
    title: "退换货流程",
    content: "7 天无理由退货需保持商品完好，15 天内质量问题可换货",
    createdAt: "2026-06-18 10:12:22",
    updatedAt: "2026-06-19 18:22:22",
  },
];

type KnowledgeChunkStoreListener = () => void;

const knowledgeChunkStoreListeners = new Set<KnowledgeChunkStoreListener>();
let knowledgeChunkStoreItems = [...INITIAL_MOCK_KNOWLEDGE_CHUNKS];

function emitKnowledgeChunkStoreChange() {
  knowledgeChunkStoreListeners.forEach((listener) => listener());
}

export function getMockKnowledgeChunksSnapshot() {
  return knowledgeChunkStoreItems;
}

export function subscribeMockKnowledgeChunks(listener: KnowledgeChunkStoreListener) {
  knowledgeChunkStoreListeners.add(listener);

  return () => {
    knowledgeChunkStoreListeners.delete(listener);
  };
}

export function addMockKnowledgeChunk(chunk: KnowledgeChunk) {
  knowledgeChunkStoreItems = [chunk, ...knowledgeChunkStoreItems];
  emitKnowledgeChunkStoreChange();
}

export function addMockKnowledgeChunks(chunks: KnowledgeChunk[]) {
  knowledgeChunkStoreItems = [...chunks, ...knowledgeChunkStoreItems];
  emitKnowledgeChunkStoreChange();
}

export function updateMockKnowledgeChunk(
  chunkId: string,
  patch: Partial<Pick<KnowledgeChunk, "question" | "answer" | "title" | "content">>,
) {
  knowledgeChunkStoreItems = knowledgeChunkStoreItems.map((chunk) => {
    if (chunk.id !== chunkId) {
      return chunk;
    }

    return {
      ...chunk,
      ...patch,
      updatedAt: getLocalTimeString(),
    };
  });
  emitKnowledgeChunkStoreChange();
}

export function deleteMockKnowledgeChunk(chunkId: string) {
  knowledgeChunkStoreItems = knowledgeChunkStoreItems.filter((chunk) => chunk.id !== chunkId);
  emitKnowledgeChunkStoreChange();
}

export function resetMockKnowledgeChunks() {
  knowledgeChunkStoreItems = [...INITIAL_MOCK_KNOWLEDGE_CHUNKS];
  emitKnowledgeChunkStoreChange();
}

export function resetMockKnowledgeData() {
  resetMockKnowledgeBases();
  resetMockKnowledgeChunks();
}
