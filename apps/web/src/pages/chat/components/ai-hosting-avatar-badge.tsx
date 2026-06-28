export function AIHostingAvatarBadge() {
  return (
    <div
      aria-label="AI托管"
      className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-white bg-conversation-active shadow-[0_2px_5px_var(--shadow-soft)]"
    >
      <span
        aria-hidden="true"
        className="size-2 bg-white [mask-image:url('https://b5.bokr.com.cn/dist/llm/gemini.svg')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url('https://b5.bokr.com.cn/dist/llm/gemini.svg')] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
      />
    </div>
  );
}
