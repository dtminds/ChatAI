import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";

export function RequiredLabel(props: ComponentProps<typeof Label>) {
  return (
    <Label {...props}>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      {props.children}
    </Label>
  );
}

export function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDotIndex + 1);
}

export function stripFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDotIndex);
}
