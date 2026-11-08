import { describe, expect, it } from "@effect/vitest";
import { DailyLogs, Domain, MealEntries, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Ref } from "effect";
import type { Href } from "expo-router";

import {
  OneOffEntryEvents,
  OneOffEntryMachine,
  OneOffEntryStates,
} from "@/machines/one-off-entry-machine";
import { Navigation } from "@/machines/services/navigation";

import {
  breakfastMealId,
  makeOneOffMealEntry,
  makeOpenedDay,
  makeUnrecordedDay,
  pastDateKey,
} from "./meal-entry-machine-fixtures.ts";

const noodlesId = Domain.MealEntryId.make(
  "55555555-5555-4555-8555-555555555555"
);
const saladId = Domain.MealEntryId.make("66666666-6666-4666-8666-666666666666");

const _history = Effect.all([
  makeOneOffMealEntry({
    amountDescription: "1 bowl",
    dateKey: pastDateKey,
    id: noodlesId,
    mealId: breakfastMealId,
    name: "Noodle bowl",
  }),
  makeOneOffMealEntry({
    amountDescription: "half plate",
    dateKey: pastDateKey,
    id: saladId,
    mealId: breakfastMealId,
    name: "Salad",
  }),
]).pipe(Effect.orDie);

const _navigation = () => {
  const replaced: Href[] = [];
  const layer = Layer.mock(Navigation, {
    replace: (href) => Effect.sync(() => replaced.push(href)),
  });

  return { layer, replaced };
};

const _openedDay = Effect.orDie(makeOpenedDay(pastDateKey));

const newRoute = {
  dateKey: pastDateKey,
  meal: breakfastMealId,
  mealEntryId: null,
};

