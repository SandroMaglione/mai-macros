import { describe, expect, it } from "@effect/vitest";
import { Domain, Foods, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  FoodNutritionEvents,
  FoodNutritionLoaderEvents,
  FoodNutritionLoaderMachine,
  FoodNutritionLoaderStates,
  FoodNutritionMachine,
  FoodNutritionStates,
  nutritionDraft,
} from "@/machines/food-nutrition-machine";

const foodId = Domain.FoodId.make("11111111-1111-4111-8111-111111111111");

const _food = (nutritionCorrections: Domain.FoodNutritionCorrections) =>
  Schema.decodeUnknownEffect(Domain.Food)({
    id: foodId,
    name: "Oats",
    origin: "app-default",
    energyKcal: 380,
    proteinGrams: 13,
    carbsGrams: 60,
    fatGrams: 7,
    nutritionCorrections,
    createdAt: 100,
    updatedAt: 100,
  }).pipe(Effect.orDie);

const _usage = Schema.decodeEffect(Foods.FoodEditUsage)({
  foodId,
  mealEntryCount: 2,
  portions: [],
}).pipe(Effect.orDie);

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

describe("FoodNutritionLoaderMachine", () => {
  it.live("loads the food and its usage", () =>
    Effect.gen(function* () {
      const loader = yield* Machine.start(FoodNutritionLoaderMachine, {
        foodId,
      });
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        FoodNutritionLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          FoodNutritionLoaderStates.get(ready.state, "Ready"),
          ({ data }) => [data.food.id, data.usage.mealEntryCount]
        )
      ).toEqual(Option.some([foodId, 2]));
    }).pipe(
      Effect.provide(
        Layer.mock(Foods.Foods, {
          get: () => _food({}),
          inspectEdit: () => _usage,
        })
      ),
      Effect.scoped
    )
  );

  it.live("shows a retryable failure when the food cannot load", () =>
    Effect.gen(function* () {
      const attempts: string[] = [];
      const loader = yield* Machine.start(FoodNutritionLoaderMachine, {
        foodId,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            get: () =>
              attempts.push("get") === 1 ? Effect.fail(_storeError) : _food({}),
            inspectEdit: () => _usage,
          })
        )
      );
      const failed = yield* Machine.waitFor(loader, ({ state }) =>
        FoodNutritionLoaderStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          FoodNutritionLoaderStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load this food."));

      yield* loader.send(FoodNutritionLoaderEvents.Retry());
      yield* Machine.waitFor(loader, ({ state }) =>
        FoodNutritionLoaderStates.matches(state, "Ready")
      );
      expect(attempts).toEqual(["get", "get"]);
    }).pipe(Effect.scoped)
  );
});

describe("FoodNutritionMachine", () => {
  it.effect("edits the draft and only saves valid corrections", () =>
    Effect.gen(function* () {
      const food = yield* _food({ energyKcal: 350 });
      const usage = yield* _usage;
      const trace = yield* MachineTest.run(FoodNutritionMachine, {
        input: { food, usage },
        events: [
          FoodNutritionEvents.Change({ field: "energyKcal", value: "-1" }),
          FoodNutritionEvents.Save(),
          FoodNutritionEvents.Change({ field: "energyKcal", value: "1,5" }),
          FoodNutritionEvents.Save(),
        ],
      });
      const resetTrace = yield* MachineTest.run(FoodNutritionMachine, {
        input: { food, usage },
        events: [FoodNutritionEvents.Reset()],
      });

      yield* MachineTest.verify(FoodNutritionMachine, trace);
      yield* MachineTest.verify(FoodNutritionMachine, resetTrace);
      expect(trace.initial.startingState.value.draft.energyKcal).toBe("350");
      expect(
        trace.steps.map(({ after }) =>
          FoodNutritionStates.matches(after, "Saving")
        )
      ).toEqual([false, false, false, true]);
      expect(
        Option.map(
          FoodNutritionStates.get(trace.final, "Saving"),
          ({ corrections }) => corrections
        )
      ).toEqual(Option.some({ energyKcal: 1.5 }));
      expect(
        Option.map(
          FoodNutritionStates.get(resetTrace.final, "Saving"),
          ({ corrections }) => corrections
        )
      ).toEqual(Option.some({}));
      expect(resetTrace.final.value.draft).toEqual(nutritionDraft({}));

      const coverage = MachineTest.coverage(FoodNutritionMachine, [
        trace,
        resetTrace,
      ]);
      expect(
        coverage.transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type}`
        )
      ).toEqual(["Saving:save.done", "Saving:save.failure"]);
    })
  );

  it.live("saves corrections and reports the outcome", () =>
    Effect.gen(function* () {
      const food = yield* _food({});
      const usage = yield* _usage;
      const saved: unknown[] = [];
      const editor = yield* Machine.start(FoodNutritionMachine, {
        food,
        usage,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            setNutritionCorrections: ({ input }) =>
              saved.push(input) === 1
                ? _food(input.corrections)
                : Effect.fail(_storeError),
          })
        )
      );

      yield* editor.send(
        FoodNutritionEvents.Change({ field: "proteinGrams", value: "20" })
      );
      yield* editor.send(FoodNutritionEvents.Save());
      const savedSnapshot = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodNutritionStates.matches(state, "Editing") &&
          state.value.message === "Saved for all past and future entries."
      );

      expect(saved).toEqual([{ foodId, corrections: { proteinGrams: 20 } }]);
      expect(savedSnapshot.state.value.food.nutritionCorrections).toEqual({
        proteinGrams: 20,
      });

      yield* editor.send(FoodNutritionEvents.Reset());
      const failedSnapshot = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodNutritionStates.matches(state, "Editing") &&
          state.value.message ===
            "Could not save. Your catalog values are unchanged. Try again."
      );

      expect(failedSnapshot.state.value.draft).toEqual(nutritionDraft({}));
    }).pipe(Effect.scoped)
  );
});
