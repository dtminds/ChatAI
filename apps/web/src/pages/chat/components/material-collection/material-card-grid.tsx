import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { MaterialCard } from "@/pages/chat/components/material-collection/material-card";
import { MaterialLibraryFooter } from "@/pages/chat/components/material-collection/material-library-footer";
import type {
  MaterialCollectionGroup,
  MaterialCollectionItem,
} from "@/pages/chat/components/material-collection/material-types";
import { useNullableMaterialSelection } from "@/pages/chat/components/material-collection/use-nullable-material-selection";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionGroupCreateRequest,
} from "@chatai/contracts";

type MaterialCardGridProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  hasMoreItems: boolean;
  isBusy: boolean;
  isLoadingMoreItems: boolean;
  isSending?: boolean;
  items: MaterialCollectionItem[];
  onCancel: () => void;
  onDeleteMaterial: (item: MaterialCollectionItem) => void;
  onEditMaterial: (item: MaterialCollectionItem) => void;
  onLoadMoreItems?: () => void;
  onMoveMaterial: (item: MaterialCollectionItem, groupId: string) => void;
  onSendMaterial: (item: MaterialCollectionItem) => void;
  onTopMaterial: (item: MaterialCollectionItem) => void;
};

export function MaterialCardGrid({
  bizType,
  groups,
  hasMoreItems,
  isBusy,
  isLoadingMoreItems,
  isSending = false,
  items,
  onCancel,
  onDeleteMaterial,
  onEditMaterial,
  onLoadMoreItems,
  onMoveMaterial,
  onSendMaterial,
  onTopMaterial,
}: MaterialCardGridProps) {
  const { selectedItem, selectedItemId, toggleItemSelection } =
    useNullableMaterialSelection(items);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        aria-label="素材内容列表"
        className="min-h-0 flex-1 h-full"
        role="region"
      >
        <div className="mx-auto p-8" style={getLibraryBodyStyle(bizType)}>
          <div
            aria-label="收录内容列表"
            className="grid items-start gap-4"
            style={getLibraryGridStyle(bizType)}
          >
            {items.map((item) => (
              <div className="max-w-full" key={item.id}>
                <MaterialCard
                  className={
                    isCardLibraryBizType(bizType) ? getCardLibraryItemClassName(bizType) : undefined
                  }
                  groups={groups}
                  item={item}
                  onDelete={onDeleteMaterial}
                  onEdit={onEditMaterial}
                  onMove={onMoveMaterial}
                  onToggleSelect={() => toggleItemSelection(item.id)}
                  onTop={onTopMaterial}
                  selected={selectedItemId === item.id}
                  selectionMode="toggle"
                />
              </div>
            ))}
          </div>
          {hasMoreItems ? (
            <div className="mt-5 flex justify-center">
              <Button
                className="h-8 gap-2 px-3 text-[13px]"
                disabled={isBusy || isLoadingMoreItems}
                onClick={onLoadMoreItems}
                type="button"
                variant="ghost"
              >
                {isLoadingMoreItems ? (
                  <Spinner className="text-current" size={14} />
                ) : null}
                加载更多
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <MaterialLibraryFooter
        canSend={selectedItem != null}
        isBusy={isBusy}
        isSending={isSending}
        onCancel={onCancel}
        onSend={() => {
          if (selectedItem) {
            onSendMaterial(selectedItem);
          }
        }}
      />
    </div>
  );
}

function isCardLibraryBizType(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  return (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
  );
}

function getCardLibraryItemClassName(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
  ) {
    return "w-[217px]";
  }

  return "w-[210px]";
}

function getLibraryBodyStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (isCardLibraryBizType(bizType)) {
    return {
      maxWidth: "100%",
      width: "59.5rem",
    } as const;
  }

  return {
    maxWidth: "100%",
    width: "45rem",
  } as const;
}

function getLibraryGridStyle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (isCardLibraryBizType(bizType)) {
    return {
      gap: "16px",
      gridTemplateColumns: "repeat(4, 210px)",
      width: "888px",
    } as const;
  }

  return {
    gap: "16px",
    gridTemplateColumns: "repeat(2, 20rem)",
    maxWidth: "100%",
    width: "41rem",
  } as const;
}
