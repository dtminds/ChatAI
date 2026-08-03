import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillPreviewEditResourcesDialog } from "@/pages/chat/ai-hosting/ai-skill-preview-edit-resources-dialog";

const kbServiceMock = vi.hoisted(() => ({ listKbs: vi.fn() }));
const customFieldServiceMock = vi.hoisted(() => ({ listCustomFields: vi.fn() }));
const workTagServiceMock = vi.hoisted(() => ({
  listWorkTagGroups: vi.fn(),
  listWorkTags: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/api/kb-service", () => ({
  listKbs: kbServiceMock.listKbs,
  toKbListViewItem: (item: {
    createdAt: string;
    description: string;
    kbId: string;
    name: string;
    updatedAt: string;
  }) => ({
    createdAt: item.createdAt,
    description: item.description,
    id: item.kbId,
    lastUpdatedAt: item.updatedAt,
    name: item.name,
  }),
}));
vi.mock("@/pages/chat/ai-hosting/api/custom-field-service", () => ({
  listCustomFields: customFieldServiceMock.listCustomFields,
}));
vi.mock("@/pages/chat/ai-hosting/api/work-tag-service", () => ({
  listWorkTagGroups: workTagServiceMock.listWorkTagGroups,
  listWorkTags: workTagServiceMock.listWorkTags,
}));
vi.mock("@/pages/chat/ai-hosting/api/cdp-tag-service", () => ({
  listCdpTagGroups: vi.fn(),
}));
vi.mock("@/pages/chat/ai-hosting/api/system-variable-service", () => ({
  listSystemVariables: vi.fn(),
}));

describe("SkillPreviewEditResourcesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kbServiceMock.listKbs.mockImplementation(async ({ page }: { page?: number }) => ({
      kbs: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          description: "",
          kbId: String(page ?? 1),
          name: `知识库 ${page ?? 1}`,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      pagination: {
        page: page ?? 1,
        pageSize: 100,
        total: 101,
      },
    }));
    customFieldServiceMock.listCustomFields.mockResolvedValue({
      fields: [
        { id: 1, key: "gender", options: [], sort: 1, title: "性别", type: 1 },
      ],
    });
    workTagServiceMock.listWorkTagGroups.mockResolvedValue({
      groups: [{ attr: 1, id: 11, name: "意向标签", tagCount: 1 }],
    });
  });

  it("deduplicates identical resource option requests while loading all pages", async () => {
    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[
          buildEditableResource("knowledge_base", "知识库一"),
          buildEditableResource("knowledge_base", "知识库二"),
          buildEditableResource("variable", "字段一", "custom_field"),
          buildEditableResource("variable", "字段二", "custom_field"),
          buildEditableResource("variable", "标签一", "work_tag"),
          buildEditableResource("variable", "标签二", "work_tag"),
        ]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
      />,
    );

    await screen.findByRole("heading", { name: "编辑资源" });
    await waitFor(() => {
      expect(screen.getAllByRole("combobox")).toHaveLength(6);
    });

    expect(kbServiceMock.listKbs).toHaveBeenCalledTimes(2);
    expect(kbServiceMock.listKbs).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 100,
    });
    expect(kbServiceMock.listKbs).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 100,
    });
    expect(customFieldServiceMock.listCustomFields).toHaveBeenCalledTimes(1);
    expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledTimes(1);
  });

  it("disables tag groups already used by content or another preview field", async () => {
    const user = userEvent.setup();
    workTagServiceMock.listWorkTagGroups.mockResolvedValue({
      groups: [
        { attr: 1, id: 11, name: "已有标签组", tagCount: 1 },
        { attr: 1, id: 12, name: "可选标签组", tagCount: 1 },
      ],
    });
    const editableResources = [
      buildEditableResource("variable", "标签一", "work_tag"),
      buildEditableResource("variable", "标签二", "work_tag"),
    ];

    render(
      <SkillPreviewEditResourcesDialog
        content={
          '<resource type="variable" variableType="work_tag" variableId="11" name="企微标签 · 已有标签组" />' +
          editableResources.map((item) => item.segment.placeholder).join("")
        }
        editableResources={editableResources}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
      />,
    );

    const comboboxes = await screen.findAllByRole("combobox");
    await user.click(comboboxes[0]!);
    expect(screen.getByRole("option", { name: "已有标签组" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByRole("option", { name: "可选标签组" }));

    await user.click(comboboxes[1]!);
    expect(screen.getByRole("option", { name: "已有标签组" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "可选标签组" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

function buildEditableResource(
  kind: "knowledge_base" | "variable",
  name: string,
  variableType: "custom_field" | "work_tag" | null = null,
) {
  const placeholder =
    kind === "knowledge_base"
      ? `<resource type="knowledge_base" kbId="" name="${name}" />`
      : `<resource type="variable" variableType="${variableType ?? ""}" variableId="" name="${name}" />`;

  return {
    fieldLabel: name,
    segment: {
      id: placeholder,
      kind,
      name,
      placeholder,
      type: "resource" as const,
    },
    variableType,
  };
}
