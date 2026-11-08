import { describe, expect, it } from "@effect/vitest";
import { Domain, Foods, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  FoodPortionsEvents,
  FoodPortionsLoaderEvents,
  FoodPortionsLoaderMachine,
  FoodPortionsLoaderStates,
  FoodPortionsMachine,
  FoodPortionsStates,
} from "@/machines/food-portions-machine";

const foodId = Domain.FoodId.make("11111111-1111-4111-8111-111111111111");
const usedPortionId = Domain.FoodPortionId.make(
  "22222222-2222-4222-8222-222222222222"
);
const unusedPortionId = Domain.FoodPortionId.make(
  "33333333-3333-4333-8333-333333333333"
);
const missingPortionId = Domain.FoodPortionId.make(
  "44444444-4444-4444-8444-444444444444"
);

const _food = (scoopName: string) =>
  Schema.decodeUnknownEffect(Domain.Food)({
    id: foodId,
    name: "Protein powder",
    origin: "user",
    energyKcal: 380,
    proteinGrams: 80,
    carbsGrams: 8,
    fatGrams: 6,
    portions: [
      {
        id: usedPortionId,
        name: scoopName,
        size: { amount: 30, unit: "g" },
        position: 0,
      },
      {
        id: unusedPortionId,
        name: "Spoon",
        size: { amount: 10, unit: "g" },
        position: 1,
      },
    ],
    createdAt: 100,
    updatedAt: 100,
  }).pipe(Effect.orDie);

const _usage = Schema.decodeEffect(Foods.FoodEditUsage)({
  foodId,
  mealEntryCount: 3,
  portions: [
    { portionId: usedPortionId, mealEntryCount: 3 },
    { portionId: unusedPortionId, mealEntryCount: 0 },
  ],
}).pipe(Effect.orDie);

const _data = Effect.all({ food: _food("Scoop"), usage: _usage });

const _scoop = Schema.decodeUnknownEffect(Domain.FoodPortion)({
  id: usedPortionId,
  name: "Scoop",
  size: { amount: 30, unit: "g" },
  position: 0,
}).pipe(Effect.orDie);

const _scoopUsage = Schema.decodeEffect(Foods.FoodPortionUsage)({
  portionId: usedPortionId,
  mealEntryCount: 3,
}).pipe(Effect.orDie);

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

describe("FoodPortionsLoaderMachine", () => {
  it.live("loads the food and retries after a failure", () =>
    Effect.gen(function* () {
      const attempts: string[] = [];
      const loader = yield* Machine.start(FoodPortionsLoaderMachine, {
        foodId,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            get: () =>
              attempts.push("get") === 1
                ? Effect.fail(_storeError)
                : _food("Scoop"),
            inspectEdit: () => _usage,
          })
        )
      );
      const failed = yield* Machine.waitFor(loader, ({ state }) =>
        FoodPortionsLoaderStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          FoodPortionsLoaderStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load the portions for this food."));

      yield* loader.send(FoodPortionsLoaderEvents.Retry());
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        FoodPortionsLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          FoodPortionsLoaderStates.get(ready.state, "Ready"),
          ({ data }) => data.usage.portions.length
        )
      ).toEqual(Option.some(2));
    }).pipe(Effect.scoped)
  );
});

