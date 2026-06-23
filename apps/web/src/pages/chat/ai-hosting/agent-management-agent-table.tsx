import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AgentRecord } from "./agent-management-types";
import { AgentModelBadge } from "./agent-model-badge";

export function AgentTable({
  agents,
  onRemove,
}: {
  agents: AgentRecord[];
  onRemove: (agent: AgentRecord) => void;
}) {
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
                  <AgentModelBadge label={agent.model.label} model={agent.model.model} />
                </TableCell>
                <TableCell className="py-4">
                  <KnowledgeBaseTags />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                      <Link to={`/chat/ai-hosting/agents/${agent.id}`}>编辑</Link>
                    </Button>
                    <Button
                      className="h-auto p-0 text-primary"
                      onClick={() => onRemove(agent)}
                      type="button"
                      variant="link"
                    >
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

function KnowledgeBaseTags() {
  return <span className="text-muted-foreground">-</span>;
}
