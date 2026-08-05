import { useState } from "react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import "./ai-skill-delivery.css";

const DELIVERY_STEPS = [
  {
    description: "梳理业务目标和关键场景，明确 Agent 的交付范围",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i1.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f1.png",
    title: "场景诊断",
  },
  {
    description: "定制 Agent 能力与流程，完成知识、工具和系统集成",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i2.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f2.png",
    title: "方案定制",
  },
  {
    description: "完成联调、测试与调优，确保 Agent 稳定上线",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i3.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f3.png",
    title: "上线验证",
  },
  {
    description: "基于使用数据持续迭代，让 Agent 持续创造价值",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i4.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f4.png",
    title: "持续优化",
  },
] as const;

const DELIVERY_VALUES = [
  {
    description: "围绕真实场景设计能力与流程，减少反复沟通",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i1.png",
    title: "更贴合业务",
  },
  {
    description: "由专业团队推进搭建与联调，缩短上线周期",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i2.png",
    title: "更快上线",
  },
  {
    description: "上线前充分验证与调优，降低试错和运营成本",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i3.png",
    title: "更稳运行",
  },
  {
    description: "结合使用数据持续迭代，长期提升业务效果",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i4.png",
    title: "持续进化",
  },
] as const;

export function SkillDeliveryBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="ai-skill-delivery">
      <button
        aria-haspopup="dialog"
        className="ai-skill-delivery-banner"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="ai-skill-delivery-banner__main">
          <img
            alt=""
            aria-hidden="true"
            className="ai-skill-delivery-banner__icon"
            draggable={false}
            src="https://b5.bokr.com.cn/dist/ui/skill_zan.png"
          />
          <span className="ai-skill-delivery-banner__copy">
            <span className="ai-skill-delivery-banner__title">交付专家深度共创服务</span>
            <span className="ai-skill-delivery-banner__description">
              贴近业务现场，共同打造并持续优化专属 Agent
            </span>
          </span>
        </span>
        <span className="ai-skill-delivery-banner__action">
          了解详情
          <HugeiconsIcon
            color="currentColor"
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </span>
      </button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          aria-describedby="ai-skill-delivery-dialog-description"
          className="ai-skill-delivery ai-skill-delivery-dialog"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="ai-skill-delivery-dialog__header">
            <DialogTitle className="ai-skill-delivery-dialog__title">
              交付专家深度共创，
              <span className="ai-skill-delivery-dialog__title-accent">
                让 AI 真正走进业务
              </span>
            </DialogTitle>
            <DialogDescription
              className="ai-skill-delivery-dialog__subtitle"
              id="ai-skill-delivery-dialog-description"
            >
              由交付专家贴近业务现场，共同定义、搭建并持续优化专属 Agent
            </DialogDescription>
          </div>

          <div aria-label="交付流程" className="ai-skill-delivery-steps">
            {DELIVERY_STEPS.map((step, index) => (
              <div className="ai-skill-delivery-step-wrap" key={step.title}>
                <article className="ai-skill-delivery-step">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="ai-skill-delivery-step__number"
                    draggable={false}
                    src={step.numberImage}
                  />
                  <img
                    alt=""
                    aria-hidden="true"
                    className="ai-skill-delivery-step__icon"
                    draggable={false}
                    src={step.iconImage}
                  />
                  <h3 className="ai-skill-delivery-step__title">{step.title}</h3>
                  <p className="ai-skill-delivery-step__description">{step.description}</p>
                </article>
                {index < DELIVERY_STEPS.length - 1 ? (
                  <span aria-hidden="true" className="ai-skill-delivery-step__arrow" />
                ) : null}
              </div>
            ))}
          </div>

          <section aria-label="服务价值" className="ai-skill-delivery-values">
            <h3 className="ai-skill-delivery-values__heading">让 Agent 更快创造业务价值</h3>
            <div className="ai-skill-delivery-values__grid">
              {DELIVERY_VALUES.map((item) => (
                <article className="ai-skill-delivery-value" key={item.title}>
                  <img
                    alt=""
                    aria-hidden="true"
                    className="ai-skill-delivery-value__icon"
                    draggable={false}
                    src={item.iconImage}
                  />
                  <div className="ai-skill-delivery-value__copy">
                    <h4 className="ai-skill-delivery-value__title">{item.title}</h4>
                    <p className="ai-skill-delivery-value__description">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </DialogContent>
      </Dialog>
    </div>
  );
}
