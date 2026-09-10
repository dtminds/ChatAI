import type { AiHostingModel } from "@chatai/contracts";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AI_BILLING_SUBSCRIPTION_PATH,
  agentAiCreditBillingItems,
  insightAiCreditBillingItems,
  workflowAiCreditBillingItems,
} from "@/pages/chat/billing/ai-credit-billing";
import { formatCreditMultiplier } from "./ai-model-select";
import { AgentModelBadge } from "./agent-model-badge";
import { listAiHostingModels } from "./agent-service";
import { AiHostingLayout } from "./ai-hosting-layout";

export function AiBillingGuidePage() {
  return (
    <AiHostingLayout title="计费说明">
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <Button
            aria-label="返回订阅"
            asChild
            className="-ml-2 size-9 shrink-0 rounded-[8px]"
            size="icon"
            variant="ghost"
          >
            <Link to={AI_BILLING_SUBSCRIPTION_PATH}>
              <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.8} />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight text-foreground">计费说明</h1>
          </div>
        </header>

        <section className="rounded-[8px] border border-primary/20 bg-primary/5 px-5 py-4" aria-label="计费公式">
          <h2 className="text-sm font-semibold text-foreground">计费公式</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            实际消耗积分 = 基础积分 * 模型倍率
          </p>
        </section>

        <BillingTable />

        <ModelMultiplierTable />
      </div>
    </AiHostingLayout>
  );
}

function ModelMultiplierTable() {
  const [models, setModels] = useState<AiHostingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setLoading(true);
      setLoadFailed(false);

      try {
        const response = await listAiHostingModels();
        if (!cancelled) setModels(response.models);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <section className="rounded-[8px] border p-5" aria-labelledby="model-multiplier-title">
      <h2 className="text-base font-semibold text-foreground" id="model-multiplier-title">模型倍率</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        不同模型按倍率计费，实际消耗积分 = 基础积分 × 模型倍率
      </p>
      <div className="mt-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-muted-foreground" role="status">
            <Spinner />
            <span>正在加载</span>
          </div>
        ) : loadFailed ? (
          <div className="py-5 text-center">
            <Button onClick={() => setReloadKey((current) => current + 1)} size="sm" variant="outline">
              重新加载
            </Button>
          </div>
        ) : models.length === 0 ? (
          <div className="py-5 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <ul aria-label="模型倍率" className="space-y-2">
            {models.map((model) => (
              <li
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-5 rounded-[8px] border px-4 py-3"
                key={model.id}
              >
                <AgentModelBadge className="text-sm font-medium text-foreground" label={model.label} model={model.model} />
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {model.description || "-"}
                </span>
                <span className="inline-flex h-8 min-w-20 items-center justify-center rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary tabular-nums">
                  {formatCreditMultiplier(model.creditMultiplier)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BillingTable() {
  return (
    <section className="rounded-[8px] border p-5" aria-labelledby="base-credit-title">
      <h2 className="text-base font-semibold text-foreground" id="base-credit-title">基础积分</h2>
      <div className="mt-3">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[30%]">模块</TableHead>
              <TableHead className="w-[15%]">基础积分</TableHead>
              <TableHead className="w-[15%]">计费单位</TableHead>
              <TableHead className="w-[40%]">备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <BillingGroup items={agentAiCreditBillingItems} title="Agent" />
            <BillingGroup items={workflowAiCreditBillingItems} title="工作流" />
            <BillingGroup items={insightAiCreditBillingItems} title="洞察" />
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function BillingGroup({
  items,
  title,
}: {
  items: readonly {
    credits: string;
    id: string;
    name: string;
    note: string;
    unit: string;
  }[];
  title: string;
}) {
  return (
    <>
      <TableRow className="border-b-0 border-t hover:bg-transparent">
        <TableCell className="pb-2 pt-6 font-semibold text-foreground" colSpan={4}>
          {title}
        </TableCell>
      </TableRow>
      {items.map((item) => (
        <TableRow className="border-b-0" key={item.id}>
          <TableCell className="py-3 font-medium text-muted-foreground">{item.name}</TableCell>
          <TableCell className="font-medium tabular-nums">{item.credits} 积分</TableCell>
          <TableCell className="text-foreground">{item.unit}</TableCell>
          <TableCell className="text-muted-foreground">{item.note}</TableCell>
        </TableRow>
      ))}
    </>
  );
}
