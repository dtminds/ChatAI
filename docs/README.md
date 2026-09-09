# 文档导航

## 分类

| 目录 | 内容 |
|---|---|
| [product](product/) | 产品规则、商业化及跨团队方案；计费方案放在 [monetization](product/monetization/) |
| [specs](specs/) | 技术设计、运行语义和跨层接口契约 |
| [plans](plans/) | 进行中的实施计划、验证步骤和待办事项 |
| [adr](adr/) | 架构决策及选择理由 |
| [operations](operations/) | 运行维护、监控、排障；一次性评审材料放在 [reviews](operations/reviews/) |
| [deployment](deployment/) | 部署、环境及发布操作 |
| [db](db/) | 数据库结构与变更记录 |
| [agents](agents/) | Agent 协作规范与开发指南 |
| [archive](archive/) | 已确认过期或被替代的历史文档 |

## 常用入口

- [Workflow 执行引擎设计](specs/2026-07-10-marketing-workflow-execution-engine.md)
- [Workflow 前端契约](specs/2026-08-09-marketing-workflow-frontend-contract.md)
- [用户记忆](specs/2026-08-05-user-memory.md)
- [会话洞察多步骤分析](specs/2026-06-07-insights-multi-step-llm-architecture.md)
- [数据库结构](db/schema.sql)与[变更记录](db/change-log.md)
- [腾讯云容器部署](deployment/tencent-cloud-containers.md)

## 新增与维护

- 按内容分类，不按生成工具建立目录；根目录只保留导航。
- `specs` 内所有文档（包括持续维护的契约）、阶段性产品方案、计划和评审统一使用 `YYYY-MM-DD-topic.md`。日期优先保留原文档日期，否则取 Git 首次新增日期；后续更新不改变文件名日期。
- 部署、运维、数据库及 Agent 指南等长期操作文档使用稳定主题名；导航文件使用 `README.md`。
- 目录已表达类型时不重复添加 `design`、`implementation`、`adr` 后缀；区分同主题不同内容时保留必要限定词。
- 设计描述行为与边界，计划描述实施步骤、验证方式和待办事项；同一主题相互链接，避免复制两份约定。
- 文档所在目录不代表已实施或已验证。方案标明待对齐项，运行规范随代码更新，历史评审不作为当前缺陷清单。
- 已完成或被替代的计划，将独有且仍有效的信息迁入规范、操作指南或 Issue 后删除，历史通过 Git 查询；不按日期或未勾选清单直接判定过期。
- 移动文档时同步更新仓库引用及 Agent 指引。
