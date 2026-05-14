import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CustomerBasicInfoPanel } from "@/pages/chat/components/customer-basic-info-panel";
import { GroupMembersSidePanel } from "@/pages/chat/components/group-members-side-panel";
import type {
  ChatMode,
  CustomerProfile,
  GroupMember,
} from "@/pages/chat/chat-types";
import type { SettingsSidebarItem } from "@chatai/contracts";
import { fetchWorkbenchSidebarTuseCrypto } from "@/pages/chat/api/sidebar-tuse-crypto";
import { buildSidebarIframeSrc } from "@/pages/chat/lib/sidebar-iframe-url";
import { sortSidebarItems } from "@/pages/chat/lib/sidebar-items";
import {
  encryptTuseFswFromThirdExternalUserId,
  encryptTuseRdFromThirdUserId,
  encryptTuseTsFromUnixSeconds,
} from "@/lib/tuse-crypto";

const collapsedSidebarEntryCount = 4;
const sidebarExpandedStorageKey = "chatai.customerSidePanel.sidebarExpanded";

type CustomerSidePanelProps = {
  accountName?: string;
  conversationMode?: ChatMode;
  /** 当前会话三方用户标识，会附加到自定义侧栏 iframe 的查询串 */
  sidebarIframeThirdExternalUserId?: string;
  sidebarIframeThirdUserId?: string;
  customer?: CustomerProfile;
  groupMembers: GroupMember[];
  isGroupMembersLoading: boolean;
  isResizing: boolean;
  panelWidth: number;
  sidebarItems?: SettingsSidebarItem[];
  onRefreshGroupMembers: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function CustomerSidePanel({
  accountName,
  conversationMode,
  customer,
  sidebarIframeThirdExternalUserId,
  sidebarIframeThirdUserId,
  groupMembers,
  isGroupMembersLoading,
  isResizing,
  panelWidth,
  sidebarItems = [],
  onRefreshGroupMembers,
  onResizeStart,
}: CustomerSidePanelProps) {
  const isGroupConversation = conversationMode === "group";
  type TuseSecretCache =
    | { kind: "ready"; value: { iv: string; key: string } | null }
    | { kind: "unset" };
  const tuseSecretCacheRef = useRef<TuseSecretCache>({ kind: "unset" });

  const hasActiveCustomSidebar = useMemo(
    () => sortSidebarItems(sidebarItems).some((item) => item.status === "active"),
    [sidebarItems],
  );

  const hasSidebarIframeThirdIds = useMemo(
    () =>
      Boolean(
        (sidebarIframeThirdUserId !== undefined && sidebarIframeThirdUserId !== "") ||
          (sidebarIframeThirdExternalUserId !== undefined && sidebarIframeThirdExternalUserId !== ""),
      ),
    [sidebarIframeThirdExternalUserId, sidebarIframeThirdUserId],
  );

  const needsSidebarTuseSecrets = hasActiveCustomSidebar && hasSidebarIframeThirdIds;

  const [tuseSecrets, setTuseSecrets] = useState<
    { iv: string; key: string } | null | undefined
  >(undefined);

  useEffect(() => {
    if (!needsSidebarTuseSecrets) {
      tuseSecretCacheRef.current = { kind: "unset" };
      setTuseSecrets(undefined);

      return;
    }

    if (tuseSecretCacheRef.current.kind === "ready") {
      setTuseSecrets(tuseSecretCacheRef.current.value);

      return;
    }

    let cancelled = false;

    setTuseSecrets(undefined);

    void (async () => {
      try {
        const dto = await fetchWorkbenchSidebarTuseCrypto();

        if (cancelled) {
          return;
        }

        const next =
          dto?.secret?.trim() && dto?.ivParameter?.trim()
            ? { key: dto.secret.trim(), iv: dto.ivParameter.trim() }
            : null;
        tuseSecretCacheRef.current = { kind: "ready", value: next };
        setTuseSecrets(next);
      } catch {
        if (!cancelled) {
          tuseSecretCacheRef.current = { kind: "ready", value: null };
          setTuseSecrets(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsSidebarTuseSecrets]);

  const [sidebarIframeCrypto, setSidebarIframeCrypto] = useState<{
    rd?: string;
    fsw?: string;
    ts: string;
  } | null>(null);
  const [isSidebarIframeCryptoReady, setIsSidebarIframeCryptoReady] = useState(true);

  const tuseKey = tuseSecrets?.key;
  const tuseIv = tuseSecrets?.iv;
  const tuseSecretsReady = Boolean(tuseKey && tuseIv);

  useEffect(() => {
    let cancelled = false;

    if (!needsSidebarTuseSecrets) {
      setIsSidebarIframeCryptoReady(true);
      setSidebarIframeCrypto(null);

      return;
    }

    if (tuseSecrets === undefined) {
      setIsSidebarIframeCryptoReady(false);
      setSidebarIframeCrypto(null);

      return;
    }

    if (!tuseSecretsReady || (!sidebarIframeThirdUserId && !sidebarIframeThirdExternalUserId)) {
      setIsSidebarIframeCryptoReady(true);
      setSidebarIframeCrypto(null);

      return;
    }

    setIsSidebarIframeCryptoReady(false);

    const tsMs = Date.now();

    void (async () => {
      try {
        const rd =
          sidebarIframeThirdUserId !== undefined && sidebarIframeThirdUserId !== ""
            ? await encryptTuseRdFromThirdUserId(tuseKey!, tuseIv!, sidebarIframeThirdUserId)
            : undefined;
        const fsw =
          sidebarIframeThirdExternalUserId !== undefined && sidebarIframeThirdExternalUserId !== ""
            ? await encryptTuseFswFromThirdExternalUserId(
                tuseKey!,
                tuseIv!,
                sidebarIframeThirdExternalUserId,
              )
            : undefined;

        const ts = await encryptTuseTsFromUnixSeconds(
          tuseKey!,
          tuseIv!,
          Math.floor(tsMs / 1000),
        );

        if (!cancelled) {
          setSidebarIframeCrypto({ ...(rd !== undefined ? { rd } : {}), ...(fsw !== undefined ? { fsw } : {}), ts });
        }
      } catch {
        if (!cancelled) {
          setSidebarIframeCrypto(null);
        }
      } finally {
        if (!cancelled) {
          setIsSidebarIframeCryptoReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    needsSidebarTuseSecrets,
    sidebarIframeThirdExternalUserId,
    sidebarIframeThirdUserId,
    tuseIv,
    tuseKey,
    tuseSecrets,
    tuseSecretsReady,
  ]);

  const sidebarIframeSrcForUrl = useMemo(
    () => (url: string) =>
      buildSidebarIframeSrc(url, {
        thirdExternalUserId: sidebarIframeThirdExternalUserId,
        thirdUserId: sidebarIframeThirdUserId,
        ...(sidebarIframeCrypto ?? {}),
      }),
    [
      sidebarIframeCrypto,
      sidebarIframeThirdExternalUserId,
      sidebarIframeThirdUserId,
    ],
  );
  const activeSidebarItems = sortSidebarItems(sidebarItems).filter(
    (item) => item.status === "active",
  );
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(readSidebarExpandedPreference);
  const sidebarEntries = [
    { id: "system", kind: "system" as const, name: "基础信息", value: "system" },
    ...activeSidebarItems.map((item) => ({
      id: item.id,
      item,
      kind: "custom" as const,
      name: item.name,
      value: getSidebarTabValue(item),
    })),
  ];
  const hasOverflowSidebarEntries = sidebarEntries.length > collapsedSidebarEntryCount;
  const visibleSidebarEntries = isSidebarExpanded
    ? sidebarEntries
    : sidebarEntries.slice(0, collapsedSidebarEntryCount);

  return (
    <>
      <button
        aria-label="调整客户信息栏宽度"
        className={cn(
          "relative flex w-1 shrink-0 cursor-col-resize items-stretch justify-center bg-surface",
          isResizing ? "bg-accent" : "hover:bg-surface-hover",
        )}
        onPointerDown={onResizeStart}
        type="button"
      >
        <span
          className={cn(
            "h-full w-px bg-divider",
            isResizing && "bg-primary/45",
          )}
        />
      </button>

      <aside
        aria-label={isGroupConversation ? "群成员信息栏" : "客户信息栏"}
        className="flex min-h-0 min-w-0 flex-col bg-surface"
        style={{ width: `${panelWidth}px` }}
      >
        <Tabs className="h-full min-h-0 gap-0" defaultValue="system">
          <div className="flex items-start gap-4 border-b border-divider px-4 py-2">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-x-4 gap-y-1 rounded-none bg-transparent p-0">
              {visibleSidebarEntries.map((entry) => (
                <TabsTrigger
                  className="h-10 min-w-0 rounded-none bg-transparent px-0 py-2 text-[13px] font-medium text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  key={`${entry.kind}:${entry.id}`}
                  value={entry.value}
                >
                  <span className="truncate">{entry.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {hasOverflowSidebarEntries ? (
              <button
                className="h-10 shrink-0 px-0 py-2 text-[13px] font-medium text-primary hover:text-primary/85 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                onClick={() => {
                  setIsSidebarExpanded((current) => {
                    const nextValue = !current;
                    writeSidebarExpandedPreference(nextValue);

                    return nextValue;
                  });
                }}
                type="button"
              >
                {isSidebarExpanded ? "收起" : "展开"}
              </button>
            ) : null}
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value="system">
            {isGroupConversation ? (
              <GroupMembersSidePanel
                groupMembers={groupMembers}
                isLoading={isGroupMembersLoading}
                onRefresh={onRefreshGroupMembers}
              />
            ) : (
              <CustomerBasicInfoPanel accountName={accountName} customer={customer} />
            )}
          </TabsContent>

          {activeSidebarItems.map((item) => (
            <TabsContent
              className="mt-0 min-h-0 flex-1 overflow-hidden"
              key={item.id}
              value={getSidebarTabValue(item)}
            >
              <iframe
                className="h-full w-full border-0 bg-background"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin allow-forms"
                src={
                  isSidebarIframeCryptoReady
                    ? sidebarIframeSrcForUrl(item.url) + '&mid=2038815948395253760'
                    : "about:blank"
                }
                title={`${item.name}扩展页`}
              />
            </TabsContent>
          ))}
        </Tabs>
      </aside>
    </>
  );
}

function getSidebarTabValue(item: SettingsSidebarItem) {
  return `sidebar:${item.id}`;
}

function readSidebarExpandedPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(sidebarExpandedStorageKey) === "true";
}

function writeSidebarExpandedPreference(isExpanded: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(sidebarExpandedStorageKey, String(isExpanded));
}
