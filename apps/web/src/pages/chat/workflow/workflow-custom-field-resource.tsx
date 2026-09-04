import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CustomFieldItem } from "@chatai/contracts";
import { listCustomFields } from "@/pages/chat/ai-hosting/api/custom-field-service";

export type WorkflowCustomFieldResourceStatus =
  | "error"
  | "idle"
  | "loading"
  | "ready";

export type WorkflowCustomFieldResource = {
  fields: CustomFieldItem[];
  reload: () => void;
  status: WorkflowCustomFieldResourceStatus;
};

const emptyResource: WorkflowCustomFieldResource = {
  fields: [],
  reload: () => undefined,
  status: "idle",
};

const WorkflowCustomFieldResourceContext = createContext(emptyResource);

export function WorkflowCustomFieldResourceProvider({
  children,
  resource,
}: {
  children: ReactNode;
  resource: WorkflowCustomFieldResource;
}) {
  return (
    <WorkflowCustomFieldResourceContext.Provider value={resource}>
      {children}
    </WorkflowCustomFieldResourceContext.Provider>
  );
}

export function useWorkflowCustomFieldResourceContext() {
  return useContext(WorkflowCustomFieldResourceContext);
}

export async function listWorkflowCustomFields(): Promise<CustomFieldItem[]> {
  const response = await listCustomFields({ status: 1 });
  return response.fields;
}

export function useWorkflowCustomFieldResource(
  enabled: boolean,
  loader: () => Promise<CustomFieldItem[]> = listWorkflowCustomFields,
) {
  const requestIdRef = useRef(0);
  const [fields, setFields] = useState<CustomFieldItem[]>([]);
  const [status, setStatus] = useState<WorkflowCustomFieldResourceStatus>("idle");

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");

    try {
      const nextFields = await loader();
      if (requestIdRef.current === requestId) {
        setFields(nextFields);
        setStatus("ready");
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setStatus("error");
      }
    }
  }, [loader]);

  useEffect(() => {
    if (!enabled || status !== "idle") return;
    void reload();
  }, [enabled, reload, status]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  return { fields, reload, status };
}
