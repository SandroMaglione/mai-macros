import { describe, expect, it } from "@effect/vitest";
import * as EventDomain from "@mai/event-tracking/domain";
import * as RecordableEventsService from "@mai/event-tracking/services/recordable-events";
import * as RecordedEventsService from "@mai/event-tracking/services/recorded-events";
import * as EventStore from "@mai/event-tracking/services/store";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import {
  Array,
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";

import {
  EventTrackerEvents,
  EventTrackerMachine,
  EventTrackerStates,
} from "@/machines/events-machine";
import { AppActivity } from "@/machines/services/app-activity";

type EventTrackerSnapshot = Machine.Machine.Snapshot<
  Machine.Machine.States<typeof EventTrackerMachine>
>;

const _todayDateKey = EventDomain.DateKey.make("2026-11-08");

const _coffeeId = EventDomain.RecordableEventId.make(
  "11111111-1111-4111-8111-111111111111"
);

const _teaId = EventDomain.RecordableEventId.make(
  "33333333-3333-4333-8333-333333333333"
);

const _recordableEvent = ({
  archivedAt,
  emoji,
  id,
  name,
  position,
}: {
  readonly archivedAt: number | undefined;
  readonly emoji: string;
  readonly id: EventDomain.RecordableEventId;
  readonly name: string;
  readonly position: number;
}) =>
  Effect.orDie(
    Schema.decodeEffect(EventDomain.RecordableEvent)({
      id,
      name,
      emoji,
      position,
      ...(archivedAt === undefined ? {} : { archivedAt }),
      createdAt: 100,
      updatedAt: 100,
    })
  );

const _recordedEvent = ({
  dateKey,
  id,
  occurredAt,
}: {
  readonly dateKey: string;
  readonly id: string;
  readonly occurredAt: number;
}) =>
  Effect.orDie(
    Schema.decodeEffect(EventDomain.RecordedEvent)({
      id,
      recordableEventId: _coffeeId,
      dateKey,
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    })
  );

const _fixtures = Effect.all({
  coffee: _recordableEvent({
    archivedAt: undefined,
    emoji: "☕",
    id: _coffeeId,
    name: "Coffee",
    position: 0,
  }),
  archivedCoffee: _recordableEvent({
    archivedAt: 500,
    emoji: "☕",
    id: _coffeeId,
    name: "Coffee",
    position: 0,
  }),
  renamedCoffee: _recordableEvent({
    archivedAt: undefined,
    emoji: "🍵",
    id: _coffeeId,
    name: "Matcha",
    position: 0,
  }),
  tea: _recordableEvent({
    archivedAt: undefined,
    emoji: "🫖",
    id: _teaId,
    name: "Tea",
    position: 1,
  }),
  todayEvent: _recordedEvent({
    dateKey: "2026-11-08",
    id: "22222222-2222-4222-8222-222222222222",
    occurredAt: 2_000,
  }),
  laterTodayEvent: _recordedEvent({
    dateKey: "2026-11-08",
    id: "55555555-5555-4555-8555-555555555555",
    occurredAt: 3_000,
  }),
  pastEvent: _recordedEvent({
    dateKey: "2026-11-01",
    id: "66666666-6666-4666-8666-666666666666",
    occurredAt: 1_500,
  }),
  olderEvent: _recordedEvent({
    dateKey: "2026-10-01",
    id: "44444444-4444-4444-8444-444444444444",
    occurredAt: 1_000,
  }),
});

const _idleAppActivity = Layer.succeed(AppActivity, {
  activations: Stream.never,
});

const _loaded = (snapshot: EventTrackerSnapshot) =>
  Option.getOrThrow(EventTrackerStates.get(snapshot, "Loaded"));

const _isReady = (snapshot: EventTrackerSnapshot) =>
  EventTrackerStates.matches(snapshot, "Loaded.Ready");

const _startLoaded = Effect.gen(function* () {
  const machine = yield* Machine.start(EventTrackerMachine, {
    todayDateKey: _todayDateKey,
  });

  yield* Machine.waitFor(machine, ({ state }) => _isReady(state));

  return machine;
});

const _waitFor =
  (machine: Effect.Success<typeof _startLoaded>) =>
  (predicate: (snapshot: EventTrackerSnapshot) => boolean) =>
    Effect.map(
      Machine.waitFor(machine, ({ state }) => predicate(state)),
      ({ state }) => state
    );

describe("EventTrackerMachine planner", () => {
  it.effect("starts by loading today's page and ignores early events", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(EventTrackerMachine, {
        input: { todayDateKey: _todayDateKey },
        events: [EventTrackerEvents.Reload(), EventTrackerEvents.LoadOlder()],
      });

      yield* MachineTest.verify(EventTrackerMachine, trace);
      expect(trace.finalConfiguration).toContain("Loading");
      expect(trace.final.value.todayDateKey).toBe(_todayDateKey);

      const coverage = MachineTest.coverage(EventTrackerMachine, trace);
      const misses = coverage.transitions.definitions.misses;

      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(
        misses
          .filter(({ trigger }) => trigger.type === "event")
          .every(
            ({ source }) => source === "Failure" || source.startsWith("Loaded.")
          )
      ).toBe(true);
      expect(
        misses
          .filter(({ trigger }) => trigger.type === "invoke")
          .map(({ source }) => source)
      ).toEqual(
        expect.arrayContaining([
          "Loading",
          "Loaded.Ready",
          "Loaded.LoadingOlder",
          "Loaded.RecordingNow",
          "Loaded.RecordingPastEvents",
          "Loaded.DeletingRecordedEvent",
          "Loaded.SavingRecordableEvent",
          "Loaded.TogglingRecordableEvent",
        ])
      );
    })
  );
});

