import { describe, expect, it } from "@effect/vitest";
import * as Domain from "@mai/nutrition/domain";
import * as BodyWeightReports from "@mai/nutrition/services/body-weight-reports";
import * as BodyWeights from "@mai/nutrition/services/body-weights";
import * as Store from "@mai/nutrition/services/store";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schedule, Schema } from "effect";

import {
  BodyWeightCalendarDates,
  BodyWeightEditorChild,
  BodyWeightEditorEvents,
  BodyWeightEditorMachine,
  BodyWeightEditorStates,
  BodyWeightImporterChild,
  BodyWeightImporterEvents,
  BodyWeightImporterMachine,
  BodyWeightImporterStates,
  BodyWeightRouteEvents,
  BodyWeightRouteMachine,
  BodyWeightRouteStates,
} from "@/machines/body-weight-panel-machine";

const _dateKey = Domain.DateKey.make("2026-11-08");

const _entry = ({
  dateKey,
  weightKilograms,
}: {
  readonly dateKey: string;
  readonly weightKilograms: number;
}) =>
  Schema.decodeEffect(Domain.BodyWeightEntry)({
    createdAt: 100,
    dateKey,
    updatedAt: 100,
    weightKilograms,
  });

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

const _schemaError = Effect.flatMap(
  Schema.decodeEffect(Domain.DateKey)("not a date"),
  () => Effect.die("unreachable")
);

const _report = ({
  input,
}: {
  readonly input: BodyWeightReports.GetBodyWeightReportRangeInput;
}) =>
  Effect.succeed({
    cleanedEntries: [],
    endDateKey: Domain.DateKey.make(input.endDateKey),
    entries: [],
    insights: [],
    latestEntry: null,
    outliers: [],
    stableTrendPoints: [],
    startDateKey: Domain.DateKey.make(input.startDateKey),
    trendPoints: [],
    weightedWeightKilograms: null,
  });

const _routeLayer = ({
  bodyWeights,
  getRange,
}: {
  readonly bodyWeights: Partial<BodyWeights.BodyWeights["Service"]>;
  readonly getRange?: BodyWeightReports.BodyWeightReports["Service"]["getRange"];
}) =>
  Layer.mergeAll(
    Layer.mock(BodyWeights.BodyWeights, bodyWeights),
    Layer.mock(BodyWeightReports.BodyWeightReports, {
      getRange: getRange ?? _report,
    })
  );

const _activeChild = <A, E>(child: Effect.Effect<Option.Option<A>, E>) =>
  Effect.flatMap(child, Effect.fromOption).pipe(
    Effect.retry({ schedule: Schedule.spaced("2 millis"), times: 100 })
  );

const _routeInput = {
  dateKey: _dateKey,
  reportDateRange: null,
  reportDayCount: 30,
};

describe("BodyWeightCalendarDates", () => {
  it("navigates months while clamping the day", () => {
    expect(
      BodyWeightCalendarDates.shiftDateKey({
        dateKey: Domain.DateKey.make("2026-01-31"),
        months: 1,
      })
    ).toBe("2026-02-28");
    expect(
      BodyWeightCalendarDates.range({
        dateKey: Domain.DateKey.make("2024-02-10"),
      })
    ).toEqual({ endDateKey: "2024-02-29", startDateKey: "2024-02-01" });
  });
});

