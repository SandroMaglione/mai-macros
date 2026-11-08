import { describe, expect, it } from "@effect/vitest";
import { Domain, Foods, Measurements, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  FoodConversionEvents,
  FoodConversionLoaderEvents,
  FoodConversionLoaderMachine,
  FoodConversionLoaderStates,
  FoodConversionMachine,
  FoodConversionStates,
} from "@/machines/food-conversion-machine";

const foodId = Domain.FoodId.make("11111111-1111-4111-8111-111111111111");

const _food = (
  massVolumeConversion:
    | {
        readonly mass: { readonly amount: number; readonly unit: "kg" };
        readonly volume: { readonly amount: number; readonly unit: "l" };
      }
    | undefined
) =>
  Schema.decodeUnknownEffect(Domain.Food)({
    id: foodId,
    name: "Milk",
    origin: "user",
    energyKcal: 64,
    proteinGrams: 3.4,
    carbsGrams: 4.8,
    fatGrams: 3.6,
    ...(massVolumeConversion === undefined ? {} : { massVolumeConversion }),
    createdAt: 100,
    updatedAt: 100,
  }).pipe(Effect.orDie);

const _usage = (mealEntryCount: number) =>
  Schema.decodeEffect(Foods.FoodEditUsage)({
    foodId,
    mealEntryCount,
    portions: [],
  }).pipe(Effect.orDie);

const _conversion = {
  mass: { amount: 1.03, unit: "kg" },
  volume: { amount: 1, unit: "l" },
} as const;

describe("FoodConversionLoaderMachine", () => {
  it.live("loads the food and retries after a failure", () =>
    Effect.gen(function* () {
      const attempts: string[] = [];
      const loader = yield* Machine.start(FoodConversionLoaderMachine, {
        foodId,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            get: () =>
              attempts.push("get") === 1
                ? Effect.fail(
                    new Store.NutritionStoreError({ cause: "unavailable" })
                  )
                : _food(undefined),
            inspectEdit: () => _usage(0),
          })
        )
      );
      const failed = yield* Machine.waitFor(loader, ({ state }) =>
        FoodConversionLoaderStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          FoodConversionLoaderStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load this food conversion."));

      yield* loader.send(FoodConversionLoaderEvents.Retry());
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        FoodConversionLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          FoodConversionLoaderStates.get(ready.state, "Ready"),
          ({ data }) => data.food.id
        )
      ).toEqual(Option.some(foodId));
    }).pipe(Effect.scoped)
  );
});

