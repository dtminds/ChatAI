import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { KbDocChunkViewItem } from "../kb-types";

export function ImageKnowledgeChunkList({
  chunks,
  loading,
  onDelete,
}: {
  chunks: KbDocChunkViewItem[];
  loading: boolean;
  onDelete: (chunk: KbDocChunkViewItem) => void;
}) {
  if (loading) {
    return (
      <div aria-label="切片列表" role="region">
        <div
          aria-label="正在加载"
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
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
        className="py-16 text-center text-sm text-muted-foreground"
        role="region"
      >
        暂无切片数据
      </div>
    );
  }

  return (
    <div aria-label="切片列表" className="space-y-3" role="region">
      {chunks.map((chunk) => (
        <article
          className="rounded-[8px] border border-border bg-background p-4"
          key={chunk.id}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground">描述</p>
            <Button
              className="h-auto shrink-0 p-0 text-primary"
              onClick={() => onDelete(chunk)}
              type="button"
              variant="link"
            >
              删除
            </Button>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">{chunk.content}</p>
        </article>
      ))}
    </div>
  );
}