describe("EventTrackerMachine loading", () => {
  it.live("loads today's 30-day page and pages older days", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const ranges = yield* Ref.make<
        readonly {
          readonly endDateKey: string;
          readonly startDateKey: string;
        }[]
      >([]);
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee]),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: ({ input }) =>
                Effect.map(
                  Ref.getAndUpdate(ranges, (current) => [
                    ...current,
                    {
                      endDateKey: input.endDateKey,
                      startDateKey: input.startDateKey,
                    },
                  ]),
                  (previous) =>
                    Array.isReadonlyArrayNonEmpty(previous)
                      ? [fixtures.olderEvent]
                      : [fixtures.todayEvent]
                ),
            })
          )
        )
      );
      const ready = yield* machine.state;

      expect(_loaded(ready).data.loadedStartDateKey).toBe("2026-10-10");
      expect(_loaded(ready).data.recordableEvents).toEqual([fixtures.coffee]);
      expect(_loaded(ready).notice).toBeNull();

      yield* machine.send(EventTrackerEvents.LoadOlder());
      const older = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.loadedStartDateKey === "2026-09-10"
      );

      expect(yield* Ref.get(ranges)).toEqual([
        { endDateKey: "2026-11-08", startDateKey: "2026-10-10" },
        { endDateKey: "2026-10-09", startDateKey: "2026-09-10" },
      ]);
      expect(_loaded(older).data.recordedEvents.map(({ id }) => id)).toEqual([
        fixtures.todayEvent.id,
        fixtures.olderEvent.id,
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("keeps the loaded page when older days fail to load", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const calls = yield* Ref.make(0);
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee]),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () =>
                Effect.flatMap(
                  Ref.getAndUpdate(calls, (count) => count + 1),
                  (count) =>
                    count === 0
                      ? Effect.succeed([fixtures.todayEvent])
                      : Effect.fail(
                          new EventStore.EventTrackingStoreError({
                            cause: "offline",
                          })
                        )
                ),
            })
          )
        )
      );

      yield* machine.send(EventTrackerEvents.LoadOlder());
      const failed = yield* _waitFor(machine)(
        (snapshot) => _isReady(snapshot) && _loaded(snapshot).notice !== null
      );

      expect(_loaded(failed).notice).toEqual({
        message: "Could not load older days. Scroll down to try again.",
        tone: "danger",
      });
      expect(_loaded(failed).data.loadedStartDateKey).toBe("2026-10-10");
      expect(_loaded(failed).data.recordedEvents.map(({ id }) => id)).toEqual([
        fixtures.todayEvent.id,
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("shows a retryable failure when the tracker cannot load", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const attempts = yield* Ref.make(0);
      const machine = yield* Machine.start(EventTrackerMachine, {
        todayDateKey: _todayDateKey,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () =>
                Effect.flatMap(
                  Ref.getAndUpdate(attempts, (count) => count + 1),
                  (count) =>
                    count === 0
                      ? Effect.fail(
                          new EventStore.EventTrackingStoreError({
                            cause: "offline",
                          })
                        )
                      : Effect.succeed([fixtures.coffee])
                ),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () => Effect.succeed([fixtures.todayEvent]),
            })
          )
        )
      );
      const failure = yield* _waitFor(machine)((snapshot) =>
        EventTrackerStates.matches(snapshot, "Failure")
      );

      expect(
        Option.map(
          EventTrackerStates.get(failure, "Failure"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load events. Please try again."));

      yield* machine.send(EventTrackerEvents.Reload());
      const ready = yield* _waitFor(machine)(_isReady);

      expect(_loaded(ready).data.recordedEvents).toEqual([fixtures.todayEvent]);
      expect(yield* Ref.get(attempts)).toBe(2);
    }).pipe(Effect.scoped)
  );
});

