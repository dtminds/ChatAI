export function ImageDocSourcePanel({
  docName,
  imageUrl,
}: {
  docName: string;
  imageUrl: string;
}) {
  return (
    <aside
      aria-label="原文预览"
      className="flex w-[min(42%,480px)] shrink-0 flex-col overflow-hidden rounded-[8px] border border-border bg-background"
    >
      <header className="border-b border-border px-3 py-2.5">
        <p className="text-sm font-medium text-foreground">原图</p>
      </header>
      <div className="flex min-h-[420px] flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
        <img
          alt={docName}
          className="max-h-full max-w-full object-contain"
          src={imageUrl}
        />
      </div>
    </aside>
  );
}
