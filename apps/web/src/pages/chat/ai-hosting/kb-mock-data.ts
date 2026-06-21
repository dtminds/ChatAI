export type KnowledgeBaseItem = {
  id: string;
  name: string;
  description: string;
  lastUpdatedAt: string;
  createdAt: string;
};

export type KnowledgeStatus = "completed" | "parsing" | "failed" | "queued";

export type KnowledgeRecord = {
  fileExtension: string;
  id: string;
  knowledgeBaseId: string;
  name: string;
  typeLabel: string;
  sliceCount: number | null;
  status: KnowledgeStatus;
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

export const MOCK_KNOWLEDGE_RECORDS: KnowledgeRecord[] = [
  {
    fileExtension: "doc",
    id: "knowledge-1",
    knowledgeBaseId: "W7zU2fWkVSp65OTAjDd3-w",
    name: "产品说明大全",
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
    typeLabel: "FAQ",
    sliceCount: 12,
    status: "completed",
    createdAt: "2026-06-17 10:12:22",
    updatedAt: "2026-06-18 18:22:22",
  },
];
