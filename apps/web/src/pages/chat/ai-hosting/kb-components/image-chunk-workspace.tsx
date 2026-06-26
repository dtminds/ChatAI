import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveKbDocImageUrl } from "../api/kb-service";
import type { KbDocChunkViewItem, KbDocViewItem } from "../kb-types";
import { IMAGE_CHUNK_WORKSPACE_SHELL } from "./image-chunk-layout";
import { ImageDocSourcePanel } from "./image-doc-source-panel";
import { ImageKnowledgeChunkList } from "./image-chunk-list";

export function ImageKnowledgeChunkWorkspace({
  chunks,
  doc,
  loading,
}: {
  chunks: KbDocChunkViewItem[];
  doc: KbDocViewItem;
  loading: boolean;
}) {
  const docImageUrl = resolveKbDocImageUrl(doc.docUrl);
  const leftPanelRef = useRef<HTMLElement>(null);
  const [matchedHeight, setMatchedHeight] = useState<number>();

  useEffect(() => {
    const node = leftPanelRef.current;

    if (!node) {
      setMatchedHeight(undefined);
      return;
    }

    const updateHeight = () => {
      setMatchedHeight(node.getBoundingClientRect().height);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
    };
  }, [doc.name, docImageUrl, loading]);

  return (
    <div className={cn(IMAGE_CHUNK_WORKSPACE_SHELL)}>
      <div className="flex items-start">
        {docImageUrl ? (
          <>
            <ImageDocSourcePanel docName={doc.name} imageUrl={docImageUrl} ref={leftPanelRef} />
            <div
              aria-hidden
              className="w-px shrink-0 bg-border"
              style={matchedHeight ? { height: matchedHeight } : undefined}
            />
          </>
        ) : null}
        <ImageKnowledgeChunkList
          chunks={chunks}
          loading={loading}
          matchedHeight={docImageUrl ? matchedHeight : undefined}
        />
      </div>
    </div>
  );
}
