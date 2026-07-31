import { Machine } from "@typeonce/effect-machine";
import { Effect, Option } from "effect";
import { assert, describe, it } from "vitest";

import {
  ChangeFoodFormValue,
  FoodFormStates,
  FoodFormSubmitted,
  SubmitFoodForm,
  foodFormMachine,
} from "../src/food-form-machine.ts";
import {
  BeginReset,
  ChangeResetConfirmationText,
  ConfirmLocalDataReset,
  LocalDataResetStates,
  makeLocalDataResetMachine,
} from "../src/local-data-reset-machine.ts";
import {
  AddMeal,
  ChangeMealPlanField,
  MealPlanFormStates,
  MealPlanMealsChild,
  MealPlanMealsStates,
  mealPlanFormMachine,
} from "../src/meal-plan-form-machine.ts";

describe("food form machine", () => {
  it("tracks pristine and dirty substates and emits valid submissions", async () => {
    const initial = await Effect.runPromise(
      Machine.planInitial(foodFormMachine, {
        initialFood: null,
        syncQuickInputFromFields: false,
      })
    );

    assert.isTrue(FoodFormStates.matches(initial.state, "Editing.Pristine"));

    const changed = await Effect.runPromise(
      Machine.plan(
        foodFormMachine,
        initial.state,
        new ChangeFoodFormValue({ name: "name", value: "Oats" })
      )
    );

    assert.isTrue(FoodFormStates.matches(changed.next, "Editing.Dirty"));

    const submitted = await Effect.runPromise(
      Machine.plan(foodFormMachine, changed.next, new SubmitFoodForm())
    );
    const emitted: FoodFormSubmitted[] = [];
    await Effect.runPromise(
      Machine.runActions(submitted.actions, {
        raise: () => Effect.void,
        sendParent: (event) =>
          Effect.sync(() => {
            emitted.push(event);
          }),
      })
    );

    assert.instanceOf(emitted[0], FoodFormSubmitted);
  });
});

describe("meal plan form machine", () => {
  it("keeps its invoked meals child alive while parent fields change", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const form = yield* Machine.start(mealPlanFormMachine, {
            initialPlan: null,
          });
          const meals = Option.getOrThrow(
            yield* form.child(MealPlanMealsChild)
          );

          yield* meals.send(AddMeal.make({}));
          yield* Effect.yieldNow;
          yield* form.send(
            ChangeMealPlanField.make({ name: "name", value: "Training" })
          );
          yield* Effect.yieldNow;

          const currentMeals = Option.getOrThrow(
            yield* form.child(MealPlanMealsChild)
          );
          const mealState = yield* currentMeals.state;
          const formState = yield* form.state;

          assert.equal(
            Option.getOrThrow(MealPlanMealsStates.get(mealState, "Editing"))
              .meals.length,
            1
          );
          assert.equal(
            Option.getOrThrow(MealPlanFormStates.get(formState, "Editing"))
              .values.name,
            "Training"
          );
        })
      )
    );
  });
});

describe("local data reset machine", () => {
  it("only leaves confirmation after the exact confirmation is entered", async () => {
    const machine = makeLocalDataResetMachine({
      restartApp: Effect.void,
    });
    const initial = await Effect.runPromise(Machine.planInitial(machine));
    const confirming = await Effect.runPromise(
      Machine.plan(machine, initial.state, new BeginReset())
    );
    const wrongText = await Effect.runPromise(
      Machine.plan(
        machine,
        confirming.next,
        new ChangeResetConfirmationText({ confirmationText: "delete" })
      )
    );
    const rejected = await Effect.runPromise(
      Machine.plan(machine, wrongText.next, new ConfirmLocalDataReset())
    );

    assert.isTrue(
      LocalDataResetStates.matches(rejected.next, "Confirmation.Editing")
    );

    const exactText = await Effect.runPromise(
      Machine.plan(
        machine,
        rejected.next,
        new ChangeResetConfirmationText({
          confirmationText: "Delete all my data.",
        })
      )
    );
    const accepted = await Effect.runPromise(
      Machine.plan(machine, exactText.next, new ConfirmLocalDataReset())
    );

    assert.isTrue(LocalDataResetStates.matches(accepted.next, "Resetting"));
  });
});
