import type { ReactNode } from "react";
import { WorkflowSettingsSection } from "./settings-section";

export function FieldGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <WorkflowSettingsSection title={title}>
      {children}
    </WorkflowSettingsSection>
  );
}