describe("FoodPortionsMachine", () => {
  it.effect("drives every listing, form and dialog transition", () =>
    Effect.gen(function* () {
      const input = yield* _data;
      const adding = yield* MachineTest.run(FoodPortionsMachine, {
        input,
        events: [
          FoodPortionsEvents.Add(),
          FoodPortionsEvents.ChangeForm({ field: "name", value: "Bowl" }),
          FoodPortionsEvents.ChangeForm({ field: "amount", value: "250" }),
          FoodPortionsEvents.ChangeForm({ field: "unit", value: "ml" }),
          FoodPortionsEvents.ChangeForm({ field: "unit", value: "cup" }),
          FoodPortionsEvents.Cancel(),
          FoodPortionsEvents.Add(),
          FoodPortionsEvents.Submit(),
        ],
      });
      const copying = yield* MachineTest.run(FoodPortionsMachine, {
        input,
        events: [
          FoodPortionsEvents.CreateFromPortion({ portionId: missingPortionId }),
          FoodPortionsEvents.CreateFromPortion({ portionId: usedPortionId }),
          FoodPortionsEvents.Cancel(),
          FoodPortionsEvents.CreateFromPortion({ portionId: usedPortionId }),
          FoodPortionsEvents.Submit(),
        ],
      });
      const editingUsed = yield* MachineTest.run(FoodPortionsMachine, {
        input,
        events: [
          FoodPortionsEvents.EditPortion({ portionId: usedPortionId }),
          FoodPortionsEvents.Back(),
          FoodPortionsEvents.EditPortion({ portionId: usedPortionId }),
          FoodPortionsEvents.ConfirmChangeEverywhere(),
          FoodPortionsEvents.Cancel(),
          FoodPortionsEvents.EditPortion({ portionId: usedPortionId }),
          FoodPortionsEvents.ConfirmChangeEverywhere(),
          FoodPortionsEvents.Submit(),
        ],
      });
      const editingUnused = yield* MachineTest.run(FoodPortionsMachine, {
        input,
        events: [
          FoodPortionsEvents.EditPortion({ portionId: missingPortionId }),
          FoodPortionsEvents.EditPortion({ portionId: unusedPortionId }),
          FoodPortionsEvents.Submit(),
        ],
      });
      const removing = yield* MachineTest.run(FoodPortionsMachine, {
        input,
        events: [
          FoodPortionsEvents.RemovePortion({ portionId: usedPortionId }),
          FoodPortionsEvents.RemovePortion({ portionId: unusedPortionId }),
        ],
      });
      const traces = [adding, copying, editingUsed, editingUnused, removing];

      yield* Effect.forEach(traces, (trace) =>
        MachineTest.verify(FoodPortionsMachine, trace)
      );
      expect(
        adding.steps
          .slice(3, 5)
          .map(({ after }) =>
            Option.map(
              FoodPortionsStates.get(after, "Loaded"),
              ({ form }) => form
            )
          )
      ).toEqual([
        Option.some({ amount: "250", name: "Bowl", unit: "ml" }),
        Option.some({ amount: "250", name: "Bowl", unit: "ml" }),
      ]);
      expect(
        Option.map(
          FoodPortionsStates.get(adding.final, "Loaded.SavingNew"),
          ({ portionId }) => portionId
        )
      ).toEqual(Option.some(null));
      expect(
        copying.steps.map(({ afterConfiguration }) => afterConfiguration.at(-1))
      ).toEqual([
        "Loaded.Listing",
        "Loaded.CreatingFromPortion",
        "Loaded.Listing",
        "Loaded.CreatingFromPortion",
        "Loaded.SavingNew",
      ]);
      expect(
        Option.map(
          FoodPortionsStates.get(copying.final, "Loaded"),
          ({ form }) => form
        )
      ).toEqual(Option.some({ amount: "30", name: "Scoop copy", unit: "g" }));
      expect(
        Option.map(
          FoodPortionsStates.get(copying.final, "Loaded.SavingNew"),
          ({ portionId }) => portionId
        )
      ).toEqual(Option.some(usedPortionId));
      expect(
        editingUsed.steps.map(({ afterConfiguration }) =>
          afterConfiguration.at(-1)
        )
      ).toEqual([
        "Loaded.Edit.Warning",
        "Loaded.Listing",
        "Loaded.Edit.Warning",
        "Loaded.Edit.Form",
        "Loaded.Listing",
        "Loaded.Edit.Warning",
        "Loaded.Edit.Form",
        "Loaded.Edit.Previewing",
      ]);
      expect(
        editingUnused.steps.map(({ afterConfiguration }) =>
          afterConfiguration.at(-1)
        )
      ).toEqual(["Loaded.Listing", "Loaded.Edit.Form", "Loaded.Edit.Saving"]);
      expect(
        Option.map(
          FoodPortionsStates.get(editingUnused.final, "Loaded.Edit"),
          ({ portionId }) => portionId
        )
      ).toEqual(Option.some(unusedPortionId));
      expect(
        removing.steps.map(({ afterConfiguration }) =>
          afterConfiguration.at(-1)
        )
      ).toEqual(["Loaded.Listing", "Loaded.Removing"]);

      const coverage = MachineTest.coverage(FoodPortionsMachine, traces);

      expect(
        coverage.transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type === "event" ? trigger.event : trigger.type}`
        )
      ).toEqual([
        "Loaded.SavingNew:addPortion.done",
        "Loaded.SavingNew:addPortion.failure",
        "Loaded.Removing:removePortion.done",
        "Loaded.Removing:removePortion.failure",
        "Loaded.Edit.Previewing:previewEdit.done",
        "Loaded.Edit.Previewing:previewEdit.failure",
        "Loaded.Edit.Reviewing:Back",
        "Loaded.Edit.Reviewing:ConfirmChangeEverywhere",
        "Loaded.Edit.Saving:editPortion.done",
        "Loaded.Edit.Saving:editPortion.failure",
        "Reloading:load.done",
        "Reloading:load.failure",
        "ReloadFailed:Retry",
      ]);
    })
  );

  it.live("adds a portion and reloads the food", () =>
    Effect.gen(function* () {
      const { food, usage } = yield* _data;
      const added: unknown[] = [];
      const editor = yield* Machine.start(FoodPortionsMachine, {
        food,
        usage,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            addFoodPortion: ({ input }) =>
              Effect.sync(() => added.push(input)).pipe(
                Effect.andThen(
                  Effect.all({ food: _food("Scoop"), portion: _scoop })
                ),
                Effect.map((result) => new Foods.AddedFoodPortion(result))
              ),
            get: () => _food("Scoop"),
            inspectEdit: () => _usage,
          })
        )
      );

      yield* editor.send(FoodPortionsEvents.Add());
      yield* editor.send(
        FoodPortionsEvents.ChangeForm({ field: "name", value: "Bowl" })
      );
      yield* editor.send(
        FoodPortionsEvents.ChangeForm({ field: "amount", value: "250" })
      );
      yield* editor.send(FoodPortionsEvents.Submit());
      const listing = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.get(state, "Loaded").pipe(
          Option.exists(
            ({ message }) =>
              message === "Portion added. Previous entries were unchanged."
          )
        )
      );

      expect(added).toEqual([
        { foodId, name: "Bowl", size: { amount: "250", unit: "g" } },
      ]);
      expect(FoodPortionsStates.matches(listing.state, "Loaded.Listing")).toBe(
        true
      );
    }).pipe(Effect.scoped)
  );

  it.live("reviews and saves a used portion everywhere", () =>
    Effect.gen(function* () {
      const { food, usage } = yield* _data;
      const calls: unknown[] = [];
      const editor = yield* Machine.start(FoodPortionsMachine, {
        food,
        usage,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            previewFoodPortionEdit: ({ input }) =>
              Effect.sync(() => calls.push(["preview", input])).pipe(
                Effect.andThen(
                  Effect.all({ portion: _scoop, usage: _scoopUsage })
                ),
                Effect.map((result) => new Foods.FoodPortionEditPreview(result))
              ),
            editFoodPortionEverywhere: ({ input }) =>
              Effect.sync(() => calls.push(["edit", input])).pipe(
                Effect.andThen(
                  Effect.all({
                    food: _food("Big scoop"),
                    portion: _scoop,
                    previousPortion: _scoop,
                  })
                ),
                Effect.map(
                  (result) =>
                    new Foods.EditedFoodPortion({
                      ...result,
                      revisedMealEntryCount: 3,
                    })
                )
              ),
            get: () => _food("Big scoop"),
            inspectEdit: () => _usage,
          })
        )
      );

      yield* editor.send(
        FoodPortionsEvents.EditPortion({ portionId: usedPortionId })
      );
      yield* editor.send(FoodPortionsEvents.ConfirmChangeEverywhere());
      yield* editor.send(
        FoodPortionsEvents.ChangeForm({ field: "name", value: "Big scoop" })
      );
      yield* editor.send(FoodPortionsEvents.Submit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.matches(state, "Loaded.Edit.Reviewing")
      );
      yield* editor.send(FoodPortionsEvents.ConfirmChangeEverywhere());
      const listing = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.get(state, "Loaded").pipe(
          Option.exists(
            ({ message }) =>
              message === "Portion updated across 3 previous meal entries."
          )
        )
      );
      const input = {
        foodId,
        portionId: usedPortionId,
        name: "Big scoop",
        size: { amount: "30", unit: "g" },
      };

      expect(calls).toEqual([
        ["preview", input],
        ["edit", input],
      ]);
      expect(
        Option.map(
          FoodPortionsStates.get(listing.state, "Loaded"),
          ({ food: reloaded }) => reloaded.portions.map(({ name }) => name)
        )
      ).toEqual(Option.some(["Big scoop", "Spoon"]));
    }).pipe(Effect.scoped)
  );

  it.live("reports mutation and reload failures", () =>
    Effect.gen(function* () {
      const { food, usage } = yield* _data;
      const loads: string[] = [];
      const editor = yield* Machine.start(FoodPortionsMachine, {
        food,
        usage,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            removeUnusedFoodPortion: ({ input }) =>
              Effect.fail(
                new Foods.UsedFoodPortionMutationNotAllowed({
                  foodId,
                  operation: "remove",
                  portionId: Domain.FoodPortionId.make(input.portionId),
                })
              ),
            addFoodPortion: () =>
              Effect.fail(
                new Foods.FoodPortionNameAlreadyExists({
                  foodId,
                  name: "Scoop copy",
                })
              ),
            editFoodPortionEverywhere: () =>
              Effect.map(
                Effect.all({
                  food: _food("Scoop"),
                  portion: _scoop,
                  previousPortion: _scoop,
                }),
                (result) =>
                  new Foods.EditedFoodPortion({
                    ...result,
                    revisedMealEntryCount: 0,
                  })
              ),
            get: () =>
              loads.push("get") === 1
                ? Effect.fail(_storeError)
                : _food("Scoop"),
            inspectEdit: () => _usage,
          })
        )
      );

      yield* editor.send(
        FoodPortionsEvents.RemovePortion({ portionId: unusedPortionId })
      );
      const removeFailed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.get(state, "Loaded").pipe(
          Option.exists(
            ({ message }) =>
              message === "This portion is now used and cannot be removed."
          )
        )
      );

      expect(
        Option.map(
          FoodPortionsStates.get(removeFailed.state, "Loaded"),
          ({ messageTone }) => messageTone
        )
      ).toEqual(Option.some("danger"));

      yield* editor.send(
        FoodPortionsEvents.CreateFromPortion({ portionId: usedPortionId })
      );
      yield* editor.send(FoodPortionsEvents.Submit());
      const addFailed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.get(state, "Loaded").pipe(
          Option.exists(
            ({ message }) =>
              message ===
              "Use a name that is not already assigned to another portion."
          )
        )
      );

      expect(
        Option.map(
          FoodPortionsStates.get(addFailed.state, "Loaded.Adding"),
          ({ portionId }) => portionId
        )
      ).toEqual(Option.some(usedPortionId));

      yield* editor.send(FoodPortionsEvents.Cancel());
      yield* editor.send(
        FoodPortionsEvents.EditPortion({ portionId: unusedPortionId })
      );
      yield* editor.send(FoodPortionsEvents.Submit());
      const reloadFailed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.matches(state, "ReloadFailed")
      );

      expect(
        Option.map(
          FoodPortionsStates.get(reloadFailed.state, "ReloadFailed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load the portions for this food."));

      yield* editor.send(FoodPortionsEvents.Retry());
      const reloaded = yield* Machine.waitFor(editor, ({ state }) =>
        FoodPortionsStates.matches(state, "Loaded.Listing")
      );

      expect(
        Option.map(
          FoodPortionsStates.get(reloaded.state, "Loaded"),
          ({ message }) => message
        )
      ).toEqual(Option.some(null));
      expect(loads).toEqual(["get", "get"]);
    }).pipe(Effect.scoped)
  );
});
