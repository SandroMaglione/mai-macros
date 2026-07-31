import { Crypto, DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  Domain,
  RecordableEvents,
  RecordedEvents,
  Store,
  TimeZone,
} from "../src/index.ts";

const _sortRecordedEvents = (recordedEvents: readonly Domain.RecordedEvent[]) =>
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
      return rightOccurredAt - leftOccurredAt;
    }

    if (leftOccurredAt !== null) {
      return -1;
    }

    if (rightOccurredAt !== null) {
      return 1;
    }

    return (
      DateTime.toEpochMillis(right.createdAt) -
      DateTime.toEpochMillis(left.createdAt)
    );
  });

export function EventTrackingTestContext({
  recordableEventNameConflict,
  stores = {
    recordableEvents: [],
    recordedEvents: [],
  },
  timeZoneOffset = 0,
}: {
  readonly recordableEventNameConflict?:
    | ((recordableEvent: Domain.RecordableEvent) => boolean)
    | undefined;
  readonly stores?: Store.EventTrackingStores | undefined;
  readonly timeZoneOffset?: number | undefined;
}) {
  let currentStores = stores;
  let currentTimeZone: DateTime.TimeZone =
    DateTime.zoneMakeOffset(timeZoneOffset);
  const storeLayer = Layer.succeed(Store.EventTrackingStore, {
    deleteRecordedEvent: (recordedEventId) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          recordedEvents: currentStores.recordedEvents.filter(
            (recordedEvent) => recordedEvent.id !== recordedEventId
          ),
        };
      }),
    findRecordableEventById: (recordableEventId) =>
      Effect.sync(() =>
        currentStores.recordableEvents.filter(
          (recordableEvent) => recordableEvent.id === recordableEventId
        )
      ),
    findRecordableEventsByName: (name) =>
      Effect.sync(() =>
        currentStores.recordableEvents.filter(
          (recordableEvent) =>
            Domain.recordableEventNameKey({ name: recordableEvent.name }) ===
            Domain.recordableEventNameKey({ name })
        )
      ),
    findRecordedEventById: (recordedEventId) =>
      Effect.sync(() =>
        currentStores.recordedEvents.filter(
          (recordedEvent) => recordedEvent.id === recordedEventId
        )
      ),
    findRecordedEventsByRange: ({ endDateKey, startDateKey }) =>
      Effect.sync(() =>
        currentStores.recordedEvents.filter(
          (recordedEvent) =>
            recordedEvent.dateKey >= startDateKey &&
            recordedEvent.dateKey <= endDateKey
        )
      ),
    insertRecordableEvent: (recordableEvent) =>
      Effect.gen(function* () {
        if (recordableEventNameConflict?.(recordableEvent) === true) {
          return yield* new Store.RecordableEventNameConflict({
            cause: "Simulated concurrent recordable event name conflict.",
          });
        }

        currentStores = {
          ...currentStores,
          recordableEvents: [
            ...currentStores.recordableEvents,
            recordableEvent,
          ],
        };
      }),
    insertRecordedEvent: (recordedEvent) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          recordedEvents: [...currentStores.recordedEvents, recordedEvent],
        };
      }),
    insertRecordedEvents: (recordedEvents) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          recordedEvents: [...currentStores.recordedEvents, ...recordedEvents],
        };
      }),
    listRecentRecordedEvents: (limit) =>
      Effect.sync(() =>
        _sortRecordedEvents(currentStores.recordedEvents).slice(0, limit)
      ),
    listRecordableEvents: Effect.sync(() => currentStores.recordableEvents),
    listRecordedEvents: Effect.sync(() => currentStores.recordedEvents),
    readStores: Effect.sync(() => currentStores),
    replaceStores: (nextStores) =>
      Effect.sync(() => {
        currentStores = nextStores;
      }),
    upsertRecordableEvent: (recordableEvent) =>
      Effect.gen(function* () {
        if (recordableEventNameConflict?.(recordableEvent) === true) {
          return yield* new Store.RecordableEventNameConflict({
            cause: "Simulated concurrent recordable event name conflict.",
          });
        }

        currentStores = {
          ...currentStores,
          recordableEvents: [
            ...currentStores.recordableEvents.filter(
              (currentRecordableEvent) =>
                currentRecordableEvent.id !== recordableEvent.id
            ),
            recordableEvent,
          ],
        };
      }),
  } satisfies Store.EventTrackingStore["Service"]);
  let nextByte = 1;
  const cryptoLayer = Layer.succeed(
    Crypto.Crypto,
    Crypto.make({
      digest: (algorithm, data) =>
        Effect.succeed(algorithm).pipe(Effect.as(data)),
      randomBytes: (size) => {
        const bytes = new Uint8Array(size);

        bytes.fill(nextByte);
        nextByte += 1;

        return bytes;
      },
    })
  );
  const timeZoneLayer = Layer.succeed(TimeZone.EventTrackingTimeZone, {
    current: Effect.sync(() => currentTimeZone),
  });
  const layer = Layer.mergeAll(
    RecordableEvents.RecordableEvents.layer,
    RecordedEvents.RecordedEvents.layer
  ).pipe(
    Layer.provideMerge(storeLayer),
    Layer.provideMerge(cryptoLayer),
    Layer.provideMerge(timeZoneLayer),
    Layer.provideMerge(TestClock.layer())
  );

  return {
    layer,
    readStores: () => currentStores,
    setTimeZoneOffset: (offset: number) => {
      currentTimeZone = DateTime.zoneMakeOffset(offset);
    },
  };
}
