import { type ComponentProps, useCallback, useEffect, useRef } from "react";
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

export function useAsyncValidation() {
  const validationIdRef = useRef(0);

  const beginValidation = useCallback(() => {
    const nextId = validationIdRef.current + 1;
    validationIdRef.current = nextId;
    return nextId;
  }, []);

  const invalidateValidation = useCallback(() => {
    validationIdRef.current += 1;
  }, []);

  const isCurrentValidation = useCallback(
    (validationId: number) => validationIdRef.current === validationId,
    [],
  );

  useEffect(() => () => invalidateValidation(), [invalidateValidation]);

  return {
    beginValidation,
    invalidateValidation,
    isCurrentValidation,
  };
}
