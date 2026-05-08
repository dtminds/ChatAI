import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";

import {
  PageHeader,
  PreferenceOption,
} from "@/pages/chat/settings/shared";

export function AppearanceSettingsPage() {
  return (
    <>
      <PageHeader
        description="典型偏好设置页：主题、密度、消息展示和通知偏好，供后续接入用户级配置。"
        eyebrow="DEMO / PREFERENCE"
        title="外观"
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <PreferenceOption
          description="适合白天办公环境，保持表格和聊天区域的最大可读性。"
          icon={Sun01Icon}
          title="浅色模式"
        />
        <PreferenceOption
          description="适合弱光环境，当前只作为配置入口示例。"
          icon={Moon02Icon}
          title="深色模式"
        />
      </section>

      <section className="mt-5 rounded-[10px] border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">工作台密度</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["舒适", "标准", "紧凑"].map((density) => (
            <button
              className="rounded-[10px] border border-border px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              key={density}
              type="button"
            >
              {density}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
