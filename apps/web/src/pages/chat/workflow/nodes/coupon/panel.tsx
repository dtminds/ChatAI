import { useEffect, useState } from "react";
import { CouponPercentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  WORKFLOW_COUPON_MAX_NUMBER, WORKFLOW_COUPON_PAGE_SIZE, WORKFLOW_COUPON_MAX_PAGE,
  type WorkflowCouponListResponse, type WorkflowCouponResource, type WorkflowCouponSnapshot,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { listWorkflowCoupons } from "./service";

export function CouponConfig({ node, onNodeChange }: NodeSettingsProps<"coupon">) {
  const [open, setOpen] = useState(false);
  const { coupon, number } = node.data;
  const [displayCoupon, setDisplayCoupon] = useState<WorkflowCouponResource | undefined>(() =>
    coupon ? { ...coupon, stocks: 0, limitNum: 0 } : undefined,
  );
  const [displayStatus, setDisplayStatus] = useState<"loading" | "ready" | "error">("ready");
  const [displayError, setDisplayError] = useState<"加载失败" | "优惠券已失效">();
  const [displayRetry, setDisplayRetry] = useState(0);
  const couponId = coupon?.couponId;
  useEffect(() => {
    if (!couponId || !coupon) { setDisplayCoupon(undefined); setDisplayStatus("ready"); setDisplayError(undefined); return; }
    setDisplayCoupon({ ...coupon, stocks: 0, limitNum: 0 });
    setDisplayError(undefined);
    const controller = new AbortController();
    setDisplayStatus("loading");
    void listWorkflowCoupons({ couponId: coupon.couponId, page: 1, pageSize: 1 }, controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        const latest = response.items.find(item => item.couponId === couponId);
        if (!latest) { setDisplayError("优惠券已失效"); setDisplayStatus("error"); return; }
        setDisplayCoupon(latest); setDisplayStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted) { setDisplayError("加载失败"); setDisplayStatus("error"); } });
    return () => controller.abort();
  }, [couponId, displayRetry]);
  const update = (next: WorkflowCouponSnapshot | undefined, quantity = number) => onNodeChange({
    coupon: next, number: quantity, metric: next ? `${next.couponContent || "—"} · ${quantity} 张` : "待配置优惠券",
    status: next ? "ready" : "warning",
  });
  return <>
    <WorkflowSettingsSection title="优惠券" contentClassName="text-[13px]">
      {displayCoupon ? <div className="min-w-0 rounded-lg border p-3 pt-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium"><HugeiconsIcon icon={CouponPercentIcon} size={16} aria-hidden="true" />优惠券</span>
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>编辑</Button>
          </div>
        </div>
        <dl className="mt-2 space-y-2">
          <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">优惠券</dt><dd className="min-w-0 break-words">{displayCoupon.couponName}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">优惠内容</dt><dd className="min-w-0 break-words">{displayCoupon.couponContent || "—"}</dd></div>
        </dl>
        {displayStatus === "error" ? <div className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>{displayError}</span><Button type="button" size="sm" variant="ghost" onClick={() => setDisplayRetry(value => value + 1)}>重试</Button>
        </div> : null}
      </div> : <Button type="button" variant="outline" className="w-full text-[13px]" onClick={() => setOpen(true)}>选择优惠券</Button>}
    </WorkflowSettingsSection>
    <WorkflowSettingsSection title="发放张数" contentClassName="text-[13px]">
      <Select value={String(number)} onValueChange={value => update(coupon, Number(value))}>
        <SelectTrigger aria-label="发放张数" className="w-32 text-[13px]"><SelectValue /></SelectTrigger>
        <SelectContent>{Array.from({ length: WORKFLOW_COUPON_MAX_NUMBER }, (_, i) => i + 1).map(value =>
          <SelectItem key={value} value={String(value)}>{value} 张</SelectItem>)}</SelectContent>
      </Select>
    </WorkflowSettingsSection>
    <WorkflowSettingsSection title="配置须知">
      <p className="text-[13px] leading-5 text-muted-foreground">
        以下情况可能导致优惠券发放失败并终止工作流：优惠券库存不足、超过优惠券限领数量，或用户尚未注册小程序。请在优惠券发放成功后，再发送营销消息，避免因发券失败引发客诉。
      </p>
    </WorkflowSettingsSection>
    {open ? <CouponPicker selected={coupon} onClose={() => setOpen(false)} onConfirm={value => { update(value); setOpen(false); }} /> : null}
  </>;
}

