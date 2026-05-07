import {
  Add01Icon,
  Edit02Icon,
  Search01Icon,
  UserGroup03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { qywxAccounts } from "@/pages/chat/settings/demo-data";
import {
  DemoNotes,
  PageHeader,
  StatusText,
} from "@/pages/chat/settings/shared";

export function AccountsSettingsPage() {
  return (
    <>
      <PageHeader
        description="典型列表页结构：筛选栏、批量操作、状态列、行内操作和分页区域，后续接真实 API 时可替换数据源。"
        eyebrow="DEMO / CRUD"
        title="企微账号"
      />

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative w-[280px]">
            <HugeiconsIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              color="currentColor"
              icon={Search01Icon}
              size={17}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索企微账号"
              className="h-10 rounded-[8px] bg-background pl-9 shadow-none"
              placeholder="搜索企微账号"
            />
          </div>

          <Select defaultValue="all">
            <SelectTrigger
              aria-label="筛选接待状态"
              className="h-10 min-w-[180px] rounded-[8px] bg-background text-sm shadow-none"
            >
              <SelectValue placeholder="筛选接待状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部接待状态</SelectItem>
              <SelectItem value="normal">正常</SelectItem>
              <SelectItem value="idle">无人接待</SelectItem>
              <SelectItem value="offline">离线</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="h-10 rounded-[10px] px-4" type="button">
          <HugeiconsIcon
            color="currentColor"
            icon={Add01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <span>新增账号</span>
        </Button>
      </section>

      <section className="mt-6 overflow-hidden rounded-[10px] border border-border bg-background">
        <Table aria-label="企微账号列表">
          <TableHeader className="bg-surface-muted">
            <TableRow>
              <TableHead className="w-[34%] px-5 py-4">企微账号</TableHead>
              <TableHead className="w-[14%] px-5 py-4">接待状态</TableHead>
              <TableHead className="w-[28%] px-5 py-4">关联子账号</TableHead>
              <TableHead className="px-5 py-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qywxAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-[8px] bg-info-muted text-info">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={UserGroup03Icon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{account.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{account.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-5">
                  <StatusText tone={account.statusTone}>{account.status}</StatusText>
                </TableCell>
                <TableCell className="px-5 py-5 text-muted-foreground">
                  {account.subAccounts}
                </TableCell>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label={`编辑 ${account.name}`}
                      className="size-8 rounded-[8px]"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Edit02Icon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </Button>
                    <Button
                      className="h-8 rounded-[8px] px-3 text-primary"
                      type="button"
                      variant="ghost"
                    >
                      关联子账号
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <DemoNotes
        items={[
          "筛选条件建议沉淀为 query params，便于复制链接和回放问题。",
          "表格操作使用图标按钮承载编辑、删除等高频动作，主动作保留文字。",
          "接真实接口时，可从 src/pages/chat/api 新增 settings service，再统一走 src/lib/request.ts。",
        ]}
      />
    </>
  );
}
