import { resolveKbDocImageUrl } from "../api/kb-service";
import type { KbDocChunkViewItem, KbDocViewItem } from "../kb-types";
import { ImageDocSourcePanel } from "./image-doc-source-panel";
import { ImageKnowledgeChunkList } from "./image-chunk-list";

export function ImageKnowledgeChunkWorkspace({
  chunks,
  doc,
  loading,
  onDelete,
}: {
  chunks: KbDocChunkViewItem[];
  doc: KbDocViewItem;
  loading: boolean;
  onDelete: (chunk: KbDocChunkViewItem) => void;
}) {
  const docImageUrl = resolveKbDocImageUrl(doc.docUrl);

  return (
    <div className="flex min-h-[560px] gap-4">
      {docImageUrl ? (
        <ImageDocSourcePanel docName={doc.name} imageUrl={docImageUrl} />
      ) : null}

      <div className="min-w-0 flex-1 rounded-[8px] bg-muted/30 p-4">
        <ImageKnowledgeChunkList chunks={chunks} loading={loading} onDelete={onDelete} />
      </div>
    </div>
  );
}