function CouponPicker({ selected, onClose, onConfirm }: {
  selected?: WorkflowCouponSnapshot;
  onClose: () => void;
  onConfirm: (value: WorkflowCouponSnapshot) => void;
}) {
  const [selection, setSelection] = useState(selected);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState({ couponName: "", page: 1, pageSize: WORKFLOW_COUPON_PAGE_SIZE });
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<WorkflowCouponListResponse>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const loadQuery = (next: typeof query) => { setStatus("loading"); setQuery(next); };
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void listWorkflowCoupons(query, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setData(response); setStatus("ready");
    }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [query, retry]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-4xl text-[13px]" aria-describedby={undefined}>
      <DialogHeader><DialogTitle className="text-sm">选择优惠券</DialogTitle></DialogHeader>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); loadQuery({ ...query, page: 1, couponName: keyword.trim() }); }}>
        <Input aria-label="优惠券名称" placeholder="优惠券名称" className="w-64 text-[13px]" maxLength={256} value={keyword} onChange={event => setKeyword(event.target.value)} />
        <Button type="submit" variant="outline">查询</Button>
      </form>
      <RadioGroup aria-label="优惠券" value={selection ? String(selection.couponId) : ""} onValueChange={id => {
        const item = data?.items.find(item => String(item.couponId) === id);
        if (item) setSelection({ couponId: item.couponId, couponName: item.couponName, couponContent: item.couponContent, couponType: item.couponType });
      }}>
        <div className="max-h-[50vh] overflow-auto">
          <Table>
            <TableHeader><TableRow>
            <TableHead className="w-10 font-semibold"><span className="sr-only">选择</span></TableHead>
              <TableHead className="font-semibold">优惠券名称</TableHead><TableHead className="font-semibold">优惠券类型</TableHead><TableHead className="font-semibold">优惠内容</TableHead><TableHead className="font-semibold">剩余库存</TableHead><TableHead className="font-semibold">每人限领</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {status === "loading" ? <TableRow><TableCell colSpan={6}><div role="status" className="flex items-center justify-center gap-2 py-8"><Spinner />正在加载</div></TableCell></TableRow>
                : status === "error" ? <TableRow><TableCell colSpan={6}><div className="flex items-center justify-center gap-2 py-8">加载失败<Button type="button" variant="ghost" onClick={() => setRetry(value => value + 1)}>重试</Button></div></TableCell></TableRow>
                : data?.items.length ? data.items.map(item => <TableRow className="h-14" key={item.couponId}>
                  <TableCell><RadioGroupItem className="translate-y-px" aria-label={`选择${item.couponName}`} value={String(item.couponId)} /></TableCell>
                  <TableCell className="max-w-52 break-words whitespace-normal font-semibold">{item.couponName}</TableCell>
                  <TableCell className="whitespace-nowrap">{({ 1: "代金券", 2: "折扣券", 3: "赠品券" })[item.couponType]}</TableCell>
                  <TableCell className="max-w-64 break-words whitespace-normal">{item.couponContent || "—"}</TableCell>
                  <TableCell>{item.stocks}</TableCell><TableCell>{item.limitNum}</TableCell>
                </TableRow>) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无数据</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </RadioGroup>
      {status === "ready" && data ? <TablePagination className="border-t-0 pt-0" page={query.page} pageSize={query.pageSize}
        total={data.total} totalPages={Math.max(1, Math.ceil(data.total / query.pageSize), data.hasNext ? query.page + 1 : query.page)} maxPage={WORKFLOW_COUPON_MAX_PAGE}
        onPageChange={page => loadQuery({ ...query, page })} /> : null}
      {status === "ready" && data?.hasNext && query.page === WORKFLOW_COUPON_MAX_PAGE ? <p className="text-xs text-muted-foreground">请缩小查询范围</p> : null}
      <DialogFooter>
        <p className="min-w-0 flex-1 truncate text-left text-[13px] text-muted-foreground sm:self-center" title="只支持发放方式为【活动发放】类型的优惠券">只支持发放方式为【活动发放】类型的优惠券</p>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <Button type="button" disabled={!selection || status !== "ready"} onClick={() => { if (selection) onConfirm(selection); }}>确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
