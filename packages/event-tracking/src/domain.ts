import { Schema } from "effect";

const _dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const _emojiPattern =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)$/u;

export const RecordableEventId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("RecordableEventId")
);

export type RecordableEventId = typeof RecordableEventId.Type;

export const RecordedEventId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("RecordedEventId")
);

export type RecordedEventId = typeof RecordedEventId.Type;

export const RecordableEventName = Schema.Trim.check(Schema.isNonEmpty()).pipe(
  Schema.brand("RecordableEventName")
);

export type RecordableEventName = typeof RecordableEventName.Type;

export function recordableEventNameKey({
  name,
}: {
  readonly name: typeof RecordableEventName.Encoded;
}): string {
  return name.normalize("NFKC").toLowerCase();
}

export const EventEmoji = Schema.String.check(
  Schema.makeFilter((value) =>
    _emojiPattern.test(value)
      ? undefined
      : "Expected exactly one emoji grapheme."
  )
).pipe(Schema.brand("EventEmoji"));

export type EventEmoji = typeof EventEmoji.Type;

export const RecordableEventPosition = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("RecordableEventPosition"));

export type RecordableEventPosition = typeof RecordableEventPosition.Type;

export const DateKey = Schema.String.check(
  Schema.isPattern(_dateKeyPattern),
  Schema.makeFilter((value) => {
    if (!_dateKeyPattern.test(value)) {
      return undefined;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][month - 1];
    const isValid =
      year >= 1 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= (daysInMonth ?? 0);

    return isValid ? undefined : "Expected a valid Gregorian calendar date.";
  })
).pipe(Schema.brand("DateKey"));

export type DateKey = typeof DateKey.Type;

export class RecordableEvent extends Schema.Class<RecordableEvent>(
  "RecordableEvent"
)({
  id: RecordableEventId,
  name: RecordableEventName,
  emoji: EventEmoji,
  position: RecordableEventPosition,
  archivedAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class RecordedEvent extends Schema.Class<RecordedEvent>("RecordedEvent")(
  {
    id: RecordedEventId,
    recordableEventId: RecordableEventId,
    dateKey: DateKey,
    occurredAt: Schema.optional(Schema.DateTimeUtcFromMillis),
    createdAt: Schema.DateTimeUtcFromMillis,
    updatedAt: Schema.DateTimeUtcFromMillis,
  }
) {}