describe("EventTrackerMachine recording", () => {
  it.live("records now, records past days and deletes recorded events", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const pastRequests = yield* Ref.make<
        readonly {
          readonly dateKey: string;
          readonly recordableEventIds: readonly string[];
        }[]
      >([]);
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee]),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () => Effect.succeed([fixtures.todayEvent]),
              recordNow: () =>
                Effect.succeed(
                  new RecordedEventsService.RecordedEventNow({
                    recordableEvent: fixtures.coffee,
                    recordedEvent: fixtures.laterTodayEvent,
                  })
                ),
              recordManyOnPastDay: ({ input }) =>
                Effect.as(
                  Ref.update(pastRequests, (current) => [
                    ...current,
                    {
                      dateKey: input.dateKey,
                      recordableEventIds: [...input.recordableEventIds],
                    },
                  ]),
                  new RecordedEventsService.RecordedEventsOnPastDay({
                    recordedEvents: [fixtures.pastEvent],
                  })
                ),
              delete: () =>
                Effect.succeed(
                  new RecordedEventsService.DeletedRecordedEvent({
                    recordedEvent: fixtures.todayEvent,
                  })
                ),
            })
          )
        )
      );

      yield* machine.send(
        EventTrackerEvents.RecordNow({ recordableEventId: _coffeeId })
      );
      const recorded = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordedEvents.length === 2
      );

      expect(_loaded(recorded).data.recordedEvents.map(({ id }) => id)).toEqual(
        [fixtures.laterTodayEvent.id, fixtures.todayEvent.id]
      );

      yield* machine.send(
        EventTrackerEvents.OpenDayEditor({
          dateKey: EventDomain.DateKey.make("2026-11-01"),
        })
      );
      yield* machine.send(
        EventTrackerEvents.IncrementPastEvent({ recordableEventId: _coffeeId })
      );
      yield* machine.send(
        EventTrackerEvents.RecordPastEvents({
          dateKey: EventDomain.DateKey.make("2026-11-01"),
          recordableEventIds: [_coffeeId, _coffeeId],
        })
      );
      const recordingPast = yield* _waitFor(machine)((snapshot) =>
        EventTrackerStates.matches(snapshot, "Loaded.RecordingPastEvents")
      );

      expect(_loaded(recordingPast).editingDateKey).toBeNull();
      expect(_loaded(recordingPast).pastEventSelections).toEqual([]);

      const recordedPast = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordedEvents.length === 3
      );

      expect(yield* Ref.get(pastRequests)).toEqual([
        { dateKey: "2026-11-01", recordableEventIds: [_coffeeId, _coffeeId] },
      ]);
      expect(
        _loaded(recordedPast).data.recordedEvents.map(({ id }) => id)
      ).toEqual([
        fixtures.laterTodayEvent.id,
        fixtures.todayEvent.id,
        fixtures.pastEvent.id,
      ]);

      yield* machine.send(
        EventTrackerEvents.DeleteRecordedEvent({
          recordedEventId: fixtures.todayEvent.id,
        })
      );
      const deleted = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordedEvents.length === 2
      );

      expect(_loaded(deleted).data.recordedEvents.map(({ id }) => id)).toEqual([
        fixtures.laterTodayEvent.id,
        fixtures.pastEvent.id,
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("shows a notice when recording fails", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee]),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () => Effect.succeed([fixtures.todayEvent]),
              recordNow: () =>
                Effect.fail(
                  new RecordedEventsService.RecordableEventArchived({
                    recordableEventId: _coffeeId,
                  })
                ),
              delete: () =>
                Effect.fail(
                  new EventStore.EventTrackingStoreError({ cause: "offline" })
                ),
            })
          )
        )
      );

      yield* machine.send(
        EventTrackerEvents.RecordNow({ recordableEventId: _coffeeId })
      );
      const archived = yield* _waitFor(machine)(
        (snapshot) => _isReady(snapshot) && _loaded(snapshot).notice !== null
      );

      expect(_loaded(archived).notice).toEqual({
        message: "This event is archived and cannot be recorded.",
        tone: "danger",
      });

      yield* machine.send(
        EventTrackerEvents.DeleteRecordedEvent({
          recordedEventId: fixtures.todayEvent.id,
        })
      );
      yield* _waitFor(machine)((snapshot) =>
        EventTrackerStates.matches(snapshot, "Loaded.DeletingRecordedEvent")
      );
      const deleteFailed = yield* _waitFor(machine)(
        (snapshot) => _isReady(snapshot) && _loaded(snapshot).notice !== null
      );

      expect(_loaded(deleteFailed).notice).toEqual({
        message: "Could not delete the recorded event. Please try again.",
        tone: "danger",
      });
      expect(_loaded(deleteFailed).data.recordedEvents).toEqual([
        fixtures.todayEvent,
      ]);
    }).pipe(Effect.scoped)
  );
});

