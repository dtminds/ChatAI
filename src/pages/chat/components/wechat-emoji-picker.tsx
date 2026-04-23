import { ScrollArea } from "@/components/ui/scroll-area";
import {
  WECHAT_EMOJIS,
  type WechatEmojiName,
} from "@/pages/chat/wechat-emoji";

type WechatEmojiPickerProps = {
  onSelect: (name: WechatEmojiName) => void;
};

export function WechatEmojiPicker({ onSelect }: WechatEmojiPickerProps) {
  return (
    <div className="w-[min(42rem,calc(100vw-3.5rem))] overflow-hidden rounded-[20px] border border-[#dbe4ee] bg-white shadow-[0_28px_80px_-36px_rgba(15,23,42,0.45)]">
      <ScrollArea className="h-[23rem] bg-white">
        <div className="grid grid-cols-7 gap-1.5 p-4 sm:grid-cols-9 md:grid-cols-11 lg:grid-cols-13">
          {WECHAT_EMOJIS.map((emoji) => (
            <button
              className="group flex aspect-square items-center justify-center rounded-[14px] transition-colors hover:bg-[#f3f6fb]"
              key={emoji.name}
              onClick={() => onSelect(emoji.name)}
              title={emoji.name}
              type="button"
            >
              <img
                alt={emoji.name}
                className="size-7 object-contain transition-transform group-hover:scale-105"
                draggable={false}
                loading="lazy"
                src={emoji.path}
              />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
