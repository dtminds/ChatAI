import { getTextBubbleClassName } from "@/pages/chat/components/message/bubble-style";
import type { SolitaireMessageContent } from "@/pages/chat/chat-types";

type SolitaireMessageCardProps = {
  content: SolitaireMessageContent;
  isAgent: boolean;
  isOwnMessage?: boolean;
};

export function SolitaireMessageCard({
  content,
  isAgent,
  isOwnMessage,
}: SolitaireMessageCardProps) {
  const titleLines = splitLines(content.title);
  const exampleLines = splitLines(content.example);
  const tailLines = splitLines(content.tail);

  return (
    <div
      className={getTextBubbleClassName(isAgent, isOwnMessage)}
      data-testid="solitaire-message-bubble"
    >
      <div className="space-y-0.5">
        {titleLines.map((line, index) => (
          <p
            className={line.startsWith("#") ? "font-semibold text-primary" : undefined}
            key={`title-${index}`}
          >
            {line}
          </p>
        ))}
        {exampleLines.map((line, index) => (
          <p key={`example-${index}`}>{line}</p>
        ))}
      </div>

      {content.items.length > 0 ? (
        <ol className="mt-5 space-y-0.5">
          {content.items.map((item, index) => (
            <li
              className="flex min-w-0 gap-1"
              key={`${item.memberSerialNo ?? "item"}-${item.timestamp ?? index}-${index}`}
            >
              <span className="shrink-0 tabular-nums text-foreground">{index + 1}.</span>
              <span
                className="min-w-0 whitespace-pre-wrap break-words"
                style={{
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {item.content}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {tailLines.length > 0 ? (
        <div className="mt-4 space-y-0.5">
          {tailLines.map((line, index) => (
            <p key={`tail-${index}`}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function splitLines(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