describe("EventTrackerMachine managing events", () => {
  it.live("creates, edits, archives and unarchives recordable events", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const created = yield* Ref.make<
        readonly { readonly emoji: string; readonly name: string }[]
      >([]);
      const updated = yield* Ref.make<
        readonly {
          readonly emoji: string;
          readonly name: string;
          readonly position: number;
          readonly recordableEventId: string;
        }[]
      >([]);
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee]),
              create: ({ input }) =>
                Effect.as(
                  Ref.update(created, (current) => [
                    ...current,
                    { emoji: input.emoji, name: input.name },
                  ]),
                  new RecordableEventsService.CreatedRecordableEvent({
                    recordableEvent: fixtures.tea,
                  })
                ),
              update: ({ input }) =>
                Effect.as(
                  Ref.update(updated, (current) => [
                    ...current,
                    {
                      emoji: input.emoji,
                      name: input.name,
                      position: input.position,
                      recordableEventId: input.recordableEventId,
                    },
                  ]),
                  new RecordableEventsService.UpdatedRecordableEvent({
                    previousRecordableEvent: fixtures.coffee,
                    recordableEvent: fixtures.renamedCoffee,
                  })
                ),
              archive: () =>
                Effect.succeed(
                  new RecordableEventsService.ArchivedRecordableEvent({
                    previousRecordableEvent: fixtures.renamedCoffee,
                    recordableEvent: fixtures.archivedCoffee,
                  })
                ),
              unarchive: () =>
                Effect.fail(
                  new RecordableEventsService.RecordableEventNotArchived({
                    recordableEventId: _coffeeId,
                  })
                ),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () => Effect.succeed([]),
            })
          )
        )
      );

      yield* machine.send(EventTrackerEvents.ChangeName({ value: "Tea" }));
      yield* machine.send(EventTrackerEvents.ChangeEmoji({ value: "🫖" }));
      yield* machine.send(EventTrackerEvents.SaveRecordableEvent());
      const afterCreate = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordableEvents.length === 2
      );

      expect(yield* Ref.get(created)).toEqual([{ emoji: "🫖", name: "Tea" }]);
      expect(
        _loaded(afterCreate).data.recordableEvents.map(({ id }) => id)
      ).toEqual([_coffeeId, _teaId]);
      expect(_loaded(afterCreate).nameInput).toBe("");
      expect(_loaded(afterCreate).emojiInput).toBe("");

      yield* machine.send(
        EventTrackerEvents.EditRecordableEvent({ recordableEventId: _coffeeId })
      );
      const editing = yield* _waitFor(machine)(
        (snapshot) => _loaded(snapshot).editingRecordableEventId !== null
      );

      expect(_loaded(editing).editingRecordableEventId).toBe(_coffeeId);
      expect(_loaded(editing).nameInput).toBe("Coffee");
      expect(_loaded(editing).emojiInput).toBe("☕");

      yield* machine.send(EventTrackerEvents.ChangeName({ value: "Matcha" }));
      yield* machine.send(EventTrackerEvents.ChangeEmoji({ value: "🍵" }));
      yield* machine.send(EventTrackerEvents.SaveRecordableEvent());
      const afterUpdate = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordableEvents[0]?.name === "Matcha"
      );

      expect(yield* Ref.get(updated)).toEqual([
        {
          emoji: "🍵",
          name: "Matcha",
          position: 0,
          recordableEventId: _coffeeId,
        },
      ]);
      expect(_loaded(afterUpdate).editingRecordableEventId).toBeNull();

      yield* machine.send(
        EventTrackerEvents.ArchiveRecordableEvent({
          recordableEventId: _coffeeId,
        })
      );
      const afterArchive = yield* _waitFor(machine)(
        (snapshot) =>
          _isReady(snapshot) &&
          _loaded(snapshot).data.recordableEvents[0]?.archivedAt !== undefined
      );

      expect(_loaded(afterArchive).notice).toBeNull();

      yield* machine.send(
        EventTrackerEvents.UnarchiveRecordableEvent({
          recordableEventId: _coffeeId,
        })
      );
      const unarchiveFailed = yield* _waitFor(machine)(
        (snapshot) => _isReady(snapshot) && _loaded(snapshot).notice !== null
      );

      expect(_loaded(unarchiveFailed).notice).toEqual({
        message: "This event is already active.",
        tone: "danger",
      });
    }).pipe(Effect.scoped)
  );

  it.live("updates form, selection and dialog state while ready", () =>
    Effect.gen(function* () {
      const fixtures = yield* _fixtures;
      const machine = yield* _startLoaded.pipe(
        Effect.provide(
          Layer.mergeAll(
            _idleAppActivity,
            Layer.mock(RecordableEventsService.RecordableEvents, {
              list: () => Effect.succeed([fixtures.coffee, fixtures.tea]),
            }),
            Layer.mock(RecordedEventsService.RecordedEvents, {
              listRange: () => Effect.succeed([]),
            })
          )
        )
      );
      const probe = yield* MachineTest.probe(EventTrackerMachine, machine);

      const today = yield* probe.sendAndAwait(
        EventTrackerEvents.OpenDayEditor({ dateKey: _todayDateKey })
      );

      expect(today.handled).toBe(false);
      expect(_loaded(today.after).editingDateKey).toBeNull();

      const pastDay = EventDomain.DateKey.make("2026-11-02");
      yield* probe.sendAndAwait(
        EventTrackerEvents.OpenDayEditor({ dateKey: pastDay })
      );
      yield* probe.sendAndAwait(
        EventTrackerEvents.IncrementPastEvent({ recordableEventId: _coffeeId })
      );
      yield* probe.sendAndAwait(
        EventTrackerEvents.IncrementPastEvent({ recordableEventId: _coffeeId })
      );
      yield* probe.sendAndAwait(
        EventTrackerEvents.IncrementPastEvent({ recordableEventId: _teaId })
      );
      const decremented = yield* probe.sendAndAwait(
        EventTrackerEvents.DecrementPastEvent({ recordableEventId: _teaId })
      );

      expect(_loaded(decremented.after).editingDateKey).toBe(pastDay);
      expect(_loaded(decremented.after).pastEventSelections).toEqual([
        { count: 2, recordableEventId: _coffeeId },
      ]);

      const decrementedAgain = yield* probe.sendAndAwait(
        EventTrackerEvents.DecrementPastEvent({ recordableEventId: _coffeeId })
      );

      expect(_loaded(decrementedAgain.after).pastEventSelections).toEqual([
        { count: 1, recordableEventId: _coffeeId },
      ]);

      const closedDay = yield* probe.sendAndAwait(
        EventTrackerEvents.CloseDayEditor()
      );

      expect(_loaded(closedDay.after).editingDateKey).toBeNull();
      expect(_loaded(closedDay.after).pastEventSelections).toEqual([]);

      const details = yield* probe.sendAndAwait(
        EventTrackerEvents.OpenEventDetails({
          dateKey: pastDay,
          recordableEventId: _teaId,
        })
      );

      expect(_loaded(details.after).detailDateKey).toBe(pastDay);
      expect(_loaded(details.after).detailRecordableEventId).toBe(_teaId);

      const closedDetails = yield* probe.sendAndAwait(
        EventTrackerEvents.CloseEventDetails()
      );

      expect(_loaded(closedDetails.after).detailDateKey).toBeNull();
      expect(_loaded(closedDetails.after).detailRecordableEventId).toBeNull();

      const missing = yield* probe.sendAndAwait(
        EventTrackerEvents.EditRecordableEvent({
          recordableEventId: EventDomain.RecordableEventId.make(
            "77777777-7777-4777-8777-777777777777"
          ),
        })
      );

      expect(_loaded(missing.after).notice).toEqual({
        message: "This event no longer exists.",
        tone: "danger",
      });

      yield* probe.sendAndAwait(
        EventTrackerEvents.EditRecordableEvent({ recordableEventId: _teaId })
      );
      const cancelled = yield* probe.sendAndAwait(
        EventTrackerEvents.CancelEdit()
      );

      expect(_loaded(cancelled.after).editingRecordableEventId).toBeNull();
      expect(_loaded(cancelled.after).nameInput).toBe("");
      expect(_loaded(cancelled.after).notice).toBeNull();

      yield* probe.sendAndAwait(EventTrackerEvents.ChangeName({ value: "X" }));
      yield* probe.sendAndAwait(
        EventTrackerEvents.EditRecordableEvent({
          recordableEventId: EventDomain.RecordableEventId.make(
            "77777777-7777-4777-8777-777777777777"
          ),
        })
      );
      const begun = yield* probe.sendAndAwait(EventTrackerEvents.BeginCreate());

      expect(_loaded(begun.after).nameInput).toBe("");
      expect(_loaded(begun.after).notice).toBeNull();
      expect(_isReady(begun.after)).toBe(true);
    }).pipe(Effect.scoped)
  );
});

