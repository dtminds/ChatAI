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
  briefSummary?: string;
  createdAt: string;
  docSummary?: string;
  fileSize: string;
  fileExtension: string;
  hasDocSummary: boolean;
  id: string;
  kbId: string;
  name: string;
  nameWithExtension: string;
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
