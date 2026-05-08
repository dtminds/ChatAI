import { HugeiconsIcon } from "@hugeicons/react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { workflowOptions } from "@/pages/chat/settings/demo-data";
import { Field, PageHeader } from "@/pages/chat/settings/shared";

export function ReceptionWorkflowSettingsPage() {
  return (
    <>
      <PageHeader
        description="典型配置页：策略选择、数值阈值、布尔开关和说明性状态，可作为系统配置类页面模板。"
        eyebrow="DEMO / CONFIG"
        title="接待配置"
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {workflowOptions.map((option) => (
          <div
            className="rounded-[10px] border border-border p-5"
            key={option.title}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-info-muted text-info">
                <HugeiconsIcon
                  color="currentColor"
                  icon={option.icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <Switch aria-label={`启用${option.title}`} defaultChecked={option.enabled} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">{option.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {option.description}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-4 rounded-[10px] border border-border p-5 md:grid-cols-3">
        <Field label="自动转接等待时间">
          <Input id="handoff-wait" defaultValue="90 秒" />
        </Field>
        <Field label="单客服最大接待量">
          <Input id="max-load" defaultValue="8 个会话" />
        </Field>
        <Field label="质检抽样比例">
          <Input id="qa-ratio" defaultValue="15%" />
        </Field>
      </section>
    </>
  );
}
