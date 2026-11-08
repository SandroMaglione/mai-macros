import { assert, describe, it } from "@effect/vitest";
import { Domain } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Array, Effect, Option, Schema } from "effect";

import {
  createFoodInputFromFormValues,
  FoodFormChild,
  FoodFormEvents,
  FoodFormMachine,
  FoodFormParentEvents,
  FoodFormSubmitInput,
} from "../src/food-form-machine.ts";

const _yogurt = Schema.decodeEffect(Domain.Food)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Yogurt",
  brand: "Brand",
  origin: "user",
  nutritionReference: { amount: 200, unit: "ml" },
  energyKcal: 100,
  proteinGrams: 2,
  carbsGrams: 10,
  fatGrams: 1,
  createdAt: 0,
  updatedAt: 0,
  nutritionCorrections: {
    energyKcal: 120,
    proteinGrams: 20,
    fiberGrams: 0,
  },
  massVolumeConversion: {
    mass: { amount: 103, unit: "g" },
    volume: { amount: 100, unit: "ml" },
  },
  portions: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Cup",
      position: 0,
      size: { amount: 200, unit: "ml" },
    },
  ],
});

const FoodFormOwnerStates = Machine.state({
  states: {
    Editing: {
      fields: { submissions: Schema.Array(FoodFormSubmitInput) },
    },
  },
});

const FoodFormOwnerMachine = Machine.make({
  id: "FoodFormOwner",
  root: FoodFormOwnerStates,
  events: FoodFormParentEvents,
  children: { foodForm: FoodFormChild },
}).handle({
  initial: { target: "Editing", data: { submissions: [] } },
  states: {
    Editing: {
      invoke: {
        src: "foodForm",
        input: () => ({ initialFood: null, syncQuickInputFromFields: true }),
      },
      on: {
        FoodFormSubmitted: {
          update: "Editing",
          data: ({ state, event }) => ({
            submissions: [...state.submissions, event.input],
          }),
        },
      },
    },
  },
});

