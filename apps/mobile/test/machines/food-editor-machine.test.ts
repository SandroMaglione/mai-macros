import { describe, expect, it } from "@effect/vitest";
import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  FoodEditorEvents,
  FoodEditorMachine,
  FoodEditorStates,
} from "@/machines/food-editor-machine";

const _foodId = Domain.FoodId.make("11111111-1111-4111-8111-111111111111");

const _decodeFood = ({
  name,
  origin,
}: {
  readonly name: string;
  readonly origin: "app-default" | "user";
}) =>
  Schema.decodeEffect(Domain.Food)({
    id: _foodId,
    name,
    origin,
    energyKcal: 140,
    proteinGrams: 12,
    carbsGrams: 1,
    fatGrams: 10,
    createdAt: 100,
    updatedAt: 100,
  });

const _usage = ({ mealEntryCount }: { readonly mealEntryCount: number }) =>
  Schema.decodeEffect(Foods.FoodEditUsage)({
    foodId: _foodId,
    mealEntryCount,
    portions: [],
  });

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

const _foodsLayer = ({
  food,
  mealEntryCount,
  overrides,
}: {
  readonly food: Domain.Food;
  readonly mealEntryCount: number;
  readonly overrides?: Partial<Foods.Foods["Service"]>;
}) =>
  Layer.mock(Foods.Foods, {
    get: () => Effect.succeed(food),
    list: () => Effect.succeed([food]),
    inspectEdit: () => Effect.orDie(_usage({ mealEntryCount })),
    ...overrides,
  });

