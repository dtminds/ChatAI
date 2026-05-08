# ChatAI

AI 客服工作台项目。

## 技术栈

- React 19
- Vite 7
- TypeScript 5
- Tailwind CSS v4
- shadcn/ui
- Hugeicons
- React Router v7
- Zustand
- Axios

## 页面目标

当前阶段先聚焦聊天工作台基础框架：

- 左栏：账号切换、会话列表、单聊/群聊切换
- 中栏：消息详情区、输入区、发送区占位
- 右栏：客户信息、标签、任务、备注占位

访问路径：

- `/chat`

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发环境

```bash
pnpm dev
```

默认启动后访问 `http://localhost:8086/chat` 即可进入工作台页面。

### 3. 生产构建

```bash
pnpm build
```

### 4. 类型检查

```bash
pnpm typecheck
```

## 目录结构

```text
.
├── docs/
│   └── superpowers/specs/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/         # 应用级布局
│       │   ├── components/
│       │   │   └── ui/      # shadcn/ui 基础组件
│       │   ├── lib/         # request、utils 等通用能力
│       │   ├── pages/
│       │   │   └── chat/    # /chat 页面、类型、mock 数据
│       │   ├── router/      # React Router 路由定义
│       │   ├── store/       # Zustand 状态管理
│       │   └── styles/      # Tailwind v4 全局样式
│       ├── test/            # Vitest / Testing Library 测试
│       ├── components.json
│       └── package.json
├── AGENTS.md
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## 关键文件

- 设计说明：[docs/superpowers/specs/2026-04-19-chat-workbench-design.md](docs/superpowers/specs/2026-04-19-chat-workbench-design.md)
- 路由入口：[apps/web/src/router/index.tsx](apps/web/src/router/index.tsx)
- 工作台页面：[apps/web/src/pages/chat/chat-workbench-page.tsx](apps/web/src/pages/chat/chat-workbench-page.tsx)
- 状态管理：[apps/web/src/store/workbench-store.ts](apps/web/src/store/workbench-store.ts)
- 请求封装：[apps/web/src/lib/request.ts](apps/web/src/lib/request.ts)
- 协作约定：[AGENTS.md](AGENTS.md)

## 环境变量

当前请求封装默认使用：

```text
VITE_API_BASE_URL=/api
```

如果后续需要接独立后端地址，可在本地补充 `.env.local`：

```bash
VITE_API_BASE_URL=http://localhost:8080/api
```

## 后续开发建议

建议按下面顺序继续推进：

1. 接入账号列表、会话列表、消息详情初始化接口
2. 落地轮询状态模型：`sinceVersion / activeMessageSeq / pendingMessages`
3. 接入发送消息与状态回收
4. 接入客户画像、任务、标签信息
5. 逐步替换 mock 数据为真实接口数据

## 说明

本仓库当前不是完整业务实现，而是一个可直接运行、可继续扩展的工作台前端脚手架。

如果你现在执行：

```bash
pnpm install
pnpm dev
```

即可在 `http://localhost:8086/chat` 看到聊天工作台的三栏基础效果。