describe("FoodConversionMachine", () => {
  it.effect("routes changes through a preview only for used foods", () =>
    Effect.gen(function* () {
      const unused = { food: yield* _food(undefined), usage: yield* _usage(0) };
      const used = {
        food: yield* _food(_conversion),
        usage: yield* _usage(3),
      };
      const saveDirectly = yield* MachineTest.run(FoodConversionMachine, {
        input: unused,
        events: [
          FoodConversionEvents.ChangeMassAmount({ value: "1,03" }),
          FoodConversionEvents.ChangeMassUnit({ unit: "g" }),
          FoodConversionEvents.ChangeVolumeAmount({ value: "1" }),
          FoodConversionEvents.ChangeVolumeUnit({ unit: "ml" }),
          FoodConversionEvents.Submit(),
        ],
      });
      const removeDirectly = yield* MachineTest.run(FoodConversionMachine, {
        input: unused,
        events: [FoodConversionEvents.Remove()],
      });
      const previewSubmit = yield* MachineTest.run(FoodConversionMachine, {
        input: used,
        events: [FoodConversionEvents.Submit()],
      });
      const previewRemove = yield* MachineTest.run(FoodConversionMachine, {
        input: used,
        events: [FoodConversionEvents.Remove()],
      });
      const traces = [
        saveDirectly,
        removeDirectly,
        previewSubmit,
        previewRemove,
      ];

      yield* Effect.forEach(traces, (trace) =>
        MachineTest.verify(FoodConversionMachine, trace)
      );
      expect(saveDirectly.final.value.form).toEqual({
        massAmount: "1,03",
        massUnit: "g",
        volumeAmount: "1",
        volumeUnit: "ml",
      });
      expect(saveDirectly.finalConfiguration).toContain("Saving");
      expect(removeDirectly.finalConfiguration).toContain("Saving");
      expect(previewSubmit.initial.startingState.value.form).toEqual({
        massAmount: "1.03",
        massUnit: "kg",
        volumeAmount: "1",
        volumeUnit: "l",
      });
      expect(previewSubmit.finalConfiguration).toContain("Previewing");
      expect(previewRemove.finalConfiguration).toContain("Previewing");
      expect(previewRemove.final.value.form).toEqual({
        massAmount: "",
        massUnit: "kg",
        volumeAmount: "",
        volumeUnit: "l",
      });

      const coverage = MachineTest.coverage(FoodConversionMachine, traces);

      expect(coverage.transitions.branches.missing).toBe(
        coverage.transitions.definitions.missing
      );
      expect(
        coverage.transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type === "event" ? trigger.event : trigger.type}`
        )
      ).toEqual([
        "Previewing:preview.done",
        "Previewing:preview.failure",
        "Reviewing:CancelReview",
        "Reviewing:Confirm",
        "Saving:save.done",
        "Saving:save.failure",
      ]);
    })
  );

  it.live("previews, reviews and saves a conversion", () =>
    Effect.gen(function* () {
      const food = yield* _food(undefined);
      const usage = yield* _usage(2);
      const previews: Foods.SetFoodMassVolumeConversionInput[] = [];
      const saves: Foods.SetFoodMassVolumeConversionInput[] = [];
      const editor = yield* Machine.start(FoodConversionMachine, {
        food,
        usage,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            previewFoodMassVolumeConversionEdit: ({ input }) =>
              Effect.sync(() => previews.push(input)).pipe(
                Effect.as(new Foods.FoodEditPreview({ usage }))
              ),
            setFoodMassVolumeConversion: ({ input }) =>
              Effect.gen(function* () {
                saves.push(input);
                return new Foods.EditedFood({
                  food: yield* _food(_conversion),
                  previousFood: food,
                  revisedMealEntryCount: 2,
                });
              }),
          })
        )
      );

      yield* editor.send(
        FoodConversionEvents.ChangeMassAmount({ value: "1,03" })
      );
      yield* editor.send(
        FoodConversionEvents.ChangeVolumeAmount({ value: "1" })
      );
      yield* editor.send(FoodConversionEvents.Submit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodConversionStates.matches(state, "Reviewing")
      );
      yield* editor.send(FoodConversionEvents.CancelReview());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodConversionStates.matches(state, "Editing")
      );
      yield* editor.send(FoodConversionEvents.Submit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodConversionStates.matches(state, "Reviewing")
      );
      yield* editor.send(FoodConversionEvents.Confirm());
      const saved = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodConversionStates.matches(state, "Editing") &&
          state.value.message === "Conversion saved."
      );
      const expectedInput = {
        foodId,
        massVolumeConversion: {
          mass: { amount: "1.03", unit: "kg" },
          volume: { amount: "1", unit: "l" },
        },
      };

      expect(previews).toEqual([expectedInput, expectedInput]);
      expect(saves).toEqual([expectedInput]);
      expect(saved.state.value.messageTone).toBe("success");
      expect(saved.state.value.form).toEqual({
        massAmount: "1.03",
        massUnit: "kg",
        volumeAmount: "1",
        volumeUnit: "l",
      });
    }).pipe(Effect.scoped)
  );

  it.live("reports an incompatible conversion from the preview", () =>
    Effect.gen(function* () {
      const editor = yield* Machine.start(FoodConversionMachine, {
        food: yield* _food(_conversion),
        usage: yield* _usage(2),
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            previewFoodMassVolumeConversionEdit: () =>
              Effect.fail(
                new Measurements.IncompatibleFoodMeasurement({
                  sourceUnit: "g",
                  targetUnit: "ml",
                })
              ),
          })
        )
      );

      yield* editor.send(FoodConversionEvents.Remove());
      const failed = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodConversionStates.matches(state, "Editing") &&
          state.value.message !== null
      );

      expect(failed.state.value.message).toBe(
        "This conversion cannot interpret every previous meal entry."
      );
      expect(failed.state.value.messageTone).toBe("danger");
    }).pipe(Effect.scoped)
  );

  it.live("removes a conversion without a preview for unused foods", () =>
    Effect.gen(function* () {
      const food = yield* _food(_conversion);
      const editor = yield* Machine.start(FoodConversionMachine, {
        food,
        usage: yield* _usage(0),
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            setFoodMassVolumeConversion: () =>
              Effect.map(
                _food(undefined),
                (removed) =>
                  new Foods.EditedFood({
                    food: removed,
                    previousFood: food,
                    revisedMealEntryCount: 0,
                  })
              ),
          })
        )
      );

      yield* editor.send(FoodConversionEvents.Remove());
      const removed = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodConversionStates.matches(state, "Editing") &&
          state.value.message !== null
      );

      expect(removed.state.value.message).toBe("Conversion removed.");
    }).pipe(Effect.scoped)
  );
});
