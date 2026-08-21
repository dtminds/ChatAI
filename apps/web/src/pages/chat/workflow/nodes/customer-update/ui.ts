import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeCustomerUpdateFields } from "./config";
import { CustomerUpdateConfig } from "./panel";

export const customerUpdateNodeUi: WorkflowNodeUiBinding<"customer-update"> = {
  body: {
    getFields: (data) => {
      const fields = normalizeCustomerUpdateFields(data.fields);
      const configuredCount = fields.filter(field => field.field).length;
      return [{
        id: "fields",
        label: "客户属性",
        value: configuredCount > 0
          ? { kind: "text", text: `已设置 ${configuredCount} 个` }
          : { kind: "empty" },
      }];
    },
    kind: "fields",
  },
  settings: { component: CustomerUpdateConfig, kind: "custom" },
};
