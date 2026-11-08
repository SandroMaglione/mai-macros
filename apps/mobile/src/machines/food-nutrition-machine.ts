import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Option, Schema } from "effect";

export const nutrientFields = [
  { key: "energyKcal", label: "Calories", unit: "kcal" },
  { key: "carbsGrams", label: "Carbs", unit: "g" },
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "fatGrams", label: "Fat", unit: "g" },
  { key: "fiberGrams", label: "Fiber", unit: "g" },
  { key: "sugarGrams", label: "Sugar", unit: "g" },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g" },
  { key: "saltGrams", label: "Salt", unit: "g" },
] as const;

export const NutritionDraft = Schema.Struct({
  energyKcal: Schema.String,
  carbsGrams: Schema.String,
  proteinGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.String,
  sugarGrams: Schema.String,
  saturatedFatGrams: Schema.String,
  saltGrams: Schema.String,
});

export type NutritionDraft = typeof NutritionDraft.Type;

export function nutritionDraft(
  corrections: Domain.FoodNutritionCorrections
): NutritionDraft {
  return {
    energyKcal: corrections.energyKcal?.toString() ?? "",
    carbsGrams: corrections.carbsGrams?.toString() ?? "",
    proteinGrams: corrections.proteinGrams?.toString() ?? "",
    fatGrams: corrections.fatGrams?.toString() ?? "",
    fiberGrams: corrections.fiberGrams?.toString() ?? "",
    sugarGrams: corrections.sugarGrams?.toString() ?? "",
    saturatedFatGrams: corrections.saturatedFatGrams?.toString() ?? "",
    saltGrams: corrections.saltGrams?.toString() ?? "",
  };
}

export function nutritionCorrections(draft: NutritionDraft) {
  return Schema.decodeOption(Domain.FoodNutritionCorrections)(
    Object.fromEntries(
      nutrientFields.flatMap(({ key }) => {
        const value = draft[key].trim().replace(",", ".");
        return value === "" ? [] : [[key, Number(value)]];
      })
    )
  );
}

export const FoodNutritionData = Schema.Struct({
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
});

export type FoodNutritionData = typeof FoodNutritionData.Type;

export const FoodNutritionLoaderStates = Machine.state({
  fields: { foodId: Domain.FoodId },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: FoodNutritionData } },
  },
});

export const FoodNutritionLoaderEvents = Machine.events({ Retry: {} });

export const FoodNutritionLoaderMachine = Machine.make({
  id: "FoodNutritionLoader",
  root: FoodNutritionLoaderStates,
  events: FoodNutritionLoaderEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  effects: {
    load: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return {
          food: yield* foods.get({ input: { foodId } }),
          usage: yield* foods.inspectEdit({ input: { foodId } }),
        };
      }),
  },
}).handle({
  root: ({ input }) => ({ foodId: input.foodId }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.foodId,
        onDone: {
          target: "Ready",
          data: ({ output }) => ({ data: output }),
        },
        onFailure: {
          target: "Failed",
          data: { message: "Could not load this food." },
        },
      },
    },
    Failed: {
      on: { Retry: { target: "Loading" } },
    },
    Ready: {},
  },
});

export const FoodNutritionStates = Machine.state({
  fields: {
    food: Domain.Food,
    usage: Foods.FoodEditUsage,
    draft: NutritionDraft,
    message: Schema.NullOr(Schema.String),
  },
  states: {
    Editing: {},
    Saving: { fields: { corrections: Domain.FoodNutritionCorrections } },
  },
});

export const FoodNutritionEvents = Machine.events({
  Change: {
    field: Schema.Literals(nutrientFields.map(({ key }) => key)),
    value: Schema.String,
  },
  Save: {},
  Reset: {},
});

export const FoodNutritionMachine = Machine.make({
  id: "FoodNutrition",
  root: FoodNutritionStates,
  events: FoodNutritionEvents,
  input: FoodNutritionData,
  effects: {
    save: (input: {
      readonly foodId: Domain.FoodId;
      readonly corrections: Domain.FoodNutritionCorrections;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.setNutritionCorrections({ input });
      }),
  },
  branches: {
    save: { saving: { target: "Saving", update: "root" } },
  },
}).handle({
  root: ({ input }) => ({
    food: input.food,
    usage: input.usage,
    draft: nutritionDraft(input.food.nutritionCorrections),
    message: null,
  }),
  initial: { target: "Editing" },
  states: {
    Editing: {
      on: {
        Change: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            draft: { ...root.draft, [event.field]: event.value },
            message: null,
          }),
        },
        Save: {
          branches: "save",
          declinable: true,
          resolve: ({ root, select, decline }) =>
            Option.match(nutritionCorrections(root.draft), {
              onNone: () => decline(),
              onSome: (corrections) =>
                select.saving({
                  data: { corrections },
                  update: { data: { ...root, message: null } },
                }),
            }),
        },
        Reset: {
          target: "Saving",
          update: "root",
          data: ({ root }) => ({
            target: { corrections: {} },
            update: { ...root, draft: nutritionDraft({}), message: null },
          }),
        },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ root, state }) => ({
          foodId: root.food.id,
          corrections: state.corrections,
        }),
        onDone: {
          target: "Editing",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: {
              ...root,
              food: output,
              draft: nutritionDraft(output.nutritionCorrections),
              message: "Saved for all past and future entries.",
            },
          }),
        },
        onFailure: {
          target: "Editing",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: {
              ...root,
              message:
                "Could not save. Your catalog values are unchanged. Try again.",
            },
          }),
        },
      },
    },
  },
});
