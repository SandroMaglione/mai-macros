import { Context, Data, Effect } from "effect";

import type {
  DateKey,
  RecordableEvent,
  RecordableEventId,
  RecordableEventName,
  RecordedEvent,
  RecordedEventId,
} from "../domain.ts";

export class EventTrackingStoreError extends Data.TaggedError(
  "EventTrackingStoreError"
)<{
  readonly cause: unknown;
}> {}

export class RecordableEventNameConflict extends Data.TaggedError(
  "RecordableEventNameConflict"
)<{
  readonly cause: unknown;
}> {}

export type EventTrackingStoreFailure =
  | EventTrackingStoreError
  | RecordableEventNameConflict;

type StoreEffect<Value> = Effect.Effect<Value, EventTrackingStoreError, never>;
type StoreMutation = StoreEffect<unknown>;
type RecordableEventStoreMutation = Effect.Effect<
  unknown,
  EventTrackingStoreFailure,
  never
>;

export type EventTrackingStores = {
  readonly recordableEvents: readonly RecordableEvent[];
  readonly recordedEvents: readonly RecordedEvent[];
};

export type EventTrackingStoreDateRange = {
  readonly endDateKey: DateKey;
  readonly startDateKey: DateKey;
};

export class EventTrackingStore extends Context.Service<
  EventTrackingStore,
  {
    readonly deleteRecordedEvent: (
      recordedEventId: RecordedEventId
    ) => StoreMutation;

    readonly findRecordableEventById: (
      recordableEventId: RecordableEventId
    ) => StoreEffect<readonly RecordableEvent[]>;

    readonly findRecordableEventsByName: (
      name: RecordableEventName
    ) => StoreEffect<readonly RecordableEvent[]>;

    readonly findRecordedEventById: (
      recordedEventId: RecordedEventId
    ) => StoreEffect<readonly RecordedEvent[]>;

    readonly findRecordedEventsByRange: (
      input: EventTrackingStoreDateRange
    ) => StoreEffect<readonly RecordedEvent[]>;

    readonly insertRecordableEvent: (
      recordableEvent: RecordableEvent
    ) => RecordableEventStoreMutation;

    readonly insertRecordedEvent: (
      recordedEvent: RecordedEvent
    ) => StoreMutation;

    readonly insertRecordedEvents: (
      recordedEvents: readonly RecordedEvent[]
    ) => StoreMutation;

    readonly listRecentRecordedEvents: (
      limit: number
    ) => StoreEffect<readonly RecordedEvent[]>;

    readonly listRecordableEvents: StoreEffect<readonly RecordableEvent[]>;

    readonly listRecordedEvents: StoreEffect<readonly RecordedEvent[]>;

    readonly readStores: StoreEffect<EventTrackingStores>;

    readonly replaceStores: (stores: EventTrackingStores) => StoreMutation;

    readonly upsertRecordableEvent: (
      recordableEvent: RecordableEvent
    ) => RecordableEventStoreMutation;
  }
>()("@mai/event-tracking/EventTrackingStore") {}
