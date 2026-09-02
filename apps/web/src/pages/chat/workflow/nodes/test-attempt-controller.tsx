import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowInferenceTestAttempt } from "@chatai/contracts";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RequestNormalizedError } from "@/lib/request";
import { toast } from "sonner";
import { useSettingWorkspace } from "../panels/setting-workspace";

const TEST_ATTEMPT_POLL_INTERVAL_MS = 500;

export function WorkflowTestWorkspaceTrigger({
  ariaLabel,
  nodeId,
}: {
  ariaLabel: string;
  nodeId: string;
}) {
  const { openEditor } = useSettingWorkspace();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={ariaLabel}
            className="size-8 rounded-lg p-0"
            onClick={() => openEditor({ id: getWorkflowTestWorkspaceId(nodeId), title: "试运行" })}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>试运行</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function getWorkflowTestWorkspaceId(nodeId: string) {
  return `${nodeId}:test-run`;
}

export function useWorkflowTestAttemptController({
  cancelAttempt,
  getAttempt,
}: {
  cancelAttempt: (attemptId: string) => Promise<WorkflowInferenceTestAttempt>;
  getAttempt: (attemptId: string) => Promise<WorkflowInferenceTestAttempt>;
}) {
  const [attempt, setAttempt] = useState<WorkflowInferenceTestAttempt | null>(null);
  const [pollRevision, setPollRevision] = useState(0);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { registerCloseGuard } = useSettingWorkspace();
  const pendingCloseActionRef = useRef<(() => void) | null>(null);
  const confirmedCloseActionRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);
  const running = starting || attempt?.status === "running";

  const clearCurrentAttempt = useCallback(() => {
    requestVersionRef.current += 1;
    setAttempt(null);
    setRequestError(null);
    setStarting(false);
    setStopping(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!running && !stopping) return undefined;
    return registerCloseGuard((continueClose) => {
      if (!stopping) {
        pendingCloseActionRef.current = continueClose;
        setCloseConfirmOpen(true);
      }
      return true;
    });
  }, [registerCloseGuard, running, stopping]);

  useEffect(() => {
    if (running || stopping) return;
    pendingCloseActionRef.current = null;
    confirmedCloseActionRef.current = null;
    setCloseConfirmOpen(false);
  }, [running, stopping]);

  useEffect(() => {
    if (!running && !stopping) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [running, stopping]);

  useEffect(() => {
    if (!attempt || attempt.status !== "running") return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requestVersion = requestVersionRef.current;

    const poll = async () => {
      try {
        const nextAttempt = await getAttempt(attempt.attemptId);
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        setRequestError(null);
        setAttempt(nextAttempt);
        if (nextAttempt.status === "running") {
          timer = setTimeout(() => void poll(), TEST_ATTEMPT_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        if (isMissingAttemptError(error)) {
          clearCurrentAttempt();
          return;
        }
        setRequestError(getRequestErrorMessage(error));
      }
    };

    timer = setTimeout(() => void poll(), TEST_ATTEMPT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt?.attemptId, attempt?.status, clearCurrentAttempt, getAttempt, pollRevision]);

  const cancelCurrentAttempt = useCallback(async (
    currentAttempt: WorkflowInferenceTestAttempt,
    continueClose?: () => void,
  ) => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    if (mountedRef.current) {
      setStopping(true);
      setRequestError(null);
    }
    try {
      const stopped = await cancelAttempt(currentAttempt.attemptId);
      if (mountedRef.current && requestVersionRef.current === requestVersion) {
        setAttempt(stopped);
        continueClose?.();
      }
    } catch (error) {
      if (mountedRef.current && requestVersionRef.current === requestVersion) {
        if (isMissingAttemptError(error)) {
          clearCurrentAttempt();
          continueClose?.();
        } else {
          toast.error(getRequestErrorMessage(error));
          setPollRevision(current => current + 1);
        }
      }
    } finally {
      if (mountedRef.current && requestVersionRef.current === requestVersion) setStopping(false);
    }
  }, [cancelAttempt, clearCurrentAttempt]);

  const startAttempt = useCallback(async (
    createAttempt: () => Promise<WorkflowInferenceTestAttempt>,
  ) => {
    if (running || stopping) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setAttempt(null);
    setStarting(true);
    setRequestError(null);
    try {
      const created = await createAttempt();
      if (requestVersionRef.current === requestVersion) {
        const confirmedCloseAction = confirmedCloseActionRef.current;
        confirmedCloseActionRef.current = null;
        if (mountedRef.current) {
          setAttempt(created);
          setStarting(false);
        }
        if (confirmedCloseAction) void cancelCurrentAttempt(created, confirmedCloseAction);
      }
    } catch (error) {
      if (mountedRef.current && requestVersionRef.current === requestVersion) {
        setStarting(false);
        setStopping(false);
        confirmedCloseActionRef.current = null;
        toast.error(getRequestErrorMessage(error));
      }
    } finally {
      if (mountedRef.current && requestVersionRef.current === requestVersion) setStarting(false);
    }
  }, [cancelCurrentAttempt, running, stopping]);

  const stopAttempt = useCallback(() => {
    if (!attempt || attempt.status !== "running" || stopping) return;
    void cancelCurrentAttempt(attempt);
  }, [attempt, cancelCurrentAttempt, stopping]);

  const stopAndClose = useCallback(() => {
    const continueClose = pendingCloseActionRef.current;
    pendingCloseActionRef.current = null;
    setCloseConfirmOpen(false);
    if (!continueClose) return;
    if (attempt?.status === "running") {
      void cancelCurrentAttempt(attempt, continueClose);
    } else if (starting) {
      confirmedCloseActionRef.current = continueClose;
      setStopping(true);
    } else continueClose();
  }, [attempt, cancelCurrentAttempt, starting]);

  return {
    attempt,
    closeConfirmOpen,
    requestError,
    running,
    setCloseConfirmOpen,
    startAttempt,
    starting,
    stopAndClose,
    stopAttempt,
    stopping,
  };
}

export function WorkflowTestAttemptCloseDialog({
  controller,
}: {
  controller: ReturnType<typeof useWorkflowTestAttemptController>;
}) {
  return (
    <AlertDialog
      open={controller.closeConfirmOpen}
      onOpenChange={controller.setCloseConfirmOpen}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>停止试运行</AlertDialogTitle>
          <AlertDialogDescription>试运行仍在进行，关闭将停止本次运行</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={controller.stopping}>继续运行</AlertDialogCancel>
          <AlertDialogAction
            disabled={controller.stopping}
            onClick={controller.stopAndClose}
            variant="destructive"
          >
            停止并关闭
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getRequestErrorMessage(error: unknown) {
  if (error instanceof RequestNormalizedError && error.status) return error.message;
  return "操作失败，请稍后重试";
}

function isMissingAttemptError(error: unknown) {
  return error instanceof RequestNormalizedError
    && (error.status === 404
      || error.code === "WORKFLOW_LLM_TEST_ATTEMPT_NOT_FOUND"
      || error.code === "WORKFLOW_INFERENCE_TEST_ATTEMPT_NOT_FOUND");
}
