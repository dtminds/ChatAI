type AiHostingIntroStep = {
  description: string;
  imageAlt: string;
  imageUrl: string;
  step: string;
  title: string;
};

type AiHostingIntroGuideProps = {
  ariaLabel: string;
  steps: readonly AiHostingIntroStep[];
};

export function AiHostingIntroGuide({ ariaLabel, steps }: AiHostingIntroGuideProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-[8px] bg-primary/6 dark:bg-muted"
    >
      <div className="grid min-h-[176px] grid-cols-3">
        {steps.map((item) => (
          <div
            className="grid min-h-[176px] min-w-0 grid-cols-[minmax(0,1fr)_minmax(160px,42%)] items-end gap-4 overflow-hidden pl-6 pr-4 pt-8 max-xl:min-h-0 max-xl:grid-cols-1 max-xl:px-6 max-xl:py-5 max-md:px-5"
            key={item.title}
          >
            <div className="min-w-0 self-start max-xl:max-w-none">
              <div className="text-sm font-medium text-muted-foreground">{item.step}</div>
              <h2 className="mt-2 text-base font-semibold text-foreground">{item.title}</h2>
              <p
                className="mt-3 line-clamp-2 max-w-[240px] text-xs leading-6 text-muted-foreground"
                title={item.description}
              >
                {item.description}
              </p>
            </div>

            <img
              alt={item.imageAlt}
              className="h-auto w-full max-w-[250px] self-end justify-self-end max-xl:hidden"
              draggable={false}
              src={item.imageUrl}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
