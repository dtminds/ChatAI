import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { KbDocChunkViewItem } from "../kb-types";
import { IMAGE_CHUNK_COLUMN, IMAGE_CHUNK_COLUMN_PADDING } from "./image-chunk-layout";

export function ImageKnowledgeChunkList({
  chunks,
  className,
  loading,
  matchedHeight,
}: {
  chunks: KbDocChunkViewItem[];
  className?: string;
  loading: boolean;
  matchedHeight?: number;
}) {
  const panelStyle = matchedHeight ? { height: matchedHeight } : undefined;
  const panelClassName = cn(
    "flex min-h-0 flex-col overflow-hidden",
    IMAGE_CHUNK_COLUMN,
    IMAGE_CHUNK_COLUMN_PADDING,
    className,
  );

  if (loading) {
    return (
      <div
        aria-label="切片列表"
        className={cn(panelClassName, "items-center justify-center")}
        role="region"
        style={panelStyle}
      >
        <div
          aria-label="正在加载"
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Spinner aria-hidden="true" size={14} />
          <span>正在加载</span>
        </div>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div
        aria-label="切片列表"
        className={cn(panelClassName, "items-center justify-center text-sm text-muted-foreground")}
        role="region"
        style={panelStyle}
      >
        暂无切片数据
      </div>
    );
  }

  return (
    <div aria-label="切片列表" className={panelClassName} role="region" style={panelStyle}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {chunks.map((chunk) => (
          <article key={chunk.id}>
            {chunk.title ? (
              <p className="text-sm font-semibold leading-6 text-foreground">{chunk.title}</p>
            ) : null}
            <p
              className={cn(
                "text-sm leading-6 whitespace-pre-wrap text-foreground",
                chunk.title ? "mt-3" : undefined,
              )}
            >
              {chunk.content}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
