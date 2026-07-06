import { type ComponentProps, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { TableCellContent } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isRequestError } from "@/lib/request";

export const QA_QUESTION_MAX_LENGTH = 500;
export const QA_ANSWER_MAX_LENGTH = 2000;
export const IMAGE_TITLE_MAX_LENGTH = 16;
export const CHUNK_FIRST_FIELD_MAX_LENGTH = 100;
export const CHUNK_SECOND_FIELD_MAX_LENGTH = 2000;

export function resolveKbRequestErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  if (isRequestError(error)) {
    return error.message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function useDialogSubmit({
  onOpenChange,
  onReset,
  onSubmitError,
  open,
  submitErrorMessage = "操作失败，请稍后重试",
}: {
  onOpenChange: (open: boolean) => void;
  onReset?: () => void;
  onSubmitError?: (error: unknown) => void;
  open: boolean;
  submitErrorMessage?: string;
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
      } catch (error) {
        if (isMountedRef.current) {
          if (onSubmitError) {
            onSubmitError(error);
          } else {
            toast.error(resolveKbRequestErrorMessage(error, submitErrorMessage));
          }
        }
      } finally {
        if (isMountedRef.current) {
          setSubmitting(false);
        }
      }

      if (submitSuccessful && isMountedRef.current) {
        onOpenChange(false);
      }
    },
    [onOpenChange, onSubmitError, submitErrorMessage],
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

export function createLocalDocId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `local-${Math.random().toString(36).slice(2, 11)}`;
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

export function TableOverflowTooltip({
  children,
  className,
  tooltip,
}: {
  children: ReactNode;
  className?: string;
  tooltip?: string | null;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const tooltipText =
    tooltip ?? (typeof children === "string" || typeof children === "number" ? String(children) : "");

  const updateOverflow = useCallback(() => {
    const element = contentRef.current;

    if (!element) {
      return;
    }

    setIsOverflowing(
      element.scrollWidth > element.clientWidth ||
        element.scrollHeight > element.clientHeight,
    );
  }, []);

  useEffect(() => {
    updateOverflow();

    const element = contentRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);

    return () => observer.disconnect();
  }, [tooltipText, updateOverflow]);

  const content = (
    <TableCellContent className={cn(className)} ref={contentRef}>
      {children}
    </TableCellContent>
  );

  if (!tooltipText || !isOverflowing) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="max-w-sm break-words" side="top" sideOffset={4}>
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
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
