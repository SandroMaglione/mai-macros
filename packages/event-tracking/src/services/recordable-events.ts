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
  EventEmoji,
  RecordableEvent,
  RecordableEventId,
  RecordableEventName,
  RecordableEventPosition,
} from "../domain.ts";
import { EventTrackingStore } from "./store.ts";

const _CreateRecordableEventInput = Schema.Struct({
  name: RecordableEventName,
  emoji: EventEmoji,
  position: Schema.optional(RecordableEventPosition),
});

const _UpdateRecordableEventInput = Schema.Struct({
  recordableEventId: RecordableEventId,
  name: RecordableEventName,
  emoji: EventEmoji,
  position: RecordableEventPosition,
});

const _RecordableEventIdInput = Schema.Struct({
  recordableEventId: RecordableEventId,
});

export type CreateRecordableEventInput =
  typeof _CreateRecordableEventInput.Encoded;

export type UpdateRecordableEventInput =
  typeof _UpdateRecordableEventInput.Encoded;

export type RecordableEventIdInput = typeof _RecordableEventIdInput.Encoded;

export class CreatedRecordableEvent extends Data.TaggedClass(
  "CreatedRecordableEvent"
)<{
  readonly recordableEvent: RecordableEvent;
}> {}

export class UpdatedRecordableEvent extends Data.TaggedClass(
  "UpdatedRecordableEvent"
)<{
  readonly previousRecordableEvent: RecordableEvent;
  readonly recordableEvent: RecordableEvent;
}> {}

export class ArchivedRecordableEvent extends Data.TaggedClass(
  "ArchivedRecordableEvent"
)<{
  readonly previousRecordableEvent: RecordableEvent;
  readonly recordableEvent: RecordableEvent;
}> {}

export class UnarchivedRecordableEvent extends Data.TaggedClass(
  "UnarchivedRecordableEvent"
)<{
  readonly previousRecordableEvent: RecordableEvent;
  readonly recordableEvent: RecordableEvent;
}> {}

export class RecordableEventNotFound extends Data.TaggedError(
  "RecordableEventNotFound"
)<{
  readonly recordableEventId: RecordableEventId;
}> {}

export class RecordableEventNameAlreadyExists extends Data.TaggedError(
  "RecordableEventNameAlreadyExists"
)<{
  readonly name: RecordableEventName;
}> {}

export class RecordableEventAlreadyArchived extends Data.TaggedError(
  "RecordableEventAlreadyArchived"
)<{
  readonly recordableEventId: RecordableEventId;
}> {}

export class RecordableEventNotArchived extends Data.TaggedError(
  "RecordableEventNotArchived"
)<{
  readonly recordableEventId: RecordableEventId;
}> {}

const _sortRecordableEvents = (recordableEvents: readonly RecordableEvent[]) =>
  [...recordableEvents].sort((left, right) => {
    const positionOrder = left.position - right.position;

    if (positionOrder !== 0) {
      return positionOrder;
    }

    const createdAtOrder =
      DateTime.toEpochMillis(left.createdAt) -
      DateTime.toEpochMillis(right.createdAt);

    return createdAtOrder === 0
      ? left.id.localeCompare(right.id)
      : createdAtOrder;
  });

