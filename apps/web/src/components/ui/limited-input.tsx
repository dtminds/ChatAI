import * as React from "react";
import { limitInputEdit } from "@/lib/input-limit";
import { Input, type InputProps } from "./input";

export interface LimitedInputProps
  extends Omit<InputProps, "defaultValue" | "maxLength" | "onChange" | "value"> {
  maxLength: number;
  onValueChange: (value: string) => void;
  value: string;
}

const LimitedInput = React.forwardRef<HTMLInputElement, LimitedInputProps>(({
  maxLength,
  onBlur,
  onCompositionEnd,
  onCompositionStart,
  onValueChange,
  value,
  ...props
}, ref) => {
  const [draftValue, setDraftValue] = React.useState(value);
  const committedValueRef = React.useRef(value);
  const isComposingRef = React.useRef(false);

  React.useEffect(() => {
    committedValueRef.current = value;
    if (!isComposingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  const commitValue = React.useCallback((rawValue: string) => {
    const nextValue = limitInputEdit(committedValueRef.current, rawValue, maxLength);
    setDraftValue(nextValue);
    if (nextValue === committedValueRef.current) {
      return nextValue;
    }

    committedValueRef.current = nextValue;
    onValueChange(nextValue);
    return nextValue;
  }, [maxLength, onValueChange]);

  return (
    <Input
      {...props}
      ref={ref}
      onChange={(event) => {
        if (isComposingRef.current) {
          setDraftValue(event.target.value);
          return;
        }
        commitValue(event.target.value);
      }}
      onBlur={(event) => {
        isComposingRef.current = false;
        const nextValue = commitValue(event.currentTarget.value);
        event.currentTarget.value = nextValue;
        onBlur?.(event);
      }}
      onCompositionEnd={(event) => {
        isComposingRef.current = false;
        commitValue(event.currentTarget.value);
        onCompositionEnd?.(event);
      }}
      onCompositionStart={(event) => {
        isComposingRef.current = true;
        setDraftValue(event.currentTarget.value);
        onCompositionStart?.(event);
      }}
      value={draftValue}
    />
  );
});

LimitedInput.displayName = "LimitedInput";

export { LimitedInput };
