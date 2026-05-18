import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
        description="查看各类账号可使用的功能范围，分配子账号时可选择管理员、客服或客服（只读）"
        eyebrow="SETTINGS / ROLES"
        title="权限角色"
      />

      <section className="overflow-hidden rounded-[10px] border border-border">
        <Table aria-label="角色权限矩阵">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24%] px-5 py-4">角色</TableHead>
              <TableHead className="w-[46%] px-5 py-4">说明</TableHead>
              <TableHead className="px-5 py-4">权限集</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presetRoles.map((role) => (
              <RolePermissionRow key={role.id} role={role} />
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function RolePermissionRow({ role }: { role: (typeof presetRoles)[number] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <TableRow>
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
            <p className="font-medium text-foreground">{role.displayName}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <span className="text-sm text-muted-foreground">{role.description}</span>
      </TableCell>
      <TableCell className="px-5 py-5">
        <HoverCard open={isOpen} onOpenChange={setIsOpen}>
          <HoverCardTrigger asChild>
            <Button
              aria-label={`查看 ${role.displayName} 权限明细`}
              className="h-8 justify-start px-0 text-left font-normal"
              onBlur={() => setIsOpen(false)}
              onFocus={() => setIsOpen(true)}
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
              type="button"
              variant="ghost"
            >
              <span className="max-w-[18rem] truncate text-sm text-foreground">
                {role.permissionSummary}
              </span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-64">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {role.displayName}权限明细
              </p>
              <ul className="space-y-2">
                {role.permissionDetails.map((permission) => (
                  <li
                    className="text-sm leading-5 text-muted-foreground"
                    key={permission}
                  >
                    {permission}
                  </li>
                ))}
              </ul>
            </div>
          </HoverCardContent>
        </HoverCard>
      </TableCell>
    </TableRow>
  );
}
