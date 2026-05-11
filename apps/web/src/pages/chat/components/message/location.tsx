import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LocationMessageContent } from "@/pages/chat/chat-types";

type LocationMessageCardProps = {
  content: LocationMessageContent;
};

export function LocationMessageCard({ content }: LocationMessageCardProps) {
  const mapUrl = buildAmapMarkerUrl(content);
  const card = <LocationCardBody content={content} />;

  if (!mapUrl) {
    return (
      <div className="overflow-hidden rounded-[12px] border border-border/70 bg-surface" style={{ height: 82, width: 303 }}>
        {card}
      </div>
    );
  }

  return (
    <a
      className="block overflow-hidden rounded-[12px] border border-border/70 bg-surface outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height: 82, width: 303 }}
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
    <div className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden="true"
        data-testid="location-map"
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url("https://b5.bokr.com.cn/dist/location_bg.png")',
        }}
      />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4">
        <div className="flex items-center gap-1">
          <HugeiconsIcon
            className="mt-[1px] shrink-0 text-primary"
            icon={Location01Icon}
            size={16}
            strokeWidth={2.2}
          />
          <p className="min-w-0 line-clamp-1 text-[14px] font-semibold leading-4 text-foreground">
            {content.title}
          </p>
        </div>
        <p className="mt-1 line-clamp-1 text-[12px] leading-4 text-muted-foreground">
          {content.address}
        </p>
      </div>
    </div>
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
