import type { DateKey } from "@mai/nutrition";

const _dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const _pad = (value: number) => value.toString().padStart(2, "0");

export const dateKeyFromDate = ({ date }: { readonly date: Date }) => {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  return [
    date.getFullYear().toString().padStart(4, "0"),
    _pad(date.getMonth() + 1),
    _pad(date.getDate()),
  ].join("-");
};

export const shiftDateKey = ({
  dateKey,
  days,
}: {
  readonly dateKey: DateKey | string;
  readonly days: number;
}) => {
  const match = _dateKeyPattern.exec(dateKey);

  if (match === null) {
    throw new RangeError(`Invalid date key: ${dateKey}`);
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new RangeError(`Invalid date key: ${dateKey}`);
  }

  date.setDate(date.getDate() + days);

  return dateKeyFromDate({ date });
};

export const todayDateKey = () => dateKeyFromDate({ date: new Date() });