export class RecordableEvents extends Context.Service<RecordableEvents>()(
  "RecordableEvents",
  {
    make: Effect.gen(function* () {
      const store = yield* EventTrackingStore;
      const crypto = yield* Crypto.Crypto;
      const findById = Effect.fn("RecordableEvents.findById")(function* (
        recordableEventId: RecordableEventId
      ) {
        const recordableEvents =
          yield* store.findRecordableEventById(recordableEventId);

        return yield* Array.head(recordableEvents).pipe(
          Option.match({
            onNone: () =>
              new RecordableEventNotFound({
                recordableEventId,
              }),
            onSome: Effect.succeed,
          })
        );
      });
      const ensureUniqueName = Effect.fn("RecordableEvents.ensureUniqueName")(
        function* ({
          currentRecordableEventId,
          name,
        }: {
          readonly currentRecordableEventId: RecordableEventId | null;
          readonly name: RecordableEventName;
        }) {
          const existingRecordableEvents =
            yield* store.findRecordableEventsByName(name);
          const hasConflict = existingRecordableEvents.some(
            (recordableEvent) =>
              currentRecordableEventId === null ||
              recordableEvent.id !== currentRecordableEventId
          );

          if (hasConflict) {
            return yield* new RecordableEventNameAlreadyExists({ name });
          }
        }
      );

      return {
        list: Effect.fn("RecordableEvents.list")(function* () {
          return _sortRecordableEvents(yield* store.listRecordableEvents);
        }),

        create: Effect.fn("RecordableEvents.create")(function* ({
          input,
        }: {
          readonly input: CreateRecordableEventInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _CreateRecordableEventInput
          )(input);

          yield* ensureUniqueName({
            currentRecordableEventId: null,
            name: decodedInput.name,
          });

          const existingRecordableEvents =
            decodedInput.position === undefined
              ? yield* store.listRecordableEvents
              : [];
          const nextPosition = _sortRecordableEvents(
            existingRecordableEvents
          ).reduce(
            (highestPosition, recordableEvent) =>
              Math.max(highestPosition, recordableEvent.position + 1),
            0
          );
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          const recordableEvent = yield* Schema.decodeEffect(RecordableEvent)({
            id: yield* crypto.randomUUIDv4,
            name: decodedInput.name,
            emoji: decodedInput.emoji,
            position: decodedInput.position ?? nextPosition,
            createdAt: now,
            updatedAt: now,
          });

          yield* store.insertRecordableEvent(recordableEvent).pipe(
            Effect.catchTag("RecordableEventNameConflict", () =>
              Effect.fail(
                new RecordableEventNameAlreadyExists({
                  name: recordableEvent.name,
                })
              )
            )
          );

          return new CreatedRecordableEvent({ recordableEvent });
        }),

        update: Effect.fn("RecordableEvents.update")(function* ({
          input,
        }: {
          readonly input: UpdateRecordableEventInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _UpdateRecordableEventInput
          )(input);
          const previousRecordableEvent = yield* findById(
            decodedInput.recordableEventId
          );

          yield* ensureUniqueName({
            currentRecordableEventId: previousRecordableEvent.id,
            name: decodedInput.name,
          });

          const encodedPreviousRecordableEvent = yield* Schema.encodeEffect(
            RecordableEvent
          )(previousRecordableEvent);
          const recordableEvent = yield* Schema.decodeEffect(RecordableEvent)({
            ...encodedPreviousRecordableEvent,
            name: decodedInput.name,
            emoji: decodedInput.emoji,
            position: decodedInput.position,
            updatedAt: DateTime.toEpochMillis(yield* DateTime.now),
          });

          yield* store.upsertRecordableEvent(recordableEvent).pipe(
            Effect.catchTag("RecordableEventNameConflict", () =>
              Effect.fail(
                new RecordableEventNameAlreadyExists({
                  name: recordableEvent.name,
                })
              )
            )
          );

          return new UpdatedRecordableEvent({
            previousRecordableEvent,
            recordableEvent,
          });
        }),

        archive: Effect.fn("RecordableEvents.archive")(function* ({
          input,
        }: {
          readonly input: RecordableEventIdInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _RecordableEventIdInput
          )(input);
          const previousRecordableEvent = yield* findById(
            decodedInput.recordableEventId
          );

          if (previousRecordableEvent.archivedAt !== undefined) {
            return yield* new RecordableEventAlreadyArchived({
              recordableEventId: previousRecordableEvent.id,
            });
          }

          const now = DateTime.toEpochMillis(yield* DateTime.now);
          const encodedPreviousRecordableEvent = yield* Schema.encodeEffect(
            RecordableEvent
          )(previousRecordableEvent);
          const recordableEvent = yield* Schema.decodeEffect(RecordableEvent)({
            ...encodedPreviousRecordableEvent,
            archivedAt: now,
            updatedAt: now,
          });

          yield* store.upsertRecordableEvent(recordableEvent);

          return new ArchivedRecordableEvent({
            previousRecordableEvent,
            recordableEvent,
          });
        }),

        unarchive: Effect.fn("RecordableEvents.unarchive")(function* ({
          input,
        }: {
          readonly input: RecordableEventIdInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _RecordableEventIdInput
          )(input);
          const previousRecordableEvent = yield* findById(
            decodedInput.recordableEventId
          );

          if (previousRecordableEvent.archivedAt === undefined) {
            return yield* new RecordableEventNotArchived({
              recordableEventId: previousRecordableEvent.id,
            });
          }

          const encodedPreviousRecordableEvent = yield* Schema.encodeEffect(
            RecordableEvent
          )(previousRecordableEvent);
          const recordableEvent = yield* Schema.decodeEffect(RecordableEvent)({
            ...encodedPreviousRecordableEvent,
            archivedAt: undefined,
            updatedAt: DateTime.toEpochMillis(yield* DateTime.now),
          });

          yield* store.upsertRecordableEvent(recordableEvent);

          return new UnarchivedRecordableEvent({
            previousRecordableEvent,
            recordableEvent,
          });
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}
