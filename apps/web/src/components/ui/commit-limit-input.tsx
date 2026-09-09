import { useEffect, useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";

export function clipInputValue(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

export function CommitLimitInput({
  maxLength,
  onBlur,
  onValueCommit,
  value,
  ...props
}: Omit<InputProps, "maxLength" | "onChange" | "value"> & {
  maxLength: number;
  onValueCommit: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      {...props}
      onBlur={(event) => {
        const next = clipInputValue(draft, maxLength);
        setDraft(next);
        onValueCommit(next);
        onBlur?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      value={draft}
    />
  );
}