describe("OneOffEntryMachine", () => {
  it.effect("ignores form events until the meal has loaded", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(OneOffEntryMachine, {
        input: newRoute,
        events: [
          OneOffEntryEvents.Save(),
          OneOffEntryEvents.ShowHistory(),
          OneOffEntryEvents.Text({ field: "name", value: "Soup" }),
        ],
      });

      yield* MachineTest.verify(OneOffEntryMachine, trace);
      expect(trace.finalConfiguration).toContain("Loading");
      expect(trace.final.value.values.name).toBe("");

      const coverage = MachineTest.coverage(OneOffEntryMachine, trace);

      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(
        coverage.transitions.definitions.misses.some(
          ({ source, trigger }) =>
            source === "Loading" && trigger.type === "invoke"
        )
      ).toBe(true);
    })
  );

  it.live(
    "searches past entries, reuses one, edits it and adds it to the meal",
    () =>
      Effect.gen(function* () {
        const history = yield* _history;
        const day = yield* _openedDay;
        const navigation = _navigation();
        const created: MealEntries.CreateOneOffEntryInput[] = [];
        const machine = yield* Machine.start(OneOffEntryMachine, newRoute).pipe(
          Effect.provide(
            Layer.mergeAll(
              navigation.layer,
              Layer.mock(DailyLogs.DailyLogs, {
                open: () => Effect.succeed(day),
              }),
              Layer.mock(MealEntries.MealEntries, {
                listOneOffHistory: () => Effect.succeed(history),
                createOneOff: ({ input }) =>
                  Effect.sync(() => created.push(input)).pipe(
                    Effect.andThen(
                      Effect.map(
                        _history,
                        ([entry]) =>
                          new MealEntries.CreatedMealEntry({
                            mealEntry: entry,
                          })
                      )
                    )
                  ),
              })
            )
          )
        );

        const ready = yield* Machine.waitFor(machine, ({ state }) =>
          OneOffEntryStates.matches(state, "Ready")
        );

        expect(ready.state.value.matchingHistory.map(({ id }) => id)).toEqual([
          noodlesId,
          saladId,
        ]);

        yield* machine.send(OneOffEntryEvents.ShowHistory());
        yield* machine.send(OneOffEntryEvents.SearchHistory({ query: "BOWL" }));

        const searched = yield* Machine.waitFor(
          machine,
          ({ state }) =>
            OneOffEntryStates.matches(state, "History.Ready") &&
            state.value.historyQuery === "BOWL"
        );

        expect(
          searched.state.value.matchingHistory.map(({ id }) => id)
        ).toEqual([noodlesId]);

        yield* machine.send(
          OneOffEntryEvents.Reuse({ mealEntryId: noodlesId })
        );
        yield* machine.send(
          OneOffEntryEvents.Text({ field: "note", value: "Extra spicy" })
        );
        yield* machine.send(
          OneOffEntryEvents.Nutrient({ field: "fatGrams", value: "20" })
        );
        yield* machine.send(
          OneOffEntryEvents.Source({ field: "fatGrams", source: "Recorded" })
        );
        yield* machine.send(
          OneOffEntryEvents.AllSources({ source: "Estimated" })
        );

        const edited = yield* Machine.waitFor(
          machine,
          ({ state }) =>
            OneOffEntryStates.matches(state, "Ready") &&
            state.value.values.nutrients.fatGrams.value === "20" &&
            state.value.values.nutrients.energyKcal.source === "Estimated"
        );

        expect(edited.state.value.values.name).toBe("Noodle bowl");
        expect(edited.state.value.values.note).toBe("Extra spicy");
        expect(edited.state.value.quickInput).toContain("Noodle bowl");

        yield* machine.send(OneOffEntryEvents.Save());
        yield* Machine.waitFor(
          machine,
          ({ state }) =>
            navigation.replaced.length === 1 &&
            OneOffEntryStates.matches(state, "Done")
        );

        expect(created).toMatchObject([
          {
            amountDescription: "1 bowl",
            dateKey: pastDateKey,
            mealId: breakfastMealId,
            name: "Noodle bowl",
            note: "Extra spicy",
          },
        ]);
        expect(navigation.replaced).toEqual([
          { pathname: "/days/[dateKey]", params: { dateKey: pastDateKey } },
        ]);
      }).pipe(Effect.scoped)
  );

  it.live("parses quick input and reports invalid saves", () =>
    Effect.gen(function* () {
      const day = yield* _openedDay;
      const machine = yield* Machine.start(OneOffEntryMachine, newRoute).pipe(
        Effect.provide(
          Layer.mergeAll(
            _navigation().layer,
            Layer.mock(DailyLogs.DailyLogs, {
              open: () => Effect.succeed(day),
            }),
            Layer.mock(MealEntries.MealEntries, {
              listOneOffHistory: () => Effect.succeed([]),
            })
          )
        )
      );

      yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "Ready")
      );
      yield* machine.send(
        OneOffEntryEvents.ChangeQuickInput({
          input: "Noodle bowl, 1 bowl, k650 p25",
        })
      );

      const parsed = yield* Machine.waitFor(
        machine,
        ({ state }) => state.value.values.name === "Noodle bowl"
      );

      expect(parsed.state.value.values.amountDescription).toBe("1 bowl");
      expect(parsed.state.value.values.nutrients.energyKcal.value).toBe("650");
      expect(parsed.state.value.quickInputIssues).toEqual([]);

      yield* machine.send(
        OneOffEntryEvents.Text({ field: "name", value: " " })
      );
      yield* machine.send(OneOffEntryEvents.Save());

      const invalid = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          state.value.notice !== null &&
          OneOffEntryStates.matches(state, "Ready")
      );

      expect(invalid.state.value.notice).toBe("Enter a name for this entry.");
    }).pipe(Effect.scoped)
  );

  it.live("retries opening and loading past entries", () =>
    Effect.gen(function* () {
      const history = yield* _history;
      const day = yield* _openedDay;
      const unrecorded = yield* Effect.orDie(makeUnrecordedDay(pastDateKey));
      const opens = yield* Ref.make(0);
      const historyLoads = yield* Ref.make(0);
      const machine = yield* Machine.start(OneOffEntryMachine, newRoute).pipe(
        Effect.provide(
          Layer.mergeAll(
            _navigation().layer,
            Layer.mock(DailyLogs.DailyLogs, {
              open: () =>
                Effect.map(
                  Ref.getAndUpdate(opens, (count) => count + 1),
                  (count) => (count === 0 ? unrecorded : day)
                ),
            }),
            Layer.mock(MealEntries.MealEntries, {
              listOneOffHistory: () =>
                Effect.flatMap(
                  Ref.getAndUpdate(historyLoads, (count) => count + 1),
                  (count) =>
                    count < 2
                      ? Effect.fail(
                          new Store.NutritionStoreError({ cause: "busy" })
                        )
                      : Effect.succeed(history)
                ),
            })
          )
        )
      );

      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "Failure")
      );

      expect(failed.state.value.notice).toBe(
        "Could not open this entry: Meal unavailable."
      );

      yield* machine.send(OneOffEntryEvents.Retry());

      const ready = yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "Ready")
      );

      expect(ready.state.value.history).toBeNull();

      yield* machine.send(OneOffEntryEvents.ShowHistory());
      yield* machine.send(OneOffEntryEvents.Retry());

      const historyFailed = yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "History.Failure")
      );

      expect(historyFailed.state.value.notice).toBe(
        "Unable to load past entries"
      );

      yield* machine.send(OneOffEntryEvents.Retry());

      const loaded = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          OneOffEntryStates.matches(state, "History.Ready") &&
          state.value.history !== null
      );

      expect(loaded.state.value.notice).toBeNull();
      expect(loaded.state.value.matchingHistory.map(({ id }) => id)).toEqual([
        noodlesId,
        saladId,
      ]);

      yield* machine.send(OneOffEntryEvents.ShowForm());
      yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "Ready")
      );
    }).pipe(Effect.scoped)
  );

  it.live("edits an existing entry without history and deletes it", () =>
    Effect.gen(function* () {
      const [entry] = yield* _history;
      const day = yield* _openedDay;
      const navigation = _navigation();
      const deleted: MealEntries.DeleteMealEntryInput[] = [];
      const machine = yield* Machine.start(OneOffEntryMachine, {
        ...newRoute,
        mealEntryId: noodlesId,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            navigation.layer,
            Layer.mock(DailyLogs.DailyLogs, {
              open: () => Effect.succeed(day),
            }),
            Layer.mock(MealEntries.MealEntries, {
              listForDay: () => Effect.succeed([entry]),
              delete: ({ input }) =>
                Effect.sync(() => {
                  deleted.push(input);

                  return new MealEntries.DeletedMealEntry({ mealEntry: entry });
                }),
            })
          )
        )
      );

      const ready = yield* Machine.waitFor(machine, ({ state }) =>
        OneOffEntryStates.matches(state, "Ready")
      );

      expect(ready.state.value.values.name).toBe("Noodle bowl");
      expect(ready.state.value.history).toBeNull();

      yield* machine.send(OneOffEntryEvents.ShowHistory());
      yield* machine.send(OneOffEntryEvents.Delete());
      yield* Machine.waitFor(
        machine,
        ({ state }) =>
          navigation.replaced.length === 1 &&
          OneOffEntryStates.matches(state, "Done")
      );

      expect(deleted).toEqual([{ mealEntryId: noodlesId }]);
      expect(navigation.replaced).toEqual([
        { pathname: "/days/[dateKey]", params: { dateKey: pastDateKey } },
      ]);
    }).pipe(Effect.scoped)
  );
});
