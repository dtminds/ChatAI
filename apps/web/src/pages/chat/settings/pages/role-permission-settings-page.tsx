import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { presetRoles } from "@/pages/chat/settings/demo-data";
import { PageHeader } from "@/pages/chat/settings/shared";

export function RolePermissionSettingsPage() {
  return (
    <>
      <PageHeader
        description="固定预设角色：owner、admin、operator、viewer。角色不可自定义，owner 仅由主账号推导。"
        eyebrow="SETTINGS / ROLES"
        title="权限角色"
      />

      <section className="overflow-hidden rounded-[10px] border border-border">
        <Table aria-label="角色权限矩阵">
          <TableHeader>
            <TableRow>
              <TableHead className="px-5 py-4">角色</TableHead>
              <TableHead className="px-5 py-4">说明</TableHead>
              <TableHead className="px-5 py-4">chat.access</TableHead>
              <TableHead className="px-5 py-4">chat.send</TableHead>
              <TableHead className="px-5 py-4">chat.takeover</TableHead>
              <TableHead className="px-5 py-4">settings.access</TableHead>
              <TableHead className="px-5 py-4">settings.subAccounts.manage</TableHead>
              <TableHead className="px-5 py-4">settings.managedAccounts.manage</TableHead>
              <TableHead className="px-5 py-4">settings.sidebar.manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presetRoles.map((role) => (
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
                <TableCell className="px-5 py-5">
                  <span className="text-sm text-muted-foreground">{role.description}</span>
                </TableCell>
                {role.permissions.map((permission) => (
                  <TableCell className="px-5 py-5" key={permission.label}>
                    <span className="text-sm text-foreground">
                      {permission.enabled ? "允许" : "禁止"}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
