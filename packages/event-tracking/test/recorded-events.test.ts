import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";
import { assert, describe, it } from "vitest";

import { RecordableEvents, RecordedEvents } from "../src/index.ts";
import { EventTrackingTestContext } from "./test-context.ts";

describe("RecordedEvents", () => {
  it("records exact now with the local date and permits repeats", async () => {
    const offsetTwoHours = 2 * 60 * 60 * 1000;
    const testContext = EventTrackingTestContext({
      timeZoneOffset: offsetTwoHours,
    });
    const timestamp = Date.parse("2026-06-30T23:30:00.000Z");
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(timestamp);
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        const first = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });
        const second = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });

        return { first, second };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(results.first.recordedEvent.dateKey, "2026-07-01");
    assert.equal(
      results.first.recordedEvent.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(results.first.recordedEvent.occurredAt),
      timestamp
    );
    assert.notEqual(
      results.first.recordedEvent.id,
      results.second.recordedEvent.id
    );
    assert.equal(testContext.readStores().recordedEvents.length, 2);
  });

  it("resolves the current local time zone for every recording", async () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const testContext = EventTrackingTestContext({
      timeZoneOffset: -twoHours,
    });
    const timestamp = Date.parse("2026-07-01T00:30:00.000Z");
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(timestamp);
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        const beforeTimeZoneChange = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });

        yield* Effect.sync(() => {
          testContext.setTimeZoneOffset(twoHours);
        });

        const afterTimeZoneChange = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });

        return { afterTimeZoneChange, beforeTimeZoneChange };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(
      results.beforeTimeZoneChange.recordedEvent.dateKey,
      "2026-06-30"
    );
    assert.equal(
      results.afterTimeZoneChange.recordedEvent.dateKey,
      "2026-07-01"
    );
  });

  it("records a past day without inventing an exact occurrence time", async () => {
    const testContext = EventTrackingTestContext({});
    const timestamp = Date.parse("2026-07-10T12:00:00.000Z");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(timestamp);
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });

        return yield* recordedEvents.recordOnPastDay({
          input: {
            dateKey: "2026-07-08",
            recordableEventId: created.recordableEvent.id,
          },
        });
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.recordedEvent.dateKey, "2026-07-08");
    assert.equal(result.recordedEvent.occurredAt, undefined);
    assert.equal(
      DateTime.toEpochMillis(result.recordedEvent.createdAt),
      timestamp
    );
  });

  it("records a repeated multi-event past-day selection as one batch", async () => {
    const testContext = EventTrackingTestContext({});
    const timestamp = Date.parse("2026-07-10T12:00:00.000Z");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(timestamp);
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const walk = yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });
        const medicine = yield* recordableEvents.create({
          input: { emoji: "💊", name: "Medicine" },
        });

        return yield* recordedEvents.recordManyOnPastDay({
          input: {
            dateKey: "2026-07-08",
            recordableEventIds: [
              walk.recordableEvent.id,
              medicine.recordableEvent.id,
              walk.recordableEvent.id,
            ],
          },
        });
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.recordedEvents.length, 3);
    assert.equal(
      result.recordedEvents.filter(
        (recordedEvent) =>
          recordedEvent.recordableEventId ===
          result.recordedEvents[0]?.recordableEventId
      ).length,
      2
    );
    assert.equal(
      result.recordedEvents.every(
        (recordedEvent) =>
          recordedEvent.dateKey === "2026-07-08" &&
          recordedEvent.occurredAt === undefined &&
          DateTime.toEpochMillis(recordedEvent.createdAt) === timestamp
      ),
      true
    );
    assert.equal(testContext.readStores().recordedEvents.length, 3);
  });

  it("does not save part of a past-day batch when a definition is unavailable", async () => {
    const testContext = EventTrackingTestContext({});
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-07-10T12:00:00.000Z"));
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const active = yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });
        const archived = yield* recordableEvents.create({
          input: { emoji: "💊", name: "Medicine" },
        });

        yield* recordableEvents.archive({
          input: { recordableEventId: archived.recordableEvent.id },
        });

        return yield* recordedEvents.recordManyOnPastDay({
          input: {
            dateKey: "2026-07-08",
            recordableEventIds: [
              active.recordableEvent.id,
              archived.recordableEvent.id,
            ],
          },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(failure, RecordedEvents.RecordableEventArchived);
    assert.equal(testContext.readStores().recordedEvents.length, 0);
  });

  it("rejects today and future dates for day-precision recording", async () => {
    const testContext = EventTrackingTestContext({});
    const failures = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-07-10T12:00:00.000Z"));
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });
        const today = yield* recordedEvents
          .recordOnPastDay({
            input: {
              dateKey: "2026-07-10",
              recordableEventId: created.recordableEvent.id,
            },
          })
          .pipe(Effect.flip);
        const future = yield* recordedEvents
          .recordOnPastDay({
            input: {
              dateKey: "2026-07-11",
              recordableEventId: created.recordableEvent.id,
            },
          })
          .pipe(Effect.flip);

        return { future, today };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.instanceOf(
      failures.today,
      RecordedEvents.RecordedEventDateNotInPast
    );
    assert.instanceOf(
      failures.future,
      RecordedEvents.RecordedEventDateNotInPast
    );
    assert.equal(testContext.readStores().recordedEvents.length, 0);
  });

  it("rejects recording archived and missing definitions", async () => {
    const testContext = EventTrackingTestContext({});
    const failures = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "💊", name: "Medicine" },
        });

        yield* recordableEvents.archive({
          input: { recordableEventId: created.recordableEvent.id },
        });

        const archived = yield* recordedEvents
          .recordNow({
            input: { recordableEventId: created.recordableEvent.id },
          })
          .pipe(Effect.flip);
        const missing = yield* recordedEvents
          .recordNow({
            input: {
              recordableEventId: "9c271d4b-ed3f-42af-956c-584a0e865683",
            },
          })
          .pipe(Effect.flip);

        return { archived, missing };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.instanceOf(
      failures.archived,
      RecordedEvents.RecordableEventArchived
    );
    assert.instanceOf(failures.missing, RecordedEvents.RecordableEventNotFound);
    assert.equal(testContext.readStores().recordedEvents.length, 0);
  });

  it("lists recent and ranged occurrences in descending chronology", async () => {
    const testContext = EventTrackingTestContext({});
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;

        yield* TestClock.setTime(Date.parse("2026-07-10T08:00:00.000Z"));
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        yield* recordedEvents.recordOnPastDay({
          input: {
            dateKey: "2026-07-08",
            recordableEventId: created.recordableEvent.id,
          },
        });
        yield* TestClock.setTime(Date.parse("2026-07-10T09:00:00.000Z"));
        yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });
        yield* TestClock.setTime(Date.parse("2026-07-10T10:00:00.000Z"));
        yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });
        const recent = yield* recordedEvents.listRecent({
          input: { limit: 2 },
        });
        const range = yield* recordedEvents.listRange({
          input: {
            endDateKey: "2026-07-10",
            startDateKey: "2026-07-08",
          },
        });

        return { range, recent };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.deepEqual(
      result.recent.map((recordedEvent) =>
        recordedEvent.occurredAt === undefined
          ? null
          : DateTime.toEpochMillis(recordedEvent.occurredAt)
      ),
      [
        Date.parse("2026-07-10T10:00:00.000Z"),
        Date.parse("2026-07-10T09:00:00.000Z"),
      ]
    );
    assert.deepEqual(
      result.range.map((recordedEvent) => recordedEvent.dateKey),
      ["2026-07-10", "2026-07-10", "2026-07-08"]
    );
  });

  it("rejects inverted ranges with a typed error", async () => {
    const testContext = EventTrackingTestContext({});
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const recordedEvents = yield* RecordedEvents.RecordedEvents;

        return yield* recordedEvents.listRange({
          input: {
            endDateKey: "2026-07-01",
            startDateKey: "2026-07-10",
          },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(failure, RecordedEvents.InvalidRecordedEventDateRange);
  });

  it("deletes occurrences and reports missing IDs", async () => {
    const testContext = EventTrackingTestContext({});
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        const recorded = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });
        const deleted = yield* recordedEvents.delete({
          input: { recordedEventId: recorded.recordedEvent.id },
        });
        const missing = yield* recordedEvents
          .delete({
            input: { recordedEventId: recorded.recordedEvent.id },
          })
          .pipe(Effect.flip);

        return { deleted, missing };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.deleted.recordedEvent.dateKey, "1970-01-01");
    assert.instanceOf(result.missing, RecordedEvents.RecordedEventNotFound);
    assert.equal(testContext.readStores().recordedEvents.length, 0);
  });
});
