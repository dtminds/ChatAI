import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SolitaireMessageContent } from "@/pages/chat/chat-types";
import { SolitaireMessageCard } from "@/pages/chat/components/message";

describe("SolitaireMessageCard", () => {
  it("renders solitaire title, example and ordered items", () => {
    render(
      <SolitaireMessageCard
        content={
          {
            createMemberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
            example: "例 就这样吧",
            items: [
              {
                content: "哼╭(╯^╰)╮",
                memberSerialNo: "7E3068915A444A58F73D7069C81A56F55194F219CF554649F1C4F9C615435A82",
                timestamp: 1778465705,
              },
              {
                content: "缪勇飞 群昵称111",
                memberSerialNo: "9AC41EA35455F6FFD1832E6EB0CD8C445194F219CF554649F1C4F9C615435A82",
                timestamp: 1778486143,
              },
            ],
            tail: "",
            title: "#接龙\n哈哈哈",
            type: "solitaire",
          } satisfies SolitaireMessageContent
        }
        isAgent={false}
      />,
    );

    expect(screen.getByTestId("solitaire-message-bubble")).toBeInTheDocument();
    expect(screen.getByText("#接龙")).toBeInTheDocument();
    expect(screen.getByText("哈哈哈")).toBeInTheDocument();
    expect(screen.getByText("例 就这样吧")).toBeInTheDocument();

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1.哼╭(╯^╰)╮");
    expect(items[1]).toHaveTextContent("2.缪勇飞 群昵称111");
  });
});