describe("FoodFormMachine quick input", () => {
  it.effect(
    "loads corrected food text and keeps text, fields and the update payload synchronized",
    () =>
      Effect.gen(function* () {
        const food = yield* _yogurt;
        const trace = yield* MachineTest.run(FoodFormMachine, {
          input: { initialFood: food, syncQuickInputFromFields: true },
          events: [
            FoodFormEvents.ChangeQuickInput({
              input: "Yogurt, Brand, k140 f2 c12 p22",
            }),
            FoodFormEvents.ChangeFormValue({
              name: "proteinGrams",
              value: "25",
            }),
            FoodFormEvents.LoadFood({ food }),
            FoodFormEvents.Reset(),
          ],
        });

        yield* MachineTest.verify(FoodFormMachine, trace);

        assert.equal(
          trace.initial.startingState.value.quickInput,
          "Yogurt, Brand, k120 f1 c10 fi0 p20"
        );

        const afterQuickInput = trace.steps[0]?.after.value;

        assert.equal(afterQuickInput?.formValues.energyKcal, "140");
        assert.equal(afterQuickInput?.formValues.fiberGrams, "");
        assert.equal(
          afterQuickInput?.formValues.nutritionReferenceAmount,
          "200"
        );
        assert.equal(afterQuickInput?.formValues.nutritionReferenceUnit, "ml");
        assert.equal(afterQuickInput?.formValues.conversionMassAmount, "103");
        assert.equal(afterQuickInput?.portions[0]?.id, food.portions[0]?.id);

        const afterFieldChange = trace.steps[1]?.after.value;

        assert.equal(
          afterFieldChange?.quickInput,
          "Yogurt, Brand, k140 f2 c12 p25"
        );

        const input =
          afterFieldChange === undefined
            ? undefined
            : createFoodInputFromFormValues(afterFieldChange);

        assert.equal(input?.proteinGrams, "25");
        assert.deepEqual(input?.nutritionReference, {
          amount: "200",
          unit: "ml",
        });
        assert.equal(input?.portions[0]?.id, food.portions[0]?.id);
        assert.equal(
          trace.steps[2]?.after.value.quickInput,
          "Yogurt, Brand, k120 f1 c10 fi0 p20"
        );
        assert.equal(trace.final.value.quickInput, "");
      })
  );

  it.effect("covers every public transition except a parentless submit", () =>
    Effect.gen(function* () {
      const food = yield* _yogurt;
      const trace = yield* MachineTest.run(FoodFormMachine, {
        input: { initialFood: null, syncQuickInputFromFields: false },
        events: [
          FoodFormEvents.LoadFood({ food }),
          FoodFormEvents.ChangeQuickInput({ input: "Milk, k60 f3 c5 p3" }),
          FoodFormEvents.ChangeFormValue({ name: "brand", value: "Farm" }),
          FoodFormEvents.AddPortion(),
          FoodFormEvents.ChangePortion({
            field: "name",
            index: 1,
            value: "Mug",
          }),
          FoodFormEvents.ChangePortion({
            field: "amount",
            index: 1,
            value: "250",
          }),
          FoodFormEvents.ChangePortion({
            field: "unit",
            index: 1,
            value: "ml",
          }),
          FoodFormEvents.ChangePortion({
            field: "unit",
            index: 1,
            value: "cup",
          }),
          FoodFormEvents.RemovePortion({ index: 0 }),
          FoodFormEvents.Submit(),
          FoodFormEvents.Reset(),
        ],
      });
      const coverage = MachineTest.coverage(FoodFormMachine, trace);

      yield* MachineTest.verify(FoodFormMachine, trace);

      assert.equal(
        trace.steps[2]?.after.value.quickInput,
        "Milk, k60 f3 c5 p3"
      );
      assert.deepEqual(trace.steps[8]?.after.value.portions, [
        { name: "Mug", amount: "250", unit: "ml" },
      ]);
      assert.strictEqual(coverage.transitions.definitions.missing, 1);
      assert.deepEqual(
        coverage.transitions.definitions.misses.map(({ trigger }) => trigger),
        [{ type: "event", event: "Submit" }]
      );
      assert.deepEqual(trace.final.value.portions, []);
    })
  );

  it.live("submits valid values to its owner and declines invalid ones", () =>
    Effect.gen(function* () {
      const owner = yield* Machine.start(FoodFormOwnerMachine);
      const foodForm = yield* Effect.flatMap(
        owner.child(FoodFormChild),
        Effect.fromOption
      );

      yield* foodForm.send(
        FoodFormEvents.ChangeQuickInput({ input: "Milk, Farm, k60 f3 c5 p3" })
      );
      yield* foodForm.send(FoodFormEvents.AddPortion());

      const invalid = yield* foodForm.state;

      assert.isFalse(
        yield* Machine.can(FoodFormMachine, invalid, FoodFormEvents.Submit())
      );

      yield* foodForm.send(FoodFormEvents.Submit());
      yield* foodForm.send(
        FoodFormEvents.ChangePortion({ field: "name", index: 0, value: "Cup" })
      );
      yield* foodForm.send(
        FoodFormEvents.ChangePortion({
          field: "amount",
          index: 0,
          value: "200",
        })
      );
      yield* foodForm.send(FoodFormEvents.Submit());

      const snapshot = yield* Machine.waitFor(owner, ({ state }) =>
        Option.exists(
          FoodFormOwnerStates.get(state, "Editing"),
          ({ submissions }) => Array.isReadonlyArrayNonEmpty(submissions)
        )
      );

      assert.deepEqual(
        Option.map(
          FoodFormOwnerStates.get(snapshot.state, "Editing"),
          ({ submissions }) => submissions
        ),
        Option.some<readonly FoodFormSubmitInput[]>([
          {
            name: "Milk",
            brand: "Farm",
            nutritionReference: { amount: "100", unit: "g" },
            energyKcal: "60",
            proteinGrams: "3",
            carbsGrams: "5",
            fatGrams: "3",
            portions: [{ name: "Cup", size: { amount: "200", unit: "g" } }],
          },
        ])
      );
    }).pipe(Effect.scoped)
  );
});
