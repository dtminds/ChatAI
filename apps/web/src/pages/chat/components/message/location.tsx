import { MapPinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { LocationMessageContent } from "@/pages/chat/chat-types";

type LocationMessageCardProps = {
  content: LocationMessageContent;
};

export function LocationMessageCard({ content }: LocationMessageCardProps) {
  const mapUrl = buildAmapMarkerUrl(content);
  const card = <LocationCardBody content={content} />;

  if (!mapUrl) {
    return (
      <div className="w-[min(19rem,calc(100vw-7rem))] overflow-hidden rounded-[8px] border border-border bg-surface">
        {card}
      </div>
    );
  }

  return (
    <a
      className="block w-[min(19rem,calc(100vw-7rem))] overflow-hidden rounded-[8px] border border-border bg-surface outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      href={mapUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      {card}
    </a>
  );
}

function LocationCardBody({ content }: { content: LocationMessageContent }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="relative h-24 overflow-hidden bg-[linear-gradient(90deg,var(--border)_1px,transparent_1px),linear-gradient(0deg,var(--border)_1px,transparent_1px)] bg-[length:34px_34px]"
      >
        <div className="absolute inset-y-0 left-8 w-3 bg-warning-muted" />
        <div className="absolute inset-x-0 top-8 h-3 bg-success-muted" />
        <div className="absolute inset-x-0 bottom-5 h-2 bg-surface-elevated" />
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-destructive">
          <HugeiconsIcon icon={MapPinIcon} size={28} strokeWidth={2.2} />
        </div>
      </div>
      <div className="p-3">
        <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-foreground">
          {content.title}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {content.address}
        </p>
      </div>
    </>
  );
}

function buildAmapMarkerUrl(content: LocationMessageContent) {
  if (
    !isFiniteCoordinate(content.latitude) ||
    !isFiniteCoordinate(content.longitude)
  ) {
    return undefined;
  }

  const searchParams = new URLSearchParams({
    position: `${content.longitude},${content.latitude}`,
    name: content.title || content.address || "位置",
    callnative: "0",
  });

  return `https://uri.amap.com/marker?${searchParams.toString()}`;
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
