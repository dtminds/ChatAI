import { useCallback, useEffect, useRef, useState } from "react";
import { listSubAccounts } from "@/pages/chat/settings/settings-service";
import type { WorkflowStartOption } from "./nodes/start/fixture-options";

export type WorkflowManagedAccountResourceStatus =
  | "error"
  | "idle"
  | "loading"
  | "ready";

export type WorkflowManagedAccountResource = {
  options: WorkflowStartOption[];
  reload: () => void;
  status: WorkflowManagedAccountResourceStatus;
};

export async function listWorkflowManagedAccounts(): Promise<WorkflowStartOption[]> {
  const { seats } = await listSubAccounts();

  return seats.flatMap((seat) => {
    const id = parsePositiveSafeInteger(seat.seatId);

    return id === null
      ? []
      : [{ avatarUrl: seat.avatarUrl, id, label: seat.name }];
  });
}

export function useWorkflowManagedAccountResource(
  enabled: boolean,
  loader: () => Promise<WorkflowStartOption[]> = listWorkflowManagedAccounts,
) {
  const requestIdRef = useRef(0);
  const [options, setOptions] = useState<WorkflowStartOption[]>([]);
  const [status, setStatus] = useState<WorkflowManagedAccountResourceStatus>("idle");

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");

    try {
      const nextOptions = await loader();

      if (requestIdRef.current === requestId) {
        setOptions(nextOptions);
        setStatus("ready");
      }
    }
    catch {
      if (requestIdRef.current === requestId) {
        setStatus("error");
      }
    }
  }, [loader]);

  useEffect(() => {
    if (!enabled || status !== "idle") {
      return;
    }

    void reload();
  }, [enabled, reload, status]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  return { options, reload, status };
}

function parsePositiveSafeInteger(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value
    ? parsed
    : null;
}