const _startTracking = ({
  activations,
}: {
  readonly activations: Queue.Queue<void>;
}) =>
  Effect.flatMap(_fixtures, (fixtures) =>
    _startLoaded.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AppActivity, {
            activations: Stream.fromQueue(activations),
          }),
          Layer.mock(RecordableEventsService.RecordableEvents, {
            list: () => Effect.succeed([fixtures.coffee]),
          }),
          Layer.mock(RecordedEventsService.RecordedEvents, {
            listRange: () => Effect.succeed([]),
          })
        )
      )
    )
  );

describe("EventTrackerMachine today tracking", () => {
  it.effect("refreshes today on entry and when the app becomes active", () =>
    Effect.gen(function* () {
      const activations = yield* Queue.unbounded<void>();

      yield* TestClock.setTime(new Date(2026, 10, 9, 23, 59, 40).getTime());

      const machine = yield* _startTracking({ activations });

      yield* _waitFor(machine)(
        (snapshot) => snapshot.value.todayDateKey === "2026-11-09"
      );

      yield* TestClock.setTime(new Date(2026, 10, 10, 0, 0, 10).getTime());
      yield* Queue.offer(activations, undefined);
      const refreshed = yield* _waitFor(machine)(
        (snapshot) => snapshot.value.todayDateKey === "2026-11-10"
      );

      expect(_isReady(refreshed)).toBe(true);
    })
  );

  it.effect("refreshes today every minute", () =>
    Effect.gen(function* () {
      const activations = yield* Queue.unbounded<void>();

      yield* TestClock.setTime(new Date(2026, 10, 9, 23, 59, 30).getTime());

      const machine = yield* _startTracking({ activations });

      yield* _waitFor(machine)(
        (snapshot) => snapshot.value.todayDateKey === "2026-11-09"
      );

      yield* TestClock.adjust("1 minute");
      const refreshed = yield* _waitFor(machine)(
        (snapshot) => snapshot.value.todayDateKey === "2026-11-10"
      );

      expect(_isReady(refreshed)).toBe(true);
    })
  );
});
