import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeSmartsheetFieldMappings } from "./config";
import { SmartsheetWriteConfig } from "./panel";

export const smartsheetWriteUi: WorkflowNodeUiBinding<"smartsheet-write"> = {
  body: {
    getFields: (data) => {
      const configuredCount = normalizeSmartsheetFieldMappings(data.fieldMappings).length;
      return [{
        id: "fields",
        label: "字段",
        value: configuredCount > 0
          ? { kind: "text", text: `已设置 ${configuredCount} 个` }
          : { kind: "empty" },
      }];
    },
    kind: "fields",
  },
  settings: { component: SmartsheetWriteConfig, kind: "custom" },
};
