import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";

export const QA_QUESTION_MAX_LENGTH = 500;
export const QA_ANSWER_MAX_LENGTH = 2000;
export const IMAGE_TITLE_MAX_LENGTH = 16;
export const CHUNK_FIRST_FIELD_MAX_LENGTH = 100;
export const CHUNK_SECOND_FIELD_MAX_LENGTH = 2000;

export function useDialogSubmit({
  onOpenChange,
  onReset,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onReset?: () => void;
  open: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      onReset?.();
      setSubmitting(false);
    }
  }, [onReset, open]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && submitting) {
        return;
      }

      onOpenChange(nextOpen);
    },
    [onOpenChange, submitting],
  );

  const runSubmit = useCallback(
    async (action: () => boolean | void | Promise<boolean | void>) => {
      setSubmitting(true);
      let submitSuccessful = false;

      try {
        const result = await Promise.resolve(action());
        if (result !== false) {
          submitSuccessful = true;
        }
      } catch {
        // Keep dialog open when submit fails.
      } finally {
        if (isMountedRef.current) {
          setSubmitting(false);
        }
      }

      if (submitSuccessful && isMountedRef.current) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  return {
    handleOpenChange,
    runSubmit,
    submitting,
  };
}

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
