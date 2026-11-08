import { describe, expect, it } from "@effect/vitest";
import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";
import type { Href } from "expo-router";

import { todayDateKey } from "@/lib/date-keys";
import {
  CreateFoodMachine,
  CreateFoodStates,
} from "@/machines/create-food-machine";
import { Dialogs } from "@/machines/services/dialogs";
import { Navigation } from "@/machines/services/navigation";

type _NavigationCall = "back" | { readonly replace: Href };

const _draft = {
  name: "Milk",
  energyKcal: "60",
  proteinGrams: "3",
  carbsGrams: "5",
  fatGrams: "3",
  nutritionReference: { amount: "100", unit: "g" },
  portions: [],
} satisfies FoodFormMachine.FoodFormSubmitInput;

const _food = Schema.decodeUnknownEffect(Domain.Food)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milk",
  origin: "user",
  energyKcal: 60,
  proteinGrams: 3,
  carbsGrams: 5,
  fatGrams: 3,
  createdAt: 100,
  updatedAt: 100,
});

const _dialogsLayer = ({ alerts }: { readonly alerts: string[] }) =>
  Layer.mock(Dialogs, {
    alert: ({ message, title }) =>
      Effect.sync(() => {
        alerts.push(`${title}: ${message}`);
      }),
  });

const _navigationLayer = ({
  calls,
  canGoBack,
}: {
  readonly calls: _NavigationCall[];
  readonly canGoBack: boolean;
}) =>
  Layer.mock(Navigation, {
    back: Effect.sync(() => {
      calls.push("back");
    }),
    canGoBack: Effect.succeed(canGoBack),
    replace: (href: Href) =>
      Effect.sync(() => {
        calls.push({ replace: href });
      }),
  });

const _createdLayer = Layer.mock(Foods.Foods, {
  create: () =>
    Effect.map(Effect.orDie(_food), (food) => new Foods.CreatedFood({ food })),
});

const _submitFromForm = Effect.fnUntraced(function* (
  foodForm: Machine.ChildMachine.Ref<typeof FoodFormMachine.FoodFormChild>
) {
  yield* foodForm.send(
    FoodFormMachine.FoodFormEvents.ChangeQuickInput({
      input: "Milk, k60 f3 c5 p3",
    })
  );
  yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());
});

