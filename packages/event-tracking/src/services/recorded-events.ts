import {
  Array,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";

import {
  DateKey,
  RecordableEvent,
  RecordableEventId,
  RecordedEvent,
  RecordedEventId,
} from "../domain.ts";
import { RecordableEventNotFound } from "./recordable-events.ts";
import { EventTrackingStore } from "./store.ts";
import { EventTrackingTimeZone } from "./time-zone.ts";

export { RecordableEventNotFound } from "./recordable-events.ts";

const _RecordNowInput = Schema.Struct({
  recordableEventId: RecordableEventId,
});

const _RecordOnPastDayInput = Schema.Struct({
  recordableEventId: RecordableEventId,
  dateKey: DateKey,
});

const _RecordManyOnPastDayInput = Schema.Struct({
  dateKey: DateKey,
  recordableEventIds: Schema.Array(RecordableEventId).check(
    Schema.isNonEmpty()
  ),
});

const _ListRecentRecordedEventsInput = Schema.Struct({
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

const _ListRecordedEventsRangeInput = Schema.Struct({
  endDateKey: DateKey,
  startDateKey: DateKey,
});

const _DeleteRecordedEventInput = Schema.Struct({
  recordedEventId: RecordedEventId,
});

export type RecordNowInput = typeof _RecordNowInput.Encoded;

export type RecordOnPastDayInput = typeof _RecordOnPastDayInput.Encoded;

export type RecordManyOnPastDayInput = typeof _RecordManyOnPastDayInput.Encoded;

export type ListRecentRecordedEventsInput =
  typeof _ListRecentRecordedEventsInput.Encoded;

export type ListRecordedEventsRangeInput =
  typeof _ListRecordedEventsRangeInput.Encoded;

export type DeleteRecordedEventInput = typeof _DeleteRecordedEventInput.Encoded;

export class RecordedEventNow extends Data.TaggedClass("RecordedEventNow")<{
  readonly recordableEvent: RecordableEvent;
  readonly recordedEvent: RecordedEvent;
}> {}

export class RecordedEventOnPastDay extends Data.TaggedClass(
  "RecordedEventOnPastDay"
)<{
  readonly recordableEvent: RecordableEvent;
  readonly recordedEvent: RecordedEvent;
}> {}

export class RecordedEventsOnPastDay extends Data.TaggedClass(
  "RecordedEventsOnPastDay"
)<{
  readonly recordedEvents: readonly RecordedEvent[];
}> {}

export class DeletedRecordedEvent extends Data.TaggedClass(
  "DeletedRecordedEvent"
)<{
  readonly recordedEvent: RecordedEvent;
}> {}

export class RecordableEventArchived extends Data.TaggedError(
  "RecordableEventArchived"
)<{
  readonly recordableEventId: RecordableEventId;
}> {}

export class RecordedEventNotFound extends Data.TaggedError(
  "RecordedEventNotFound"
)<{
  readonly recordedEventId: RecordedEventId;
}> {}

export class RecordedEventDateNotInPast extends Data.TaggedError(
  "RecordedEventDateNotInPast"
)<{
  readonly dateKey: DateKey;
  readonly todayDateKey: DateKey;
}> {}

export class InvalidRecordedEventDateRange extends Data.TaggedError(
  "InvalidRecordedEventDateRange"
)<{
  readonly endDateKey: DateKey;
  readonly startDateKey: DateKey;
}> {}

const _sortRecordedEvents = (recordedEvents: readonly RecordedEvent[]) =>
  [...recordedEvents].sort((left, right) => {
    const dateOrder = right.dateKey.localeCompare(left.dateKey);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    const leftOccurredAt =
      left.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(left.occurredAt);
    const rightOccurredAt =
      right.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(right.occurredAt);

    if (leftOccurredAt !== null && rightOccurredAt !== null) {
      const occurrenceOrder = rightOccurredAt - leftOccurredAt;

      if (occurrenceOrder !== 0) {
        return occurrenceOrder;
      }
    } else if (leftOccurredAt !== null) {
      return -1;
    } else if (rightOccurredAt !== null) {
      return 1;
    }

    const createdAtOrder =
      DateTime.toEpochMillis(right.createdAt) -
      DateTime.toEpochMillis(left.createdAt);

    return createdAtOrder === 0
      ? right.id.localeCompare(left.id)
      : createdAtOrder;
  });

export class RecordedEvents extends Context.Service<RecordedEvents>()(
  "RecordedEvents",
  {
    make: Effect.gen(function* () {
      const store = yield* EventTrackingStore;
      const crypto = yield* Crypto.Crypto;
      const timeZone = yield* EventTrackingTimeZone;
      const findRecordableEvent = Effect.fn(
        "RecordedEvents.findRecordableEvent"
      )(function* (recordableEventId: RecordableEventId) {
        const recordableEvents =
          yield* store.findRecordableEventById(recordableEventId);

        return yield* Array.head(recordableEvents).pipe(
          Option.match({
            onNone: () => new RecordableEventNotFound({ recordableEventId }),
            onSome: Effect.succeed,
          })
        );
      });
      const ensureRecordable = Effect.fn("RecordedEvents.ensureRecordable")(
        function* (recordableEventId: RecordableEventId) {
          const recordableEvent = yield* findRecordableEvent(recordableEventId);

          if (recordableEvent.archivedAt !== undefined) {
            return yield* new RecordableEventArchived({ recordableEventId });
          }

          return recordableEvent;
        }
      );
      const makeRecordedEvent = Effect.fn("RecordedEvents.makeRecordedEvent")(
        function* ({
          dateKey,
          now,
          occurredAt,
          recordableEventId,
        }: {
          readonly dateKey: DateKey;
          readonly now: number;
          readonly occurredAt: number | undefined;
          readonly recordableEventId: RecordableEventId;
        }) {
          return yield* Schema.decodeEffect(RecordedEvent)({
            id: yield* crypto.randomUUIDv4,
            recordableEventId,
            dateKey,
            ...(occurredAt === undefined ? {} : { occurredAt }),
            createdAt: now,
            updatedAt: now,
          });
        }
      );

      return {
        recordNow: Effect.fn("RecordedEvents.recordNow")(function* ({
          input,
        }: {
          readonly input: RecordNowInput;
        }) {
          const decodedInput =
            yield* Schema.decodeEffect(_RecordNowInput)(input);
          const recordableEvent = yield* ensureRecordable(
            decodedInput.recordableEventId
          );
          const currentDateTime = yield* DateTime.now;
          const currentTimeZone = yield* timeZone.current;
          const now = DateTime.toEpochMillis(currentDateTime);
          const localDateTime = DateTime.setZone(
            currentDateTime,
            currentTimeZone
          );
          const dateKey = yield* Schema.decodeEffect(DateKey)(
            DateTime.formatIsoDate(localDateTime)
          );
          const recordedEvent = yield* makeRecordedEvent({
            dateKey,
            now,
            occurredAt: now,
            recordableEventId: recordableEvent.id,
          });

          yield* store.insertRecordedEvent(recordedEvent);

          return new RecordedEventNow({
            recordableEvent,
            recordedEvent,
          });
        }),

        recordOnPastDay: Effect.fn("RecordedEvents.recordOnPastDay")(
          function* ({ input }: { readonly input: RecordOnPastDayInput }) {
            const decodedInput = yield* Schema.decodeEffect(
              _RecordOnPastDayInput
            )(input);
            const currentDateTime = yield* DateTime.now;
            const currentTimeZone = yield* timeZone.current;
            const localDateTime = DateTime.setZone(
              currentDateTime,
              currentTimeZone
            );
            const todayDateKey = yield* Schema.decodeEffect(DateKey)(
              DateTime.formatIsoDate(localDateTime)
            );

            if (decodedInput.dateKey >= todayDateKey) {
              return yield* new RecordedEventDateNotInPast({
                dateKey: decodedInput.dateKey,
                todayDateKey,
              });
            }

            const recordableEvent = yield* ensureRecordable(
              decodedInput.recordableEventId
            );
            const now = DateTime.toEpochMillis(currentDateTime);
            const recordedEvent = yield* makeRecordedEvent({
              dateKey: decodedInput.dateKey,
              now,
              occurredAt: undefined,
              recordableEventId: recordableEvent.id,
            });

            yield* store.insertRecordedEvent(recordedEvent);

            return new RecordedEventOnPastDay({
              recordableEvent,
              recordedEvent,
            });
          }
        ),

        recordManyOnPastDay: Effect.fn("RecordedEvents.recordManyOnPastDay")(
          function* ({ input }: { readonly input: RecordManyOnPastDayInput }) {
            const decodedInput = yield* Schema.decodeEffect(
              _RecordManyOnPastDayInput
            )(input);
            const currentDateTime = yield* DateTime.now;
            const currentTimeZone = yield* timeZone.current;
            const localDateTime = DateTime.setZone(
              currentDateTime,
              currentTimeZone
            );
            const todayDateKey = yield* Schema.decodeEffect(DateKey)(
              DateTime.formatIsoDate(localDateTime)
            );

            if (decodedInput.dateKey >= todayDateKey) {
              return yield* new RecordedEventDateNotInPast({
                dateKey: decodedInput.dateKey,
                todayDateKey,
              });
            }

            const recordableEvents = yield* Effect.forEach(
              decodedInput.recordableEventIds,
              ensureRecordable
            );
            const now = DateTime.toEpochMillis(currentDateTime);
            const recordedEvents = yield* Effect.forEach(
              recordableEvents,
              (recordableEvent) =>
                makeRecordedEvent({
                  dateKey: decodedInput.dateKey,
                  now,
                  occurredAt: undefined,
                  recordableEventId: recordableEvent.id,
                })
            );

            yield* store.insertRecordedEvents(recordedEvents);

            return new RecordedEventsOnPastDay({ recordedEvents });
          }
        ),

        listRecent: Effect.fn("RecordedEvents.listRecent")(function* ({
          input,
        }: {
          readonly input: ListRecentRecordedEventsInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _ListRecentRecordedEventsInput
          )(input);
          const recordedEvents = yield* store.listRecentRecordedEvents(
            decodedInput.limit
          );

          return _sortRecordedEvents(recordedEvents);
        }),

        listRange: Effect.fn("RecordedEvents.listRange")(function* ({
          input,
        }: {
          readonly input: ListRecordedEventsRangeInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _ListRecordedEventsRangeInput
          )(input);

          if (decodedInput.startDateKey > decodedInput.endDateKey) {
            return yield* new InvalidRecordedEventDateRange({
              endDateKey: decodedInput.endDateKey,
              startDateKey: decodedInput.startDateKey,
            });
          }

          const recordedEvents =
            yield* store.findRecordedEventsByRange(decodedInput);

          return _sortRecordedEvents(recordedEvents);
        }),

        delete: Effect.fn("RecordedEvents.delete")(function* ({
          input,
        }: {
          readonly input: DeleteRecordedEventInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _DeleteRecordedEventInput
          )(input);
          const recordedEvents = yield* store.findRecordedEventById(
            decodedInput.recordedEventId
          );
          const recordedEvent = yield* Array.head(recordedEvents).pipe(
            Option.match({
              onNone: () =>
                new RecordedEventNotFound({
                  recordedEventId: decodedInput.recordedEventId,
                }),
              onSome: Effect.succeed,
            })
          );

          yield* store.deleteRecordedEvent(recordedEvent.id);

          return new DeletedRecordedEvent({ recordedEvent });
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}
