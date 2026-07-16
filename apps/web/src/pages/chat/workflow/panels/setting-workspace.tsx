import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft01Icon,
  SquareArrowShrink01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExpandedEditor = {
  id: string;
  title: string;
};

type SettingWorkspaceContextValue = {
  activeEditor: ExpandedEditor | null;
  closeEditor: () => void;
  editorHost: HTMLDivElement | null;
  openEditor: (editor: ExpandedEditor) => void;
  setEditorHost: (host: HTMLDivElement | null) => void;
};

const SettingWorkspaceContext = createContext<SettingWorkspaceContextValue | null>(null);

export function SettingWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeEditor, setActiveEditor] = useState<ExpandedEditor | null>(null);
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const closeEditor = useCallback(() => setActiveEditor(null), []);

  return (
    <SettingWorkspaceContext.Provider
      value={{
        activeEditor,
        closeEditor,
        editorHost,
        openEditor: setActiveEditor,
        setEditorHost,
      }}
    >
      {children}
    </SettingWorkspaceContext.Provider>
  );
}

export function useSettingWorkspace() {
  const context = useContext(SettingWorkspaceContext);
  if (!context) throw new Error("useSettingWorkspace must be used within SettingWorkspaceProvider");
  return context;
}

export function SettingWorkspace({ children }: { children: ReactNode }) {
  const { activeEditor, closeEditor, setEditorHost } = useSettingWorkspace();

  useEffect(() => {
    if (!activeEditor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditor();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeEditor, closeEditor]);

  return (
    <div
      className={cn(
        "absolute bottom-3 right-3 top-3 z-20 flex min-h-0 overflow-hidden rounded-2xl border border-foreground/15 bg-[var(--workflow-panel-bg-blur)] shadow-[0_4px_12px_var(--shadow-soft)] backdrop-blur-[10px]",
        activeEditor
          ? "left-3 z-30"
          : "w-[26.25rem] max-xl:w-[23.5rem] max-lg:left-3 max-lg:w-auto",
      )}
      data-expanded={activeEditor ? "true" : undefined}
    >
      {activeEditor ? (
        <section
          aria-label={`${activeEditor.title}展开编辑`}
          className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-[var(--workflow-border)] bg-background max-lg:border-r-0"
          role="region"
        >
          <ExpandedEditorHeader title={activeEditor.title} onClose={closeEditor} />
          <div className="flex min-h-0 flex-1" ref={setEditorHost} />
        </section>
      ) : null}

      <div className={cn(
        "min-h-0 w-[26.25rem] shrink-0 max-xl:w-[23.5rem] max-lg:w-full",
        activeEditor && "max-lg:hidden",
      )}>
        {children}
      </div>
    </div>
  );
}

export function SettingWorkspaceEditorContent({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  const { activeEditor, editorHost } = useSettingWorkspace();
  return activeEditor?.id === id && editorHost
    ? createPortal(children, editorHost)
    : null;
}

function ExpandedEditorHeader({
  onClose,
  title,
}: {
  onClose: () => void;
  title: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Button
        aria-label={`收起${title}`}
        className="h-8 gap-1.5 rounded-lg px-2"
        onClick={onClose}
        size="sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon className="lg:hidden" icon={ArrowLeft01Icon} size={15} strokeWidth={1.8} />
        <HugeiconsIcon className="hidden lg:block" icon={SquareArrowShrink01Icon} size={15} strokeWidth={1.8} />
        <span className="lg:hidden">返回</span>
      </Button>
    </header>
  );
}
