import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  IconStack,
  type IconStackVariant,
} from "@/components/ui/icon-stack";

const variantClassNames = [
  {
    contentClassName:
      "[&_[data-slot=icon-stack-content]]:text-muted-foreground",
    stackClassName: "text-foreground",
    variant: "neutral",
  },
  {
    contentClassName: "[&_[data-slot=icon-stack-content]]:text-primary",
    stackClassName: "text-primary",
    variant: "primary",
  },
  {
    contentClassName: "[&_[data-slot=icon-stack-content]]:text-success",
    stackClassName: "text-success",
    variant: "success",
  },
  {
    contentClassName: "[&_[data-slot=icon-stack-content]]:text-warning",
    stackClassName: "text-warning",
    variant: "warning",
  },
] as const satisfies ReadonlyArray<{
  contentClassName: string;
  stackClassName: string;
  variant: IconStackVariant;
}>;

describe("IconStack", () => {
  it("uses the neutral semantic variant by default", () => {
    render(<IconStack data-testid="icon-stack" />);

    expect(screen.getByTestId("icon-stack")).toHaveAttribute(
      "data-variant",
      "neutral",
    );
  });

  it.each(variantClassNames)(
    "maps the $variant variant to its semantic colors",
    ({ contentClassName, stackClassName, variant }) => {
      render(<IconStack data-testid="icon-stack" variant={variant} />);

      expect(screen.getByTestId("icon-stack")).toHaveClass(
        stackClassName,
        contentClassName,
      );
    },
  );
});
