import { describe, expect, it } from "vitest";
import { isChatEmbedHostname } from "../src/auth/embed-host.js";

describe("Embed hostname", () => {
  it.each([
    "chat-embed.example.com",
    "chat-embed-dev.example.com",
    "CHAT-EMBED.EXAMPLE.COM.",
  ])("recognizes an embed segment in the service label: %s", (hostname) => {
    expect(isChatEmbedHostname(hostname)).toBe(true);
  });

  it.each([
    "chat.example.com",
    "chat-embedded.example.com",
    "embed.example.com",
    "embed-chat.example.com",
    "chat.embed-example.com",
    "localhost",
  ])("does not infer embed mode from unrelated hostname text: %s", (hostname) => {
    expect(isChatEmbedHostname(hostname)).toBe(false);
  });
});
