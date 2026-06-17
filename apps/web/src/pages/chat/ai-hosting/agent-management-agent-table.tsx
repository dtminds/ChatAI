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

const visibleKnowledgeBaseCount = 2;

export function AgentTable({ agents }: { agents: AgentRecord[] }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-background">
      <Table aria-label="Agent列表">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%] px-5 py-4">Agent名称</TableHead>
            <TableHead className="w-[18%] px-5 py-4">大模型</TableHead>
            <TableHead className="px-5 py-4">关联知识库</TableHead>
            <TableHead className="w-[120px] px-5 py-4">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.length === 0 ? (
            <TableRow>
              <TableCell className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={4}>
                未找到匹配的 Agent
              </TableCell>
            </TableRow>
          ) : (
            agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="px-5 py-4 font-medium text-foreground">{agent.name}</TableCell>
                <TableCell className="px-5 py-4 text-muted-foreground">{agent.model}</TableCell>
                <TableCell className="px-5 py-4">
                  <KnowledgeBaseTags knowledgeBases={agent.knowledgeBases} />
                </TableCell>
                <TableCell className="px-5 py-4">
                  <div className="flex items-center gap-3">
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

function KnowledgeBaseTags({ knowledgeBases }: { knowledgeBases: string[] }) {
  const visibleTags = knowledgeBases.slice(0, visibleKnowledgeBaseCount);
  const hiddenCount = knowledgeBases.length - visibleTags.length;

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
