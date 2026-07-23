import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { InsightCapabilitiesResponse } from "@chatai/contracts";
import { Link, Outlet, matchPath, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getInsightCapabilities } from "./api/insights-service";
import { InsightsLayout } from "./insights-layout";

type InsightsCapabilitiesContextValue = {
  capabilities: InsightCapabilitiesResponse;
  refresh: () => Promise<void>;
};

const InsightsCapabilitiesContext = createContext<InsightsCapabilitiesContextValue | null>(null);

const aiOnlyPaths = [
  "/chat/insights/business",
  "/chat/insights/follow-ups",
  "/chat/insights/quality",
] as const;

export function InsightsCapabilitiesRoute() {
  const location = useLocation();
  const [capabilities, setCapabilities] = useState<InsightCapabilitiesResponse>();
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setError(false);
    try {
      setCapabilities(await getInsightCapabilities());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!capabilities) {
    return (
      <InsightsLayout title="会话洞察">
        <div className="flex min-h-[420px] items-center justify-center">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">能力状态加载失败</p>
              <Button className="mt-4" onClick={() => void refresh()} variant="outline">
                重试
              </Button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner size={18} variant="classic" />
              <span>正在加载</span>
            </div>
          )}
        </div>
      </InsightsLayout>
    );
  }

  const isAiOnlyPath = aiOnlyPaths.some((path) =>
    matchPath({ end: true, path }, location.pathname)
  );

  if (capabilities.mode === "basic" && isAiOnlyPath) {
    return (
      <InsightsLayout
        canViewWorkerObservability={capabilities.canViewWorkerObservability}
        title="会话洞察"
      >
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold">请先开启会话洞察</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              开启后可使用服务质检、待处理和业务洞察
            </p>
            {capabilities.canManageInsights && capabilities.insightAvailable ? (
              <Button asChild className="mt-5">
                <Link to="/chat/insights/settings">前往洞察配置</Link>
              </Button>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {capabilities.canManageInsights ? "当前账号暂未开通会话洞察" : "请联系管理员开启"}
              </p>
            )}
          </div>
        </div>
      </InsightsLayout>
    );
  }

  return (
    <InsightsCapabilitiesContext.Provider value={{ capabilities, refresh }}>
      <Outlet />
    </InsightsCapabilitiesContext.Provider>
  );
}

export function useInsightsCapabilities() {
  const value = useContext(InsightsCapabilitiesContext);

  if (!value) {
    throw new Error("useInsightsCapabilities must be used within InsightsCapabilitiesRoute");
  }

  return value;
}
