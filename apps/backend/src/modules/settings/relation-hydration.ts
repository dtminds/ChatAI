export function hydrateRelationRows<Link, Source, Hydrated>(
  links: Link[],
  sourcesById: Map<number, Source>,
  getSourceId: (link: Link) => number,
  hydrate: (link: Link, source: Source) => Hydrated,
): Hydrated[] {
  return links
    .map((link): Hydrated | undefined => {
      const source = sourcesById.get(getSourceId(link));

      return source ? hydrate(link, source) : undefined;
    })
    .filter((row): row is Hydrated => row !== undefined);
}
