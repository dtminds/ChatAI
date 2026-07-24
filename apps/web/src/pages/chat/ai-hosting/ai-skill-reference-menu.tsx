import { useState } from "react";
import { QuoteDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getSkillResourceChipName,
  type SkillResourceItem,
} from "./ai-skill-resource";

function ReferenceEmptyState() {
  return (
    <div className="px-3 py-4 text-center text-sm text-muted-foreground" role="status">
      暂无数据
    </div>
  );
}

export function AiSkillReferenceMenu({
  knowledgeBases,
  onSelectResource,
  tools,
  variables,
}: {
  knowledgeBases: readonly SkillResourceItem[];
  onSelectResource: (item: SkillResourceItem) => void;
  tools: readonly SkillResourceItem[];
  variables: readonly SkillResourceItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 gap-1 px-2 text-primary" type="button" variant="ghost">
          <HugeiconsIcon icon={QuoteDownIcon} size={14} strokeWidth={1.8} />
          引用变量
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>引用变量</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-36">
            {variables.length === 0 ? (
              <ReferenceEmptyState />
            ) : (
              variables.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => {
                    onSelectResource(item);
                  }}
                >
                  {getSkillResourceChipName(item)}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>引用工具</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-36">
            {tools.length === 0 ? (
              <ReferenceEmptyState />
            ) : (
              tools.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => {
                    onSelectResource(item);
                  }}
                >
                  {item.title}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>引用知识库</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            {knowledgeBases.length === 0 ? (
              <ReferenceEmptyState />
            ) : (
              knowledgeBases.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => {
                    onSelectResource(item);
                  }}
                >
                  {item.title}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