describe("CreateFoodMachine", () => {
  it.effect("starts idle with the initial notice and submits drafts", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(CreateFoodMachine, {
        input: {
          dateKey: undefined,
          initialNotice: "The target date was not valid.",
          mode: "screen",
          returnToFoods: false,
        },
        events: [
          FoodFormMachine.FoodFormParentEvents.FoodFormSubmitted({
            input: _draft,
          }),
          FoodFormMachine.FoodFormParentEvents.FoodFormSubmitted({
            input: _draft,
          }),
        ],
      });
      const coverage = MachineTest.coverage(CreateFoodMachine, trace);

      yield* MachineTest.verify(CreateFoodMachine, trace);

      expect(
        Option.map(
          CreateFoodStates.get(trace.initial.startingState, "Form.Idle"),
          ({ notice }) => notice
        )
      ).toEqual(Option.some("The target date was not valid."));
      expect(trace.finalConfiguration).toContain("Form.Submitting");
      expect(
        coverage.transitions.definitions.misses.map(({ source, trigger }) => ({
          source,
          trigger,
        }))
      ).toEqual([
        {
          source: "Form.Submitting",
          trigger: { type: "invoke", id: "submitFood", outcome: "done" },
        },
        {
          source: "Form.Submitting",
          trigger: { type: "invoke", id: "submitFood", outcome: "failure" },
        },
        {
          source: "Form.Failure",
          trigger: { type: "event", event: "FoodFormSubmitted" },
        },
        {
          source: "Form.Failure",
          trigger: { type: "invoke", id: "alertFailure", outcome: "done" },
        },
        {
          source: "Form.Created",
          trigger: {
            type: "invoke",
            id: "navigateAfterCreate",
            outcome: "done",
          },
        },
      ]);
    })
  );

  it.live("returns to the food list after creating from it", () =>
    Effect.gen(function* () {
      const calls: _NavigationCall[] = [];
      const alerts: string[] = [];
      const ref = yield* Machine.start(CreateFoodMachine, {
        dateKey: Domain.DateKey.make("2026-11-01"),
        initialNotice: null,
        mode: "screen",
        returnToFoods: true,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            _createdLayer,
            _navigationLayer({ calls, canGoBack: false }),
            _dialogsLayer({ alerts })
          )
        )
      );

      yield* _submitFromForm(
        yield* Effect.flatMap(
          ref.child(FoodFormMachine.FoodFormChild),

          Effect.fromOption
        )
      );
      yield* Machine.waitFor(
        ref,
        ({ state }) =>
          calls.length === 1 && CreateFoodStates.matches(state, "Form.Created")
      );

      expect(calls).toEqual([
        { replace: { pathname: "/foods", params: { dateKey: "2026-11-01" } } },
      ]);
      expect(alerts).toEqual([]);
    }).pipe(Effect.scoped)
  );

  it.live("goes back or to the target day after creating", () =>
    Effect.gen(function* () {
      const calls: _NavigationCall[] = [];
      const alerts: string[] = [];
      const layer = Layer.mergeAll(
        _createdLayer,
        _navigationLayer({ calls, canGoBack: true }),
        _dialogsLayer({ alerts })
      );
      const back = yield* Machine.start(CreateFoodMachine, {
        dateKey: undefined,
        initialNotice: null,
        mode: "screen",
        returnToFoods: true,
      }).pipe(Effect.provide(layer));

      yield* _submitFromForm(
        yield* Effect.flatMap(
          back.child(FoodFormMachine.FoodFormChild),

          Effect.fromOption
        )
      );
      yield* Machine.waitFor(back, () => calls.length === 1);

      const today = yield* Machine.start(CreateFoodMachine, {
        dateKey: Domain.DateKey.make(todayDateKey()),
        initialNotice: null,
        mode: "screen",
        returnToFoods: false,
      }).pipe(Effect.provide(layer));

      yield* _submitFromForm(
        yield* Effect.flatMap(
          today.child(FoodFormMachine.FoodFormChild),

          Effect.fromOption
        )
      );
      yield* Machine.waitFor(today, () => calls.length === 2);

      const pastDay = yield* Machine.start(CreateFoodMachine, {
        dateKey: Domain.DateKey.make("2020-01-02"),
        initialNotice: null,
        mode: "screen",
        returnToFoods: false,
      }).pipe(Effect.provide(layer));

      yield* _submitFromForm(
        yield* Effect.flatMap(
          pastDay.child(FoodFormMachine.FoodFormChild),

          Effect.fromOption
        )
      );
      yield* Machine.waitFor(pastDay, () => calls.length === 3);

      expect(calls).toEqual([
        "back",
        { replace: "/" },
        {
          replace: {
            pathname: "/days/[dateKey]",
            params: { dateKey: "2020-01-02" },
          },
        },
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("resets the embedded form after creating a food", () =>
    Effect.gen(function* () {
      const ref = yield* Machine.start(CreateFoodMachine, {
        dateKey: undefined,
        initialNotice: null,
        mode: "embedded",
        returnToFoods: false,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            _createdLayer,
            _navigationLayer({ calls: [], canGoBack: false }),
            _dialogsLayer({ alerts: [] })
          )
        )
      );
      const foodForm = yield* Effect.flatMap(
        ref.child(FoodFormMachine.FoodFormChild),
        Effect.fromOption
      );

      yield* _submitFromForm(foodForm);
      const idle = yield* Machine.waitFor(ref, ({ state }) =>
        Option.exists(
          CreateFoodStates.get(state, "Form.Idle"),
          ({ notice }) => notice === "Food created."
        )
      );
      const form = yield* Machine.waitFor(
        foodForm,
        ({ state }) => state.value.quickInput === ""
      );

      expect(CreateFoodStates.matches(idle.state, "Form.Idle")).toBe(true);
      expect(form.state.value.formValues.name).toBe("");
    }).pipe(Effect.scoped)
  );

  it.live("alerts on validation and storage failures and allows retrying", () =>
    Effect.gen(function* () {
      const alerts: string[] = [];
      const attempts: number[] = [];
      const ref = yield* Machine.start(CreateFoodMachine, {
        dateKey: undefined,
        initialNotice: null,
        mode: "embedded",
        returnToFoods: false,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(Foods.Foods, {
              create: () => {
                attempts.push(attempts.length);

                return attempts.length === 1
                  ? Effect.fail(
                      new Store.NutritionStoreError({ cause: "unavailable" })
                    )
                  : Effect.flatMap(
                      Schema.decodeUnknownEffect(Schema.Number)("invalid"),
                      () => Effect.die("unreachable")
                    );
              },
            }),
            _navigationLayer({ calls: [], canGoBack: false }),
            _dialogsLayer({ alerts })
          )
        )
      );
      const foodForm = yield* Effect.flatMap(
        ref.child(FoodFormMachine.FoodFormChild),
        Effect.fromOption
      );

      yield* _submitFromForm(foodForm);
      const storageFailure = yield* Machine.waitFor(
        ref,
        ({ state }) =>
          alerts.length === 1 && CreateFoodStates.matches(state, "Form.Failure")
      );

      expect(
        Option.map(
          CreateFoodStates.get(storageFailure.state, "Form.Failure"),
          ({ notice }) => notice
        )
      ).toEqual(
        Option.some(
          "Something went wrong while saving the food. Please try again."
        )
      );

      yield* foodForm.send(FoodFormMachine.FoodFormEvents.Submit());
      yield* Machine.waitFor(ref, () => alerts.length === 2);

      expect(alerts).toEqual([
        "Food not saved: Something went wrong while saving the food. Please try again.",
        "Food not saved: Check the name, required nutrients, price, and any custom portions.",
      ]);
    }).pipe(Effect.scoped)
  );
});
