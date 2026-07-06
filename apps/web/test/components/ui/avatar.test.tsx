import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

describe("Avatar", () => {
  beforeAll(() => {
    installLoadedImageMock();
  });

  it("uses a user icon by default for customer avatars", () => {
    render(
      <Avatar>
        <AvatarFallback aria-label="默认头像" />
      </Avatar>,
    );

    expect(screen.getByLabelText("默认头像").querySelector("svg")).toBeInTheDocument();
  });

  it("shows initials when fallback children are provided", () => {
    render(
      <Avatar>
        <AvatarFallback>客</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText("客")).toBeInTheDocument();
    expect(screen.getByText("客").querySelector("svg")).not.toBeInTheDocument();
  });

  it("normalizes avatar image URLs before rendering", async () => {
    render(
      <Avatar>
        <AvatarImage alt="企微头像" src="https://wework.qpic.cn/wwpic/abc/0" />
      </Avatar>,
    );

    expect(await screen.findByAltText("企微头像")).toHaveAttribute(
      "src",
      "https://wework.qpic.cn/wwpic/abc/60",
    );
  });
});

function installLoadedImageMock() {
  class LoadedImageMock extends EventTarget {
    crossOrigin: string | null = null;
    referrerPolicy = "";
    src = "";

    get complete() {
      return true;
    }

    get naturalWidth() {
      return 1;
    }
  }

  vi.stubGlobal("Image", LoadedImageMock);
}
