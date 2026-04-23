import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    writable: true,
    value: vi.fn((callback: FrameRequestCallback) => window.setTimeout(callback, 0)),
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    writable: true,
    value: vi.fn((id: number) => window.clearTimeout(id)),
  });
});

afterEach(() => {
  cleanup();
});
