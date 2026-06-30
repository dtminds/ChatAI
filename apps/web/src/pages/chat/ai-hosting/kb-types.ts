export type KbStatus = "completed" | "parsing" | "failed" | "queued";

export type KbDocType = "qa" | "image" | "document";

export type KbListViewItem = {
  createdAt: string;
  description: string;
  id: string;
  lastUpdatedAt: string;
  name: string;
};

export type KbDocViewItem = {
  createdAt: string;
  docUrl: string;
  fileExtension: string;
  id: string;
  kbId: string;
  name: string;
  sliceCount: number | null;
  status: KbStatus;
  type: KbDocType;
  typeLabel: string;
  updatedAt: string;
};

export type KbDocChunkViewItem = {
  answer?: string;
  content?: string;
  createdAt: string;
  docId: string;
  displayChunkId?: string;
  displayChunkIndex?: string;
  id: string;
  imageUrls?: string[];
  kbId: string;
  question?: string;
  source: "manual" | "sidebar" | "system";
  title?: string;
  type: KbDocType;
  updatedAt: string;
  volcChunkId?: string;
};
