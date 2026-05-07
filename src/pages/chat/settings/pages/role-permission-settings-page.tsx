import {
  Delete02Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roles } from "@/pages/chat/settings/demo-data";
import { PageHeader } from "@/pages/chat/settings/shared";

export function RolePermissionSettingsPage() {
  return (
    <>
      <PageHeader
        description="典型权限矩阵：角色列、能力列、开关和危险操作入口，适合后续对接 RBAC 或团队权限模型。"
        eyebrow="DEMO / RBAC"
        title="权限角色"
      />

      <section className="overflow-hidden rounded-[10px] border border-border bg-background">
        <Table aria-label="角色权限矩阵">
          <TableHeader className="bg-surface-muted">
            <TableRow>
              <TableHead className="px-5 py-4">角色</TableHead>
              <TableHead className="px-5 py-4">会话接待</TableHead>
              <TableHead className="px-5 py-4">账号管理</TableHead>
              <TableHead className="px-5 py-4">数据导出</TableHead>
              <TableHead className="px-5 py-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.name}>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <HugeiconsIcon
                      className="text-primary"
                      color="currentColor"
                      icon={SecurityCheckIcon}
                      size={18}
                      strokeWidth={1.8}
                    />
                    <div>
                      <p className="font-medium text-foreground">{role.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    </div>
                  </div>
                </TableCell>
                {role.permissions.map((permission) => (
                  <TableCell className="px-5 py-5" key={permission.label}>
                    <Label className="text-foreground">
                      <Checkbox defaultChecked={permission.enabled} />
                      <span>{permission.label}</span>
                    </Label>
                  </TableCell>
                ))}
                <TableCell className="px-5 py-5">
                  <Button
                    aria-label={`删除角色 ${role.name}`}
                    className="size-8 rounded-[8px] text-destructive"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Delete02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