describe("BodyWeightEditorMachine", () => {
  it.effect("edits a new weight and only deletes existing entries", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(BodyWeightEditorMachine, {
        input: { dateKey: _dateKey, selectedEntry: null },
        events: [
          BodyWeightEditorEvents.DeleteWeight(),
          BodyWeightEditorEvents.ChangeWeight({ value: "80.4" }),
          BodyWeightEditorEvents.Close(),
          BodyWeightEditorEvents.Save(),
        ],
      });

      yield* MachineTest.verify(BodyWeightEditorMachine, trace);
      expect(trace.initial.startingState.value.weightInput).toBe("");
      expect(
        trace.steps.map(({ after }) =>
          BodyWeightEditorStates.matches(after, "Idle")
        )
      ).toEqual([true, true, true, false]);
      expect(trace.finalConfiguration).toContain("Saving");
      expect(trace.final.value.weightInput).toBe("80.4");

      const entry = yield* _entry({
        dateKey: _dateKey,
        weightKilograms: 81.2,
      });
      const existing = yield* MachineTest.run(BodyWeightEditorMachine, {
        input: { dateKey: _dateKey, selectedEntry: entry },
        events: [BodyWeightEditorEvents.DeleteWeight()],
      });

      yield* MachineTest.verify(BodyWeightEditorMachine, existing);
      expect(existing.initial.startingState.value.weightInput).toBe("81.20");
      expect(existing.finalConfiguration).toContain("Deleting");

      expect(
        MachineTest.coverage(BodyWeightEditorMachine, [
          trace,
          existing,
        ]).transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type === "event" ? trigger.event : trigger.type}`
        )
      ).toEqual([
        "Deleting:deleteBodyWeight.done",
        "Deleting:deleteBodyWeight.failure",
        "Saving:saveBodyWeight.done",
        "Saving:saveBodyWeight.failure",
      ]);
    })
  );

  it.live("reports save validation and delete failures", () =>
    Effect.gen(function* () {
      const entry = yield* _entry({
        dateKey: _dateKey,
        weightKilograms: 81.2,
      });
      const editor = yield* Machine.start(BodyWeightEditorMachine, {
        dateKey: _dateKey,
        selectedEntry: entry,
      }).pipe(
        Effect.provide(
          Layer.mock(BodyWeights.BodyWeights, {
            delete: () => Effect.fail(_storeError),
            save: () => _schemaError,
          })
        )
      );

      yield* editor.send(BodyWeightEditorEvents.Save());
      const invalid = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          BodyWeightEditorStates.matches(state, "Idle") &&
          state.value.message !== null
      );

      expect(invalid.state.value.message).toBe(
        "Enter a positive weight in kilograms."
      );

      yield* editor.send(BodyWeightEditorEvents.DeleteWeight());
      const failed = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          BodyWeightEditorStates.matches(state, "Idle") &&
          state.value.message === "Could not delete this weight."
      );

      expect(failed.state.value.selectedEntry?.weightKilograms).toBe(81.2);
    }).pipe(Effect.scoped)
  );
});

describe("BodyWeightImporterMachine", () => {
  it.effect("collects import rows before submitting", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(BodyWeightImporterMachine, {
        events: [
          BodyWeightImporterEvents.ChangeImportInput({
            value: "26-06-26 77.40",
          }),
          BodyWeightImporterEvents.Close(),
          BodyWeightImporterEvents.ImportWeights(),
          BodyWeightImporterEvents.ChangeImportInput({ value: "ignored" }),
        ],
      });

      yield* MachineTest.verify(BodyWeightImporterMachine, trace);
      expect(trace.finalConfiguration).toContain("Submitting");
      expect(trace.final.value).toMatchObject({
        input: "26-06-26 77.40",
        message: null,
      });
    })
  );

  it.live("explains invalid import rows", () =>
    Effect.gen(function* () {
      const importer = yield* Machine.start(BodyWeightImporterMachine).pipe(
        Effect.provide(
          Layer.mock(BodyWeights.BodyWeights, {
            importBatch: ({ input }) =>
              input.text === "bad"
                ? Effect.fail(
                    new BodyWeights.InvalidBodyWeightBatchImport({
                      line: "bad",
                      lineNumber: 2,
                      reason: "invalid-line",
                    })
                  )
                : Effect.fail(_storeError),
          })
        )
      );

      yield* importer.send(
        BodyWeightImporterEvents.ChangeImportInput({ value: "bad" })
      );
      yield* importer.send(BodyWeightImporterEvents.ImportWeights());
      const invalid = yield* Machine.waitFor(
        importer,
        ({ state }) =>
          BodyWeightImporterStates.matches(state, "Idle") &&
          state.value.message !== null
      );

      expect(invalid.state.value.message).toBe(
        "Line 2 should look like 26-06-26 77.40."
      );

      yield* importer.send(
        BodyWeightImporterEvents.ChangeImportInput({ value: "other" })
      );
      yield* importer.send(BodyWeightImporterEvents.ImportWeights());
      const failed = yield* Machine.waitFor(
        importer,
        ({ state }) =>
          BodyWeightImporterStates.matches(state, "Idle") &&
          state.value.message === "Could not import these weights."
      );

      expect(failed.state.value.input).toBe("other");
    }).pipe(Effect.scoped)
  );
});

describe("BodyWeightRouteMachine", () => {
  it.effect("waits for weight data before handling calendar events", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(BodyWeightRouteMachine, {
        input: _routeInput,
        events: [
          BodyWeightRouteEvents.NextMonth(),
          BodyWeightRouteEvents.SelectDate({ dateKey: _dateKey }),
          BodyWeightRouteEvents.OpenImport(),
          BodyWeightRouteEvents.Reload(),
        ],
      });

      yield* MachineTest.verify(BodyWeightRouteMachine, trace);
      expect(trace.finalConfiguration).toContain("Loading");
      expect(trace.final.value).toMatchObject({
        dateKey: _dateKey,
        message: null,
        monthEntries: [],
        report: null,
      });

      const coverage = MachineTest.coverage(BodyWeightRouteMachine, trace);
      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(coverage.transitions.definitions.missing).toBe(
        coverage.transitions.definitions.total
      );
    })
  );

  it.live("loads the report, saves through the editor and reloads", () =>
    Effect.gen(function* () {
      const entry = yield* _entry({
        dateKey: "2026-11-03",
        weightKilograms: 80.4,
      });
      const ranges: BodyWeights.BodyWeightRangeInput[] = [];
      const saved: BodyWeights.SaveBodyWeightInput[] = [];
      const route = yield* Machine.start(
        BodyWeightRouteMachine,
        _routeInput
      ).pipe(
        Effect.provide(
          _routeLayer({
            bodyWeights: {
              listRange: ({ input }) =>
                Effect.sync(() => {
                  ranges.push(input);

                  return [entry];
                }),
              save: ({ input }) =>
                Effect.sync(() => {
                  saved.push(input);

                  return new BodyWeights.SavedBodyWeightEntry({
                    bodyWeightEntry: entry,
                    previousBodyWeightEntry: entry,
                  });
                }),
            },
          })
        )
      );
      const ready = yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(ranges).toEqual([
        { endDateKey: "2026-11-30", startDateKey: "2026-11-01" },
      ]);
      expect(ready.state.value.report?.endDateKey).toBe("2026-11-08");
      expect(ready.state.value.monthEntries).toHaveLength(1);

      yield* route.send(
        BodyWeightRouteEvents.SelectDate({
          dateKey: Domain.DateKey.make("2026-11-03"),
        })
      );
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Editing")
      );
      const editor = yield* _activeChild(route.child(BodyWeightEditorChild));
      const editorState = yield* editor.state;

      expect(editorState.value).toMatchObject({
        dateKey: "2026-11-03",
        weightInput: "80.40",
      });

      yield* editor.send(BodyWeightEditorEvents.ChangeWeight({ value: "80" }));
      yield* editor.send(BodyWeightEditorEvents.Save());
      yield* Machine.waitFor(
        route,
        ({ state }) =>
          ranges.length === 2 &&
          BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(saved).toEqual([{ dateKey: "2026-11-03", weightKilograms: "80" }]);
      expect(Option.isNone(yield* route.child(BodyWeightEditorChild))).toBe(
        true
      );
    }).pipe(Effect.scoped)
  );

  it.live("closes the editor and imports weights", () =>
    Effect.gen(function* () {
      const imported: BodyWeights.ImportBodyWeightsInput[] = [];
      const reports: BodyWeightReports.GetBodyWeightReportRangeInput[] = [];
      const route = yield* Machine.start(
        BodyWeightRouteMachine,
        _routeInput
      ).pipe(
        Effect.provide(
          _routeLayer({
            bodyWeights: {
              listRange: () => Effect.succeed([]),
              importBatch: ({ input }) =>
                Effect.sync(() => {
                  imported.push(input);

                  return new BodyWeights.ImportedBodyWeightEntries({
                    savedBodyWeightEntries: [],
                  });
                }),
            },
            getRange: ({ input }) =>
              Effect.andThen(
                Effect.sync(() => reports.push(input)),
                _report({ input })
              ),
          })
        )
      );

      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );
      yield* route.send(
        BodyWeightRouteEvents.SelectDate({ dateKey: _dateKey })
      );
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Editing")
      );
      const editor = yield* _activeChild(route.child(BodyWeightEditorChild));

      expect((yield* editor.state).value.selectedEntry).toBeNull();

      yield* editor.send(BodyWeightEditorEvents.Close());
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      yield* route.send(BodyWeightRouteEvents.OpenImport());
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.ImportingForm")
      );
      const importer = yield* _activeChild(
        route.child(BodyWeightImporterChild)
      );

      yield* importer.send(BodyWeightImporterEvents.Close());
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      yield* route.send(BodyWeightRouteEvents.OpenImport());
      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.ImportingForm")
      );
      const nextImporter = yield* _activeChild(
        route.child(BodyWeightImporterChild)
      );

      yield* nextImporter.send(
        BodyWeightImporterEvents.ChangeImportInput({ value: "26-06-26 77.40" })
      );
      yield* nextImporter.send(BodyWeightImporterEvents.ImportWeights());
      yield* Machine.waitFor(
        route,
        ({ state }) =>
          reports.length === 2 &&
          BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(imported).toEqual([{ text: "26-06-26 77.40" }]);
    }).pipe(Effect.scoped)
  );

  it.live("navigates months and reports month load failures", () =>
    Effect.gen(function* () {
      const ranges: BodyWeights.BodyWeightRangeInput[] = [];
      const route = yield* Machine.start(
        BodyWeightRouteMachine,
        _routeInput
      ).pipe(
        Effect.provide(
          _routeLayer({
            bodyWeights: {
              listRange: ({ input }) =>
                Effect.suspend(() => {
                  ranges.push(input);

                  return input.startDateKey === "2026-10-01"
                    ? Effect.fail(_storeError)
                    : Effect.succeed([]);
                }),
            },
          })
        )
      );

      yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );
      yield* route.send(BodyWeightRouteEvents.NextMonth());
      const next = yield* Machine.waitFor(
        route,
        ({ state }) =>
          ranges.length === 2 &&
          BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(next.state.value).toMatchObject({
        dateKey: "2026-12-08",
        message: null,
      });

      yield* route.send(BodyWeightRouteEvents.PreviousMonth());
      yield* Machine.waitFor(
        route,
        ({ state }) =>
          ranges.length === 3 &&
          BodyWeightRouteStates.matches(state, "Ready.Closed")
      );
      yield* route.send(BodyWeightRouteEvents.PreviousMonth());
      const failed = yield* Machine.waitFor(
        route,
        ({ state }) =>
          ranges.length === 4 &&
          BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(failed.state.value).toMatchObject({
        dateKey: "2026-10-08",
        message: "Could not load this month's weights. Try again.",
      });
      expect(failed.state.value.report).not.toBeNull();
    }).pipe(Effect.scoped)
  );

  it.live("shows a load failure and recovers on reload", () =>
    Effect.gen(function* () {
      const attempts: number[] = [];
      const route = yield* Machine.start(BodyWeightRouteMachine, {
        ..._routeInput,
        reportDayCount: 7,
      }).pipe(
        Effect.provide(
          _routeLayer({
            bodyWeights: { listRange: () => Effect.succeed([]) },
            getRange: ({ input }) =>
              Effect.suspend(() => {
                attempts.push(attempts.length);

                return attempts.length === 1
                  ? Effect.fail(
                      new BodyWeightReports.InvalidBodyWeightReportRange({
                        endDateKey: Domain.DateKey.make(input.endDateKey),
                        startDateKey: Domain.DateKey.make(input.startDateKey),
                      })
                    )
                  : _report({ input });
              }),
          })
        )
      );
      const failed = yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Failed")
      );

      expect(failed.state.value).toMatchObject({
        message: "Could not load weight data.",
        report: null,
      });

      yield* route.send(BodyWeightRouteEvents.Reload());
      const ready = yield* Machine.waitFor(route, ({ state }) =>
        BodyWeightRouteStates.matches(state, "Ready.Closed")
      );

      expect(ready.state.value.message).toBeNull();
      expect(ready.state.value.report?.startDateKey).toBe("2026-11-02");
    }).pipe(Effect.scoped)
  );
});
