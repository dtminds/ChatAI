export type ComposerTextSegment = {
  type: "text";
  text: string;
  mentionAll?: boolean;
  mentionMemberIds?: string[];
};

export type ComposerImageSegment = {
  type: "image";
  alt: string;
  clientId?: string;
  fileId?: string;
  height?: number;
  localUrl?: string;
  url?: string;
  width?: number;
};

export type ComposerFileSegment = {
  type: "file";
  extension: string;
  fileId?: string;
  fileName: string;
  fileSize?: number;
  fileSizeLabel?: string;
  url?: string;
};

export type ComposerH5Segment = {
  type: "h5";
  coverUrl?: string;
  desc?: string;
  href: string;
  title: string;
};

export type ComposerMiniProgramSegment = {
  type: "weapp";
  materialCollectionId: string;
  appName?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  sourceLabel?: string;
  title?: string;
};

export type ComposerSphfeedSegment = {
  type: "sphfeed";
  materialCollectionId: string;
  description?: string;
  imageUrl?: string;
  sourceLabel?: string;
  title?: string;
  url?: string;
};

export type ComposerSegment =
  | ComposerTextSegment
  | ComposerImageSegment
  | ComposerFileSegment
  | ComposerH5Segment
  | ComposerMiniProgramSegment
  | ComposerSphfeedSegment;

export function normalizeComposerSegments(
  segments: ComposerSegment[],
): ComposerSegment[] {
  const normalizedSegments: ComposerSegment[] = [];
  let textBuffer = "";
  let mentionAllBuffer = false;
  let mentionMemberIdsBuffer: string[] = [];

  const flushTextBuffer = () => {
    const normalizedText = textBuffer.trim();

    if (normalizedText) {
      normalizedSegments.push({
        ...(mentionAllBuffer ? { mentionAll: true } : {}),
        ...(mentionMemberIdsBuffer.length > 0
          ? { mentionMemberIds: Array.from(new Set(mentionMemberIdsBuffer)) }
          : {}),
        text: normalizedText,
        type: "text",
      });
    }

    textBuffer = "";
    mentionAllBuffer = false;
    mentionMemberIdsBuffer = [];
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      textBuffer += segment.text;
      mentionAllBuffer = mentionAllBuffer || Boolean(segment.mentionAll);
      mentionMemberIdsBuffer.push(...(segment.mentionMemberIds ?? []));
      continue;
    }

    flushTextBuffer();
    normalizedSegments.push(segment);
  }

  flushTextBuffer();

  return normalizedSegments;
}

export function getComposerSegmentsPreview(segments: ComposerSegment[]) {
  const normalizedSegments = normalizeComposerSegments(segments);
  const firstTextSegment = normalizedSegments.find(
    (segment): segment is ComposerTextSegment => segment.type === "text",
  );

  if (firstTextSegment) {
    return firstTextSegment.text;
  }

  if (normalizedSegments.some((segment) => segment.type === "image")) {
    return "[图片]";
  }

  if (normalizedSegments.some((segment) => segment.type === "h5")) {
    return "[链接]";
  }

  if (normalizedSegments.some((segment) => segment.type === "weapp")) {
    return "[小程序]";
  }

  if (normalizedSegments.some((segment) => segment.type === "sphfeed")) {
    return "[视频号]";
  }

  return normalizedSegments.some((segment) => segment.type === "file")
    ? "[文件]"
    : "";
}

export function extractComposerMentionState(segments: ComposerSegment[]) {
  const normalizedSegments = normalizeComposerSegments(segments);
  const memberIds = new Set<string>();
  let mentionAll = false;

  for (const segment of normalizedSegments) {
    if (segment.type !== "text") {
      continue;
    }

    for (const memberId of segment.mentionMemberIds ?? []) {
      if (memberId) {
        memberIds.add(memberId);
      }
    }

    mentionAll = mentionAll || Boolean(segment.mentionAll);
  }

  return {
    memberIds: Array.from(memberIds),
    mentionAll,
  };
}
