import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillPreviewEditResourcesDialog } from "@/pages/chat/ai-hosting/ai-skill-preview-edit-resources-dialog";

const kbServiceMock = vi.hoisted(() => ({ listKbs: vi.fn() }));
const customFieldServiceMock = vi.hoisted(() => ({ listCustomFields: vi.fn() }));
const workTagServiceMock = vi.hoisted(() => ({
  listWorkTagGroups: vi.fn(),
  listWorkTags: vi.fn(),
}));
const cdpTagServiceMock = vi.hoisted(() => ({
  listCdpTagGroups: vi.fn(),
}));
const systemVariableServiceMock = vi.hoisted(() => ({
  listSystemVariables: vi.fn(),
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
  listCdpTagGroups: cdpTagServiceMock.listCdpTagGroups,
}));
vi.mock("@/pages/chat/ai-hosting/api/system-variable-service", () => ({
  listSystemVariables: systemVariableServiceMock.listSystemVariables,
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
    workTagServiceMock.listWorkTags.mockResolvedValue({
      pagination: { hasNext: false, page: 1, pageSize: 100, total: 2 },
      tags: [
        {
          groupAttr: 1,
          groupId: 11,
          groupName: "意向标签",
          groupSort: 1,
          id: 101,
          name: "高意向",
        },
        {
          groupAttr: 1,
          groupId: 11,
          groupName: "意向标签",
          groupSort: 1,
          id: 102,
          name: "待跟进",
        },
      ],
    });
    cdpTagServiceMock.listCdpTagGroups.mockResolvedValue({
      groups: [
        {
          groupName: "价值分组",
          groupTag: "value_group",
          tags: [
            { name: "高价值", tag: "high_value" },
            { name: "低价值", tag: "low_value" },
          ],
        },
      ],
    });
    systemVariableServiceMock.listSystemVariables.mockResolvedValue({
      variables: [
        { key: "customer_nickname", name: "客户昵称" },
        { key: "current_agent_name", name: "当前接待 Agent" },
      ],
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
      expect(screen.getByRole("button", { name: "选择字段一" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "选择知识库一" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

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
    expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledTimes(2);
    expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledWith({
      attr: 1,
      type: 0,
    });
    expect(workTagServiceMock.listWorkTagGroups).toHaveBeenCalledWith({
      attr: 2,
      type: 0,
    });
  });

  it("allows confirming without selecting optional recommend resources", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[
          buildEditableResource("variable", "企微标签", "work_tag"),
          buildEditableResource("knowledge_base", "知识库"),
        ]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
      />,
    );

    await screen.findByRole("button", { name: "选择企微标签" });
    await user.click(getMainConfirmButton());

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        content: "",
        resources: {
          variables: [],
          tools: [],
          "knowledge-bases": [],
        },
      });
    });
  });

  it("disables tag groups already used by content or another preview field", async () => {
    const user = userEvent.setup();
    workTagServiceMock.listWorkTagGroups.mockResolvedValue({
      groups: [
        { attr: 1, id: 11, name: "已有标签组", tagCount: 1 },
        { attr: 1, id: 12, name: "可选标签组", tagCount: 1 },
      ],
    });
    workTagServiceMock.listWorkTags.mockImplementation(async ({ groupId }) => ({
      pagination: { hasNext: false, page: 1, pageSize: 100, total: 1 },
      tags: [
        {
          groupAttr: 1,
          groupId,
          groupName: groupId === 12 ? "可选标签组" : "已有标签组",
          groupSort: 1,
          id: groupId === 12 ? 201 : 101,
          name: groupId === 12 ? "可选标签" : "已有标签",
        },
      ],
    }));
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

    const firstPicker = await openResourcePicker(user, "标签一");
    expect(
      within(firstPicker).getByRole("button", { name: "已有标签组" }),
    ).toBeDisabled();
    await user.click(
      within(firstPicker).getByRole("button", { name: "可选标签组" }),
    );
    const firstTagList = await within(firstPicker).findByRole("group", {
      name: "标签一标签列表",
    });
    await user.click(within(firstTagList).getByText("可选标签"));
    await user.click(within(firstPicker).getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText(/已选：可选标签组/)).toBeInTheDocument();
    });

    const secondPicker = await openResourcePicker(user, "标签二");
    expect(
      within(secondPicker).getByRole("button", { name: "已有标签组" }),
    ).toBeDisabled();
    expect(
      within(secondPicker).getByRole("button", { name: "可选标签组" }),
    ).toBeDisabled();
  });

  it("switches wecom tag groups between normal and exclusive tabs", async () => {
    const user = userEvent.setup();
    workTagServiceMock.listWorkTagGroups.mockImplementation(async ({ attr }) => ({
      groups:
        attr === 2
          ? [{ attr: 2, id: 21, name: "互斥等级组", tagCount: 1 }]
          : [{ attr: 1, id: 11, name: "意向标签", tagCount: 1 }],
      tagLimit: 5,
    }));

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[buildEditableResource("variable", "企微标签", "work_tag")]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
      />,
    );

    const picker = await openResourcePicker(user, "企微标签");
    const root = within(picker).getByLabelText("选择企微标签");
    expect(within(root).getByRole("tab", { name: "普通标签" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(root).getByRole("button", { name: "意向标签" })).toBeInTheDocument();
    expect(within(root).queryByRole("button", { name: "互斥等级组" })).not.toBeInTheDocument();

    await user.click(within(root).getByRole("tab", { name: "互斥标签" }));
    expect(within(root).getByRole("tab", { name: "互斥标签" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(root).getByRole("button", { name: "互斥等级组" })).toBeInTheDocument();
    expect(within(root).queryByRole("button", { name: "意向标签" })).not.toBeInTheDocument();
  });

  it("lets users pick tags inside a selected wecom tag group with search and echo selection", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[buildEditableResource("variable", "企微标签", "work_tag")]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
      />,
    );

    const picker = await openResourcePicker(user, "企微标签");
    const root = within(picker).getByLabelText("选择企微标签");

    await user.type(within(root).getByLabelText("搜索标签组"), "意向");
    await user.click(within(root).getByRole("button", { name: "意向标签" }));

    expect(workTagServiceMock.listWorkTags).toHaveBeenCalledWith({
      groupId: 11,
      page: 1,
      pageSize: 100,
      type: 0,
    });

    const tagList = await within(picker).findByRole("group", {
      name: "企微标签标签列表",
    });
    await waitFor(() => {
      expect(within(tagList).getByText("高意向")).toBeInTheDocument();
    });
    await user.type(within(root).getByLabelText("搜索标签"), "高意");
    expect(within(tagList).getByText("高意向")).toBeInTheDocument();
    expect(within(tagList).queryByText("待跟进")).not.toBeInTheDocument();
    await user.clear(within(root).getByLabelText("搜索标签"));
    await user.click(within(tagList).getByText("高意向"));
    await user.click(within(tagList).getByText("待跟进"));
    await user.click(within(picker).getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText(/已选：意向标签 · 高意向、待跟进/)).toBeInTheDocument();
    });

    await user.click(getMainConfirmButton());
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.objectContaining({
            variables: [
              expect.objectContaining({
                variable: expect.objectContaining({
                  select_id: 11,
                  select_sub_ids: [101, 102],
                  type: "work_tag",
                }),
              }),
            ],
          }),
        }),
      );
    });
  });

  it("lets users search and pick custom fields, system variables, tools and knowledge bases", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[
          buildEditableResource("variable", "自定义属性", "custom_field"),
          buildEditableResource("variable", "系统变量", "system_variable"),
          {
            fieldLabel: "推荐工具",
            segment: {
              id: "tool-1",
              kind: "tool",
              name: "推荐工具",
              placeholder: '<resource type="tool" toolId="" name="推荐工具" />',
              type: "resource",
            },
            variableType: null,
          },
          buildEditableResource("knowledge_base", "知识库"),
        ]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
      />,
    );

    await screen.findByRole("heading", { name: "编辑资源" });

    const customPicker = await openResourcePicker(user, "自定义属性");
    const customFieldRoot = within(customPicker).getByLabelText("选择自定义属性");
    await user.type(within(customFieldRoot).getByLabelText("搜索自定义属性"), "性");
    await user.click(within(customFieldRoot).getByRole("option", { name: "性别" }));
    await user.click(within(customPicker).getByRole("button", { name: "确定" }));
    expect(await screen.findByText("已选：性别")).toBeInTheDocument();

    const systemPicker = await openResourcePicker(user, "系统变量");
    const systemRoot = within(systemPicker).getByLabelText("选择系统变量");
    await user.type(within(systemRoot).getByLabelText("搜索系统变量"), "昵称");
    expect(
      within(systemRoot).queryByRole("option", { name: "当前接待 Agent" }),
    ).not.toBeInTheDocument();
    await user.click(within(systemRoot).getByRole("option", { name: "客户昵称" }));
    await user.click(within(systemPicker).getByRole("button", { name: "确定" }));

    const toolPicker = await openResourcePicker(user, "推荐工具");
    const toolRoot = within(toolPicker).getByLabelText("选择推荐工具");
    await user.type(within(toolRoot).getByLabelText("搜索推荐工具"), "订单查询");
    await user.click(within(toolRoot).getByRole("option", { name: /订单查询/ }));
    await user.click(within(toolPicker).getByRole("button", { name: "确定" }));

    const kbPicker = await openResourcePicker(user, "知识库");
    const kbRoot = within(kbPicker).getByLabelText("选择知识库");
    await user.type(within(kbRoot).getByLabelText("搜索知识库"), "知识库 1");
    await user.click(within(kbRoot).getByRole("option", { name: "知识库 1" }));
    await user.click(within(kbPicker).getByRole("button", { name: "确定" }));

    await user.click(getMainConfirmButton());
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.objectContaining({
            variables: expect.arrayContaining([
              expect.objectContaining({
                variable: expect.objectContaining({
                  select_id: 1,
                  type: "custom_field",
                }),
              }),
              expect.objectContaining({
                variable: expect.objectContaining({
                  select_key: "customer_nickname",
                  type: "system_variable",
                }),
              }),
            ]),
            tools: [
              expect.objectContaining({
                toolKey: "search_order",
              }),
            ],
            "knowledge-bases": [
              expect.objectContaining({
                kbId: 1,
              }),
            ],
          }),
        }),
      );
    });
  });

  it("lets users pick a tag inside a selected auto-tag group", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[buildEditableResource("variable", "自动化标签", "auto_tag")]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        open
      />,
    );

    const picker = await openResourcePicker(user, "自动化标签");
    const root = within(picker).getByLabelText("选择自动化标签");
    await user.click(within(root).getByRole("button", { name: "价值分组" }));

    const tagList = await within(picker).findByRole("group", {
      name: "自动化标签标签列表",
    });
    await waitFor(() => {
      expect(within(tagList).getByText("高价值")).toBeInTheDocument();
    });
    await user.click(within(tagList).getByText("高价值"));
    await user.click(within(picker).getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText(/已选：价值分组 · 高价值/)).toBeInTheDocument();
    });

    await user.click(getMainConfirmButton());
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.objectContaining({
            variables: [
              expect.objectContaining({
                variable: expect.objectContaining({
                  select_key: "high_value",
                  type: "auto_tag",
                }),
              }),
            ],
          }),
        }),
      );
    });
  });

  it("opens direct-picker for a single recommend resource and confirms selection", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <SkillPreviewEditResourcesDialog
        content=""
        editableResources={[
          buildEditableResource("tool", "订单查询", null),
        ]}
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
        presentation="direct-picker"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "订单查询" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "编辑资源" }),
    ).not.toBeInTheDocument();

    const root = await screen.findByLabelText("选择订单查询");
    await user.click(within(root).getByRole("option", { name: /订单查询/ }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.objectContaining({
            tools: [
              expect.objectContaining({
                title: expect.stringContaining("订单"),
              }),
            ],
          }),
        }),
      );
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

