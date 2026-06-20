import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AgentRecord } from "./agent-management-mock-data";
import { AgentModelBadge } from "./agent-model-badge";

const visibleKnowledgeBaseCount = 2;

export function AgentTable({ agents }: { agents: AgentRecord[] }) {
  return (
    <section>
      <Table aria-label="Agent列表">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-[22%]">Agent名称</TableHead>
            <TableHead className="h-11 w-[18%]">大模型</TableHead>
            <TableHead className="h-11">关联知识库</TableHead>
            <TableHead className="h-11 w-[120px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.length === 0 ? (
            <TableRow>
              <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={4}>
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="py-4 font-medium text-foreground">{agent.name}</TableCell>
                <TableCell className="py-4 text-muted-foreground">
                  <AgentModelBadge model={agent.model} />
                </TableCell>
                <TableCell className="py-4">
                  <KnowledgeBaseTags knowledgeBases={agent.knowledgeBases} />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Button className="h-auto p-0 text-primary" type="button" variant="link">
                      编辑
                    </Button>
                    <Button className="h-auto p-0 text-primary" type="button" variant="link">
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function KnowledgeBaseTags({ knowledgeBases = [] }: { knowledgeBases?: string[] }) {
  const safeKnowledgeBases = knowledgeBases ?? [];
  const visibleTags = safeKnowledgeBases.slice(0, visibleKnowledgeBaseCount);
  const hiddenCount = safeKnowledgeBases.length - visibleTags.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleTags.map((name) => (
        <Badge className="rounded-[6px] px-2 py-0.5" key={name} variant="secondary">
          {name}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge className="rounded-[6px] px-2 py-0.5" variant="outline">
          ...
        </Badge>
      ) : null}
    </div>
  );
}
