export type ParsedLocalDateTime = {
  date: Date;
  time: string;
};

export function parseLocalDateTime(value: string): ParsedLocalDateTime | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return undefined;

  return { date, time: match[4] };
}

export function isValidLocalDateTime(value: string) {
  return Boolean(parseLocalDateTime(value));
}
