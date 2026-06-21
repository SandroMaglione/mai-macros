import type { DateKey } from "@mai/nutrition";

export const formatNumber = ({
  maximumFractionDigits = 1,
  value,
}: {
  readonly maximumFractionDigits?: number;
  readonly value: number;
}) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);

export const formatDateTitle = ({ dateKey }: { readonly dateKey: DateKey }) => {
  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date);
};
