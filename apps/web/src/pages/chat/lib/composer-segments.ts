export type ComposerTextSegment = {
  type: "text";
  text: string;
};

export type ComposerImageSegment = {
  type: "image";
  alt: string;
  fileId?: string;
  height?: number;
  localUrl?: string;
  url?: string;
  width?: number;
};

export type ComposerSegment = ComposerTextSegment | ComposerImageSegment;

export function normalizeComposerSegments(
  segments: ComposerSegment[],
): ComposerSegment[] {
  const normalizedSegments: ComposerSegment[] = [];
  let textBuffer = "";

  const flushTextBuffer = () => {
    const normalizedText = textBuffer.trim();

    if (normalizedText) {
      normalizedSegments.push({
        text: normalizedText,
        type: "text",
      });
    }

    textBuffer = "";
  };

  for (const segment of segments) {
    if (segment.type === "text") {
      textBuffer += segment.text;
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

  return normalizedSegments.some((segment) => segment.type === "image")
    ? "[图片]"
    : "";
}
