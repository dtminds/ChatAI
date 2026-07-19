import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import {
  clearNewMessageSoundRuntimeState,
  getNewMessageSoundPreference,
  NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
  notifyNewMessageSound,
  unlockNewMessageSound,
} from "@/pages/chat/lib/new-message-sound-alert";
import type { Conversation } from "@/pages/chat/chat-types";

let audioInstances: AudioMock[];

const conversation: Conversation = {
  accountId: "account-1",
  conversationAIHostingSwitch: false,
  handoffMsgId: 0,
  customerAvatarUrl: "https://example.com/customer.png",
  customerId: "customer-1",
  customerName: "测试客户",
  id: "conversation-1",
  mode: "single",
  preview: "请帮我看一下",
  priority: "medium",
  quietFor: "22天没聊了",
  unread: 3,
  updatedAt: "2026-05-07 09:00:00",
};

describe("ChatHeader", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
    audioInstances = [];
    AudioMock.reset();
    clearNewMessageSoundRuntimeState();
    vi.stubGlobal("Audio", AudioMock);
  });

  afterEach(() => {
    clearNewMessageSoundRuntimeState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps appearance controls out of the chat header", () => {
    render(<ChatHeader />);

    expect(screen.queryByRole("radio", { name: "浅色模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "深色模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "跟随系统" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /切换[深浅]色模式/ }),
    ).not.toBeInTheDocument();
  });

  it("uses compact mobile controls without appearance or new message sound entries", () => {
    render(
      <ChatHeader
        activeConversation={conversation}
        isMobileLayout
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "返回会话列表" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新消息提醒/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "浅色模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "深色模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "跟随系统" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /切换[深浅]色模式/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps conversation actions in the overflow menu on desktop", async () => {
    const user = userEvent.setup();
    const onMarkConversationRead = vi.fn();
    const onPinConversation = vi.fn();
    const onUnpinConversation = vi.fn();

    const { rerender } = render(
      <ChatHeader
        activeConversation={conversation}
        onMarkConversationRead={onMarkConversationRead}
        onPinConversation={onPinConversation}
        onUnpinConversation={onUnpinConversation}
      />,
    );

    expect(screen.queryByRole("button", { name: "置顶" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更多会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: "置顶" }));
    await user.click(screen.getByRole("button", { name: "更多会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: "标记已读" }));

    expect(onPinConversation).toHaveBeenCalledTimes(1);
    expect(onMarkConversationRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "不显示" })).not.toBeInTheDocument();

    rerender(
      <ChatHeader
        activeConversation={{ ...conversation, isPinned: true }}
        onMarkConversationRead={onMarkConversationRead}
        onPinConversation={onPinConversation}
        onUnpinConversation={onUnpinConversation}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多会话操作" }));
    await user.click(screen.getByRole("menuitem", { name: "取消置顶" }));
    expect(onUnpinConversation).toHaveBeenCalledTimes(1);
  });

  it("keeps the mobile sidebar button outside the conversation overflow menu", async () => {
    const user = userEvent.setup();
    const onMarkConversationUnread = vi.fn();
    const onToggleSidebar = vi.fn();

    render(
      <ChatHeader
        activeConversation={{ ...conversation, unread: 0 }}
        isMobileLayout
        onBack={vi.fn()}
        onMarkConversationUnread={onMarkConversationUnread}
        onPinConversation={vi.fn()}
        onToggleSidebar={onToggleSidebar}
      />,
    );

    expect(screen.getByRole("button", { name: "更多会话操作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "置顶" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多会话操作" }));
    expect(screen.queryByRole("menuitem", { name: "不显示" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "标记未读" }));
    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));

    expect(onMarkConversationUnread).toHaveBeenCalledTimes(1);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("does not show internal sync cursor details in the header", () => {
    render(
      <ChatHeader
        activeConversation={conversation}
      />,
    );

    expect(screen.getByText(conversation.customerName)).toBeInTheDocument();
    expect(screen.queryByText(/消息游标/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22天没聊了/)).not.toBeInTheDocument();
  });

  it("renders the original conversation name as secondary text", () => {
    render(
      <ChatHeader
        activeConversation={{
          ...conversation,
          contactOriginalName: "微信昵称：客户原始昵称",
          customerName: "客户备注",
        }}
      />,
    );

    expect(screen.getByText("客户备注")).toBeInTheDocument();
    expect(screen.getByText("微信昵称：客户原始昵称")).toBeInTheDocument();
  });

  it("shows the AI hosting tag for hosted single and group conversations", () => {
    const { rerender } = render(
      <ChatHeader activeConversation={conversation} isAIHostingEnabled />,
    );

    const hostingTag = screen.getByText("AI 托管中").parentElement;

    expect(hostingTag).toBeInTheDocument();
    expect(hostingTag?.querySelector("svg")).toBeInTheDocument();

    rerender(
      <ChatHeader
        activeConversation={{
          ...conversation,
          mode: "group",
          thirdGroupId: "group-001",
        }}
        isAIHostingEnabled
      />,
    );

    expect(screen.getByText("AI 托管中")).toBeInTheDocument();

    rerender(<ChatHeader activeConversation={conversation} />);

    expect(screen.queryByText("AI 托管中")).not.toBeInTheDocument();
  });

  it("shows reception account constraints for shadow group conversations", async () => {
    const user = userEvent.setup();

    render(
      <ChatHeader
        activeConversation={{
          ...conversation,
          customerName: "测试影子群",
          isShadowGroup: true,
          mode: "group",
          thirdGroupId: "group-001",
        }}
      />,
    );

    const noticeTrigger = screen.getByRole("button", {
      name: "查看接待号注意事项",
    });

    expect(noticeTrigger).toHaveTextContent("接待号");

    await user.hover(noticeTrigger);

    expect(await screen.findByText("接待号注意事项")).toBeInTheDocument();
    expect(screen.getByText(/无法在工作台撤回已发送的消息/)).toBeInTheDocument();
    expect(screen.getByText(/包含引用或@内容时工作台回显可能异常/)).toBeInTheDocument();
    expect(screen.getByText(/不支持一键重发/)).toBeInTheDocument();
  });

  it("does not show the reception account notice for regular conversations", () => {
    const { rerender } = render(
      <ChatHeader
        activeConversation={conversation}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "查看接待号注意事项" }),
    ).not.toBeInTheDocument();

    rerender(
      <ChatHeader
        activeConversation={{
          ...conversation,
          mode: "group",
          thirdGroupId: "group-001",
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "查看接待号注意事项" }),
    ).not.toBeInTheDocument();
  });

  it("does not read browser storage or media queries while rendering", () => {
    const getItemSpy = vi.spyOn(window.localStorage, "getItem");
    const matchMediaSpy = vi.spyOn(window, "matchMedia");

    renderToString(
      <ChatHeader />,
    );

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  it("does not render the saved sound preference before the client syncs storage", () => {
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound2",
        trigger: "all_new_messages",
      }),
    );

    const markup = renderToString(
      <ChatHeader />,
    );

    expect(markup).toContain("提示音关");
    expect(markup).not.toContain("提示音开");
  });

  it("shows the notification capsule and summary popover without directly toggling from the capsule", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "all_new_messages",
      }),
    );
    await unlockNewMessageSound("msg_sound1");

    render(<ChatHeader />);

    const capsule = screen.getByRole("button", { name: "新消息提醒已开启" });
    expect(capsule).toHaveTextContent("提示音开");

    await user.hover(capsule);

    expect(getNewMessageSoundPreference().enabled).toBe(true);
    expect(screen.getByText("提示音")).toBeInTheDocument();
    expect(screen.getByText("提示音 1")).toBeInTheDocument();
    expect(screen.getByText("提示时机")).toBeInTheDocument();
    expect(screen.getByText("收到新消息时")).toBeInTheDocument();
    expect(screen.getByText("状态")).toBeInTheDocument();
    expect(screen.getByText("开启")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "新消息提醒状态" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("uses the capsule button for quick enable and disable", async () => {
    const user = userEvent.setup();
    render(<ChatHeader />);

    await user.click(screen.getByRole("button", { name: "新消息提醒未开启" }));

    expect(screen.queryByRole("dialog", { name: "新消息提示音" })).not.toBeInTheDocument();
    expect(getNewMessageSoundPreference()).toMatchObject({
      enabled: true,
      soundId: "msg_sound1",
      trigger: "unfocused_only",
    });
    expect(audioInstances[0].play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "新消息提醒已开启" })).toHaveTextContent(
      "提示音开",
    );

    await user.click(screen.getByRole("button", { name: "新消息提醒已开启" }));

    expect(getNewMessageSoundPreference().enabled).toBe(false);
    expect(screen.getByRole("button", { name: "新消息提醒未开启" })).toHaveTextContent(
      "提示音关",
    );
  });

  it("shows a playback error when quick enable cannot unlock sound", async () => {
    const user = userEvent.setup();
    AudioMock.rejectNextPlay();

    render(<ChatHeader />);

    await user.click(screen.getByRole("button", { name: "新消息提醒未开启" }));

    expect(screen.queryByRole("dialog", { name: "新消息提示音" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("无法播放提示音，请检查浏览器权限");
    expect(getNewMessageSoundPreference().enabled).toBe(false);
  });

  it("opens the settings dialog from the summary popover gear and saves sound and trigger choices", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "unfocused_only",
      }),
    );
    await unlockNewMessageSound("msg_sound1");

    render(<ChatHeader />);

    await user.hover(screen.getByRole("button", { name: "新消息提醒已开启" }));
    await user.click(screen.getByRole("button", { name: "设置" }));

    const dialog = screen.getByRole("dialog", { name: "新消息提示音" });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "提示音" }));
    await user.click(await screen.findByRole("option", { name: "提示音 2" }));

    const alwaysTriggerButton = screen.getByRole("button", { name: /收到新消息时/ });
    expect(alwaysTriggerButton).toHaveAttribute("aria-pressed", "false");
    await user.click(alwaysTriggerButton);
    expect(alwaysTriggerButton).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "试听" }));
    expect(audioInstances.at(-1)?.src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(getNewMessageSoundPreference()).toMatchObject({
      enabled: true,
      soundId: "msg_sound2",
      trigger: "all_new_messages",
    });
  });

  it("does not interrupt the settings dialog with a re-enable popover while previewing another sound", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "unfocused_only",
      }),
    );
    await unlockNewMessageSound("msg_sound1");

    render(<ChatHeader />);

    await user.hover(screen.getByRole("button", { name: "新消息提醒已开启" }));
    await user.click(screen.getByRole("button", { name: "设置" }));

    await user.click(screen.getByRole("combobox", { name: "提示音" }));
    await user.click(await screen.findByRole("option", { name: "提示音 2" }));
    await user.click(screen.getByRole("button", { name: "试听" }));

    expect(screen.getByRole("dialog", { name: "新消息提示音" })).toBeInTheDocument();
    expect(screen.queryByText("重新开启消息提示音")).not.toBeInTheDocument();
  });

  it("shows a separate re-enable popover after refresh and lets the user ignore it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "unfocused_only",
      }),
    );

    render(<ChatHeader />);

    expect(await screen.findByText("重新开启消息提示音")).toBeInTheDocument();
    expect(screen.getByText("温馨提示：因浏览器权限约束，每次刷新页面后，需要点击一次开启提示音，以免错过新消息哦")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "忽略" }));

    expect(getNewMessageSoundPreference().enabled).toBe(false);
    expect(screen.queryByText("重新开启消息提示音")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新消息提醒未开启" })).toHaveTextContent(
      "提示音关",
    );
  });

  it("keeps the refresh re-enable popover open until the user chooses an action", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "unfocused_only",
      }),
    );

    render(<ChatHeader />);

    expect(await screen.findByText("重新开启消息提示音")).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.getByText("重新开启消息提示音")).toBeInTheDocument();
    expect(getNewMessageSoundPreference().enabled).toBe(true);
  });

  it("re-enables the saved sound from the separate refresh popover", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound2",
        trigger: "unfocused_only",
      }),
    );

    render(<ChatHeader />);

    await user.click(await screen.findByRole("button", { name: "点此开启" }));

    expect(getNewMessageSoundPreference().enabled).toBe(true);
    expect(audioInstances[0].src).toBe("https://b5.bokr.com.cn/dist/sound/msg_sound2.mp3");
    expect(screen.queryByText("重新开启消息提示音")).not.toBeInTheDocument();
  });

  it("shows a playback error when refresh re-enable cannot unlock sound", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "unfocused_only",
      }),
    );
    AudioMock.rejectNextPlay();

    render(<ChatHeader />);

    await user.click(await screen.findByRole("button", { name: "点此开启" }));

    expect(screen.getByText("重新开启消息提示音")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("无法播放提示音，请检查浏览器权限");
    expect(getNewMessageSoundPreference().enabled).toBe(true);
  });

  it("prompts the user to re-enable sound when runtime playback loses permission", async () => {
    window.localStorage.setItem(
      NEW_MESSAGE_SOUND_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        soundId: "msg_sound1",
        trigger: "all_new_messages",
      }),
    );
    await unlockNewMessageSound("msg_sound1");

    render(<ChatHeader />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新消息提醒已开启" })).toBeInTheDocument();
    });

    AudioMock.rejectNextPlay();
    notifyNewMessageSound();

    expect(await screen.findByText("重新开启消息提示音")).toBeInTheDocument();
  });
});

class AudioMock {
  private static pendingPlayRejections = 0;

  currentTime = 0;
  preload = "";
  src: string;
  volume = 1;
  pause = vi.fn();
  play = vi.fn(() => {
    if (AudioMock.pendingPlayRejections > 0) {
      AudioMock.pendingPlayRejections -= 1;
      return Promise.reject(new Error("blocked"));
    }

    return Promise.resolve();
  });

  constructor(src: string) {
    this.src = src;
    audioInstances.push(this);
  }

  static rejectNextPlay() {
    AudioMock.pendingPlayRejections += 1;
  }

  static reset() {
    AudioMock.pendingPlayRejections = 0;
  }
}
