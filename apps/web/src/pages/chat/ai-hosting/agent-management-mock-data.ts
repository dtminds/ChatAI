export type ApplicationScopeAccount = {
  associatedAgentId: string | null;
  autoHostingEnabled: boolean;
  id: string;
  name: string;
  scriptRecommendationEnabled: boolean;
};

export const mockApplicationScopeAccounts: ApplicationScopeAccount[] = [
  {
    id: "wecom-account-1",
    name: "小助理1",
    associatedAgentId: null,
    autoHostingEnabled: false,
    scriptRecommendationEnabled: false,
  },
  {
    id: "wecom-account-2",
    name: "小助理2",
    associatedAgentId: "agent-skincare",
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
  {
    id: "wecom-account-3",
    name: "小助理3",
    associatedAgentId: "agent-makeup",
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
];