describe("FoodEditorMachine", () => {
  it.effect("stays in loading until the food has been loaded", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(FoodEditorMachine, {
        input: { foodId: _foodId },
        events: [
          FoodEditorEvents.Refresh(),
          FoodEditorEvents.Retry(),
          FoodEditorEvents.ChooseCopy(),
        ],
      });
      const coverage = MachineTest.coverage(FoodEditorMachine, trace);

      yield* MachineTest.verify(FoodEditorMachine, trace);

      expect(trace.finalConfiguration).toContain("Editor.Loading");
      expect(trace.final.value.foodId).toBe(_foodId);
      expect(trace.final.value.message).toBeNull();
      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(coverage.transitions.definitions.missing).toBe(
        coverage.transitions.definitions.total
      );
    })
  );

  it.live("copies a loaded food through the form and review steps", () =>
    Effect.gen(function* () {
      const food = yield* _decodeFood({ name: "Eggs", origin: "app-default" });
      const copy = yield* _decodeFood({ name: "My eggs", origin: "user" });
      const copied: string[] = [];
      const editor = yield* Machine.start(FoodEditorMachine, {
        foodId: _foodId,
      }).pipe(
        Effect.provide(
          _foodsLayer({
            food,
            mealEntryCount: 2,
            overrides: {
              copy: ({ input }) =>
                Effect.sync(() => {
                  copied.push(input.name);

                  return new Foods.CopiedFood({ food: copy, sourceFood: food });
                }),
            },
          })
        )
      );

      const choosing = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction")
      );

      expect(
        yield* Machine.can(
          FoodEditorMachine,
          choosing.state,
          FoodEditorEvents.ChooseEdit()
        )
      ).toBe(false);
      expect(
        yield* Machine.can(
          FoodEditorMachine,
          choosing.state,
          FoodEditorEvents.DeleteFood()
        )
      ).toBe(false);

      yield* editor.send(FoodEditorEvents.ChooseCopy());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.CopyForm")
      );

      const foodForm = yield* Effect.flatMap(
        editor.child(FoodFormMachine.FoodFormChild),
        Effect.fromOption
      );
      const loadedForm = yield* Machine.waitFor(
        foodForm,
        ({ state }) => state.value.formValues.name !== ""
      );

      expect(loadedForm.state.value.formValues.name).toBe("Eggs");
      expect(loadedForm.state.value.formValues.energyKcal).toBe("140");

      yield* foodForm.send(
        FoodFormMachine.FoodFormEvents.ChangeFormValue({
          name: "name",
          value: "My eggs",
        })
      );
      yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());

      const reviewing = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ReviewingCopy")
      );

      expect(
        Option.map(
          FoodEditorStates.get(reviewing.state, "Editor.Loaded.ReviewingCopy"),
          ({ draft }) => draft.name
        )
      ).toEqual(Option.some("My eggs"));

      yield* editor.send(FoodEditorEvents.Apply());

      const completed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Completed")
      );

      expect(copied).toEqual(["My eggs"]);
      expect(completed.state.value.message).toBe(
        "Food copy created. Previous meal entries were unchanged."
      );
      expect(
        Option.map(
          FoodEditorStates.get(completed.state, "Editor.Completed"),
          ({ food }) => food.name
        )
      ).toEqual(Option.some("My eggs"));
    }).pipe(Effect.scoped)
  );

  it.live("previews, reports failures and confirms an edit", () =>
    Effect.gen(function* () {
      const food = yield* _decodeFood({ name: "Eggs", origin: "user" });
      const usage = yield* _usage({ mealEntryCount: 1 });
      const previews: string[] = [];
      const editor = yield* Machine.start(FoodEditorMachine, {
        foodId: _foodId,
      }).pipe(
        Effect.provide(
          _foodsLayer({
            food,
            mealEntryCount: 1,
            overrides: {
              previewFoodDetailsEdit: ({ input }) => {
                previews.push(input.name);

                return input.name === "Broken"
                  ? Effect.fail(
                      new Foods.AppDefaultFoodEditNotAllowed({
                        foodId: _foodId,
                      })
                    )
                  : Effect.succeed(new Foods.FoodEditPreview({ usage }));
              },
              editFoodDetails: () =>
                Effect.succeed(
                  new Foods.EditedFood({
                    food,
                    previousFood: food,
                    revisedMealEntryCount: 3,
                  })
                ),
            },
          })
        )
      );

      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction")
      );
      yield* editor.send(FoodEditorEvents.ChooseEdit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.EditFormWarning")
      );
      yield* editor.send(FoodEditorEvents.BackToChoice());
      yield* editor.send(FoodEditorEvents.ChooseEdit());
      yield* editor.send(FoodEditorEvents.AcknowledgeEdit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.EditForm")
      );

      const foodForm = yield* Effect.flatMap(
        editor.child(FoodFormMachine.FoodFormChild),
        Effect.fromOption
      );

      yield* foodForm.send(
        FoodFormMachine.FoodFormEvents.ChangeFormValue({
          name: "name",
          value: "Broken",
        })
      );
      yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());

      const failed = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodEditorStates.matches(state, "Editor.Loaded.EditForm") &&
          state.value.message !== null
      );

      expect(failed.state.value.message).toBe(
        "Pre-installed foods cannot be edited. Create a copy instead."
      );

      yield* foodForm.send(
        FoodFormMachine.FoodFormEvents.ChangeFormValue({
          name: "name",
          value: "Big eggs",
        })
      );
      yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ReviewingEdit")
      );
      yield* editor.send(FoodEditorEvents.BackToForm());

      const backToForm = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.EditForm")
      );

      expect(
        Option.map(
          FoodEditorStates.get(backToForm.state, "Editor.Loaded.EditForm"),
          ({ draft }) => draft?.name
        )
      ).toEqual(Option.some("Big eggs"));

      yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ReviewingEdit")
      );
      yield* editor.send(FoodEditorEvents.ConfirmEdit());

      const completed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Completed")
      );

      expect(previews).toEqual(["Broken", "Big eggs", "Big eggs"]);
      expect(completed.state.value.message).toBe(
        "Food updated across 3 previous meal entries."
      );
    }).pipe(Effect.scoped)
  );

  it.live("deletes an unused user food and reloads after a failed delete", () =>
    Effect.gen(function* () {
      const food = yield* _decodeFood({ name: "Eggs", origin: "user" });
      const deletions: string[] = [];
      const loads: number[] = [];
      const editor = yield* Machine.start(FoodEditorMachine, {
        foodId: _foodId,
      }).pipe(
        Effect.provide(
          _foodsLayer({
            food,
            mealEntryCount: 0,
            overrides: {
              list: () =>
                Effect.sync(() => {
                  loads.push(loads.length);

                  return [food];
                }),
              deleteUnused: ({ input }) => {
                deletions.push(input.foodId);

                return deletions.length === 1
                  ? Effect.fail(_storeError)
                  : Effect.succeed({ food });
              },
            },
          })
        )
      );

      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction")
      );
      yield* editor.send(FoodEditorEvents.DeleteFood());

      const reloaded = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction") &&
          state.value.message !== null
      );

      expect(reloaded.state.value.message).toBe(
        "Could not delete this food. Only unused foods you created can be removed."
      );

      yield* editor.send(FoodEditorEvents.Refresh());
      yield* Machine.waitFor(
        editor,
        ({ state }) =>
          loads.length === 3 &&
          FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction")
      );
      yield* editor.send(FoodEditorEvents.DeleteFood());
      yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Deleted")
      );

      expect(deletions).toEqual([_foodId, _foodId]);
    }).pipe(Effect.scoped)
  );

  it.live("shows a retryable load failure", () =>
    Effect.gen(function* () {
      const food = yield* _decodeFood({ name: "Eggs", origin: "user" });
      const attempts: number[] = [];
      const editor = yield* Machine.start(FoodEditorMachine, {
        foodId: _foodId,
      }).pipe(
        Effect.provide(
          _foodsLayer({
            food,
            mealEntryCount: 0,
            overrides: {
              get: () => {
                attempts.push(attempts.length);

                return attempts.length === 1
                  ? Effect.fail(_storeError)
                  : Effect.succeed(food);
              },
            },
          })
        )
      );

      const failed = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.LoadFailed")
      );

      expect(failed.state.value.message).toBe("Could not load this food.");

      yield* editor.send(FoodEditorEvents.Retry());

      const loaded = yield* Machine.waitFor(editor, ({ state }) =>
        FoodEditorStates.matches(state, "Editor.Loaded.ChoosingAction")
      );

      expect(loaded.state.value.message).toBeNull();
      expect(attempts).toEqual([0, 1]);
    }).pipe(Effect.scoped)
  );
});