async function openResourcePicker(
  user: ReturnType<typeof userEvent.setup>,
  fieldLabel: string,
) {
  await user.click(
    await screen.findByRole("button", { name: `选择${fieldLabel}` }),
  );
  const dialogs = await screen.findAllByRole("dialog");
  return dialogs[dialogs.length - 1]!;
}

function getMainConfirmButton() {
  const mainDialog = screen.getByRole("heading", { name: "编辑资源" }).closest(
    '[role="dialog"]',
  );
  if (!(mainDialog instanceof HTMLElement)) {
    throw new Error("main dialog not found");
  }
  return within(mainDialog).getByRole("button", { name: "确定" });
}

function buildEditableResource(
  kind: "knowledge_base" | "tool" | "variable",
  name: string,
  variableType:
    | "auto_tag"
    | "custom_field"
    | "system_variable"
    | "work_tag"
    | null = null,
) {
  const placeholder =
    kind === "knowledge_base"
      ? `<resource type="knowledge_base" kbId="" name="${name}" />`
      : kind === "tool"
        ? `<resource type="tool" toolId="" name="${name}" />`
        : variableType === "auto_tag" || variableType === "system_variable"
          ? `<resource type="variable" variableType="${variableType}" variableKey="" name="${name}" />`
          : `<resource type="variable" variableType="${variableType ?? ""}" variableId="" name="${name}" />`;

  return {
    description: `${name}说明`,
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
