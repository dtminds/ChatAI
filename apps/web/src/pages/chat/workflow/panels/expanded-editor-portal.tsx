import {
  createContext,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type WorkflowExpandedEditorContextValue = {
  host: HTMLDivElement | null;
  setHost: (host: HTMLDivElement | null) => void;
};

const WorkflowExpandedEditorContext = createContext<WorkflowExpandedEditorContextValue | null>(null);

export function WorkflowExpandedEditorProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  return (
    <WorkflowExpandedEditorContext.Provider value={{ host, setHost }}>
      {children}
    </WorkflowExpandedEditorContext.Provider>
  );
}

export function WorkflowExpandedEditorHost(props: ComponentPropsWithoutRef<"div">) {
  const context = useContext(WorkflowExpandedEditorContext);
  if (!context) return null;

  return <div {...props} ref={context.setHost} />;
}

export function WorkflowExpandedEditorPortal({ children }: { children: ReactNode }) {
  const context = useContext(WorkflowExpandedEditorContext);
  return context?.host ? createPortal(children, context.host) : null;
}
