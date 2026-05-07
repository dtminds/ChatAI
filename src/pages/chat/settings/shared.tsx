import { Settings03Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  eyebrow,
  description,
}: {
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <HugeiconsIcon
          color="currentColor"
          icon={Settings03Icon}
          size={14}
          strokeWidth={1.8}
        />
        <span>{eyebrow}</span>
      </div>
      <h1 className="mt-2 text-[26px] font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = getElementId(children);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function StatusText({
  tone,
  children,
}: {
  tone: "success" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-sm font-semibold",
        tone === "success" && "text-success",
        tone === "danger" && "text-destructive",
        tone === "muted" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function DemoNotes({ items }: { items: string[] }) {
  return (
    <section className="mt-6 rounded-[10px] border border-border bg-info-muted p-5">
      <h2 className="text-sm font-semibold text-foreground">开发接入提示</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-2" key={item}>
            <span className="mt-[9px] size-1.5 rounded-full bg-info" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PreferenceOption({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: IconSvgElement;
}) {
  return (
    <button
      className="rounded-[10px] border border-border bg-background p-5 text-left transition-colors hover:bg-surface-hover"
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-surface-muted text-foreground">
          <HugeiconsIcon
            color="currentColor"
            icon={icon}
            size={18}
            strokeWidth={1.8}
          />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </button>
  );
}

function getElementId(children: React.ReactNode) {
  if (React.isValidElement<{ id?: string }>(children)) {
    return children.props.id;
  }

  return undefined;
}
