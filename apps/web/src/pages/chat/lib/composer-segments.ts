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

export type ComposerSegment =
  | ComposerTextSegment
  | ComposerImageSegment
  | ComposerFileSegment;

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
          ? { mentionMemberIds: mentionMemberIdsBuffer }
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

  return normalizedSegments.some((segment) => segment.type === "file")
    ? "[文件]"
    : "";
}

export function extractComposerMentionState(segments: ComposerSegment[]) {
  const normalizedSegments = normalizeComposerSegments(segments);
  const memberIds: string[] = [];
  let mentionAll = false;

  for (const segment of normalizedSegments) {
    if (segment.type !== "text") {
      continue;
    }

    for (const memberId of segment.mentionMemberIds ?? []) {
      if (memberId) {
        memberIds.push(memberId);
      }
    }

    mentionAll = mentionAll || Boolean(segment.mentionAll);
  }

  return {
    memberIds,
    mentionAll,
  };
}
