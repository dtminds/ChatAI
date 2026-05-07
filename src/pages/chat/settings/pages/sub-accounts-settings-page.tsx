import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, PageHeader } from "@/pages/chat/settings/shared";

export function SubAccountsSettingsPage() {
  return (
    <>
      <PageHeader
        description="典型编辑页结构：基础信息、角色归属、开关项和底部操作条，可作为新建 / 编辑表单模板。"
        eyebrow="DEMO / FORM"
        title="子账号管理"
      />

      <form
        aria-label="子账号表单"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <section className="space-y-5 rounded-[10px] border border-border bg-background p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="员工姓名">
              <Input id="employee-name" placeholder="请输入员工姓名" />
            </Field>
            <Field label="手机号">
              <Input id="employee-phone" placeholder="用于登录和通知" />
            </Field>
            <Field label="所属部门">
              <Select defaultValue="support">
                <SelectTrigger id="employee-team" className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">客服一组</SelectItem>
                  <SelectItem value="sales">销售支持</SelectItem>
                  <SelectItem value="quality">质检运营</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="账号角色">
              <Select defaultValue="agent">
                <SelectTrigger id="employee-role" className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="lead">组长</SelectItem>
                  <SelectItem value="agent">客服</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="备注">
            <Textarea
              id="employee-note"
              placeholder="记录排班偏好、擅长品类或接待注意事项"
            />
          </Field>

          <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-muted px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">允许接待群聊</p>
              <p className="mt-1 text-xs text-muted-foreground">
                关闭后该员工只会出现在单聊接待池。
              </p>
            </div>
            <Switch aria-label="允许接待群聊" defaultChecked />
          </div>
        </section>

        <aside className="space-y-4 rounded-[10px] border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">账号预览</h2>
          <div className="rounded-[10px] bg-surface-muted p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                梁
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">梁小满</p>
                <p className="mt-1 text-xs text-muted-foreground">客服一组 / 客服</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">单聊</Badge>
              <Badge variant="outline">群聊</Badge>
              <Badge variant="outline">质检可见</Badge>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button className="rounded-[10px]" type="button" variant="outline">
              取消
            </Button>
            <Button className="rounded-[10px]" type="button">
              保存
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}
