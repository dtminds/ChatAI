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
    description: "深入理解业务目标与场景，明确需求与策略",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i1.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f1.png",
    title: "需求梳理",
  },
  {
    description: "配置与开发智能体，集成知识与工具，完成交付准备",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i2.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f2.png",
    title: "方案实施",
  },
  {
    description: "测试与调优，确保效果稳定可靠",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i3.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f3.png",
    title: "测试优化",
  },
  {
    description: "数据驱动持续迭代优化体验",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_i4.png",
    numberImage: "https://b5.bokr.com.cn/dist/ui/skill_sub_f4.png",
    title: "持续运营",
  },
] as const;

const DELIVERY_VALUES = [
  {
    description: "专业方法论与标准流程，缩短项目周期",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i1.png",
    title: "更快落地",
  },
  {
    description: "经验沉淀与方案优化，效果稳定可衡量",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i2.png",
    title: "更高效果",
  },
  {
    description: "标准化流程与工具，降低试错与运营成本",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i3.png",
    title: "更低成本",
  },
  {
    description: "持续迭代与运营支持，构建长期竞争力",
    iconImage: "https://b5.bokr.com.cn/dist/ui/skill_val_i4.png",
    title: "更可持续",
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
            <span className="ai-skill-delivery-banner__title">定制交付服务</span>
            <span className="ai-skill-delivery-banner__description">
              提供从方案设计、配置实施到测试优化的专业服务
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
        >
          <div className="ai-skill-delivery-dialog__header">
            <DialogTitle className="ai-skill-delivery-dialog__title">
              全链路交付服务，
              <span className="ai-skill-delivery-dialog__title-accent">
                助力 Agent 高效落地
              </span>
            </DialogTitle>
            <DialogDescription
              className="ai-skill-delivery-dialog__subtitle"
              id="ai-skill-delivery-dialog-description"
            >
              提供从方案设计、配置实施到测试优化的专业服务
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

          <section aria-label="为您带来的价值" className="ai-skill-delivery-values">
            <h3 className="ai-skill-delivery-values__heading">为您带来的价值</h3>
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
