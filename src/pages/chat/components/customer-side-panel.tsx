import type { PointerEvent as ReactPointerEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CustomerSystemPanel } from "@/pages/chat/components/customer-system-panel";
import type { CustomerProfile } from "@/pages/chat/chat-types";

type CustomerSidePanelProps = {
  accountName?: string;
  customer?: CustomerProfile;
  isResizing: boolean;
  panelWidth: number;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function CustomerSidePanel({
  accountName,
  customer,
  isResizing,
  panelWidth,
  onResizeStart,
}: CustomerSidePanelProps) {
  return (
    <>
      <button
        aria-label="调整客户信息栏宽度"
        className={cn(
          "relative hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-white transition-colors xl:flex",
          isResizing ? "bg-[#f5f8fd]" : "hover:bg-[#f7f9fc]",
        )}
        onPointerDown={onResizeStart}
        type="button"
      >
        <span
          className={cn(
            "h-full w-px bg-[#EEEFF0] transition-colors",
            isResizing && "bg-[#9cbcf8]",
          )}
        />
      </button>

      <aside
        className="hidden min-h-0 min-w-0 flex-col bg-white xl:flex"
        style={{ width: `${panelWidth}px` }}
      >
        <Tabs className="h-full min-h-0 gap-0" defaultValue="system">
          <div className="border-b border-[#EEEFF0] px-4">
            <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
              <TabsTrigger
                className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="system"
              >
                系统
              </TabsTrigger>
              <TabsTrigger
                className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="baidu"
              >
                百度
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value="system">
            <CustomerSystemPanel accountName={accountName} customer={customer} />
          </TabsContent>

          <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="baidu">
            <iframe
              className="h-full w-full border-0 bg-white"
              src="https://www.baidu.com"
              title="百度客户扩展页"
            />
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}
