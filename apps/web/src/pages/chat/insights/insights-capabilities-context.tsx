import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { InsightCapabilitiesResponse } from "@chatai/contracts";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getInsightCapabilities } from "./api/insights-service";
import { InsightsLayout } from "./insights-layout";

type InsightsCapabilitiesContextValue = {
  capabilities: InsightCapabilitiesResponse;
  refresh: () => Promise<void>;
};

const InsightsCapabilitiesContext = createContext<InsightsCapabilitiesContextValue | null>(null);

export function InsightsCapabilitiesRoute() {
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
