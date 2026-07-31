import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";
import { assert, describe, it } from "vitest";

import { RecordableEvents } from "../src/index.ts";
import { EventTrackingTestContext } from "./test-context.ts";

describe("RecordableEvents", () => {
  it("creates trimmed definitions and assigns a stable next position", async () => {
    const testContext = EventTrackingTestContext({});
    const timestamp = Date.parse("2026-07-01T08:30:00.000Z");
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(timestamp);
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const first = yield* recordableEvents.create({
          input: {
            name: "  Hydrate  ",
            emoji: "💧",
            position: 4,
          },
        });
        const second = yield* recordableEvents.create({
          input: {
            name: "Walk",
            emoji: "🚶",
          },
        });

        return { first, second };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(results.first.recordableEvent.name, "Hydrate");
    assert.equal(results.first.recordableEvent.position, 4);
    assert.equal(results.second.recordableEvent.position, 5);
    assert.equal(
      DateTime.toEpochMillis(results.first.recordableEvent.createdAt),
      timestamp
    );
    assert.equal(testContext.readStores().recordableEvents.length, 2);
  });

  it("lists definitions by position with stable tie breaking", async () => {
    const testContext = EventTrackingTestContext({});
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;

        yield* TestClock.setTime(100);
        yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate", position: 2 },
        });
        yield* TestClock.setTime(200);
        yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk", position: 0 },
        });
        yield* TestClock.setTime(300);
        yield* recordableEvents.create({
          input: { emoji: "💊", name: "Medicine", position: 2 },
        });

        return yield* recordableEvents.list();
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.deepEqual(
      listed.map((recordableEvent) => recordableEvent.name),
      ["Walk", "Hydrate", "Medicine"]
    );
  });

  it("rejects duplicate trimmed names without writing", async () => {
    const testContext = EventTrackingTestContext({});
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;

        yield* recordableEvents.create({
          input: { emoji: "💧", name: "Été" },
        });

        return yield* recordableEvents.create({
          input: { emoji: "🥛", name: "  E\u0301TE\u0301  " },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(
      failure,
      RecordableEvents.RecordableEventNameAlreadyExists
    );
    assert.equal(testContext.readStores().recordableEvents.length, 1);
  });

  it("maps late store name conflicts to the duplicate-name domain error", async () => {
    const testContext = EventTrackingTestContext({
      recordableEventNameConflict: (recordableEvent) =>
        recordableEvent.name.toLowerCase() === "hydrate",
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const createFailure = yield* recordableEvents
          .create({
            input: { emoji: "💧", name: "Hydrate" },
          })
          .pipe(Effect.flip);
        const walk = yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });
        const updateFailure = yield* recordableEvents
          .update({
            input: {
              emoji: "💧",
              name: "Hydrate",
              position: walk.recordableEvent.position,
              recordableEventId: walk.recordableEvent.id,
            },
          })
          .pipe(Effect.flip);

        return { createFailure, updateFailure };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.instanceOf(
      result.createFailure,
      RecordableEvents.RecordableEventNameAlreadyExists
    );
    assert.instanceOf(
      result.updateFailure,
      RecordableEvents.RecordableEventNameAlreadyExists
    );
    assert.equal(result.createFailure.name, "Hydrate");
    assert.equal(result.updateFailure.name, "Hydrate");
    assert.deepEqual(
      testContext
        .readStores()
        .recordableEvents.map((recordableEvent) => recordableEvent.name),
      ["Walk"]
    );
  });

  it("updates details while preserving identity and creation metadata", async () => {
    const testContext = EventTrackingTestContext({});
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;

        yield* TestClock.setTime(100);
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        yield* TestClock.setTime(200);

        return yield* recordableEvents.update({
          input: {
            recordableEventId: created.recordableEvent.id,
            emoji: "🥤",
            name: "Drink water",
            position: 3,
          },
        });
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.recordableEvent.id, result.previousRecordableEvent.id);
    assert.equal(result.recordableEvent.name, "Drink water");
    assert.equal(result.recordableEvent.emoji, "🥤");
    assert.equal(result.recordableEvent.position, 3);
    assert.equal(DateTime.toEpochMillis(result.recordableEvent.createdAt), 100);
    assert.equal(DateTime.toEpochMillis(result.recordableEvent.updatedAt), 200);
  });

  it("rejects conflicting names during update", async () => {
    const testContext = EventTrackingTestContext({});
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const hydrate = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });

        yield* recordableEvents.create({
          input: { emoji: "🚶", name: "Walk" },
        });

        return yield* recordableEvents.update({
          input: {
            recordableEventId: hydrate.recordableEvent.id,
            emoji: "💧",
            name: "Walk",
            position: 0,
          },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(
      failure,
      RecordableEvents.RecordableEventNameAlreadyExists
    );
  });

  it("archives and unarchives definitions with explicit state errors", async () => {
    const testContext = EventTrackingTestContext({});
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;

        yield* TestClock.setTime(100);
        const created = yield* recordableEvents.create({
          input: { emoji: "💊", name: "Medicine" },
        });
        yield* TestClock.setTime(200);
        const archived = yield* recordableEvents.archive({
          input: { recordableEventId: created.recordableEvent.id },
        });
        const alreadyArchived = yield* recordableEvents
          .archive({
            input: { recordableEventId: created.recordableEvent.id },
          })
          .pipe(Effect.flip);

        yield* TestClock.setTime(300);
        const unarchived = yield* recordableEvents.unarchive({
          input: { recordableEventId: created.recordableEvent.id },
        });
        const notArchived = yield* recordableEvents
          .unarchive({
            input: { recordableEventId: created.recordableEvent.id },
          })
          .pipe(Effect.flip);

        return { alreadyArchived, archived, notArchived, unarchived };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(
      result.archived.recordableEvent.archivedAt === undefined
        ? null
        : DateTime.toEpochMillis(result.archived.recordableEvent.archivedAt),
      200
    );
    assert.equal(result.unarchived.recordableEvent.archivedAt, undefined);
    assert.equal(
      DateTime.toEpochMillis(result.unarchived.recordableEvent.updatedAt),
      300
    );
    assert.instanceOf(
      result.alreadyArchived,
      RecordableEvents.RecordableEventAlreadyArchived
    );
    assert.instanceOf(
      result.notArchived,
      RecordableEvents.RecordableEventNotArchived
    );
  });

  it("returns a typed not-found error for definition mutations", async () => {
    const testContext = EventTrackingTestContext({});
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;

        return yield* recordableEvents.archive({
          input: {
            recordableEventId: "9c271d4b-ed3f-42af-956c-584a0e865683",
          },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(failure, RecordableEvents.RecordableEventNotFound);
  });
});
