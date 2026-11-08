import { Domain, MealPlans, Utils } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export type MealPlanTargetFieldName =
  | "proteinTargetGrams"
  | "carbsTargetGrams"
  | "fatTargetGrams"
  | "fiberTargetGrams"
  | "sugarTargetGrams"
  | "saturatedFatTargetGrams"
  | "saltTargetGrams";

export type MealPlanFormValues = {
  readonly name: string;
  readonly targetRules: Domain.PlanTargetRules;
} & Record<MealPlanTargetFieldName, string>;

export type MealPlanFormMealValue = {
  readonly id?: Domain.MealId;
  readonly name: string;
};

export type MealPlanFormTextFieldName = "name" | MealPlanTargetFieldName;

const MealPlanFormValuesSchema = Schema.Struct({
  targetRules: Domain.PlanTargetRules,
  name: Schema.String,
  proteinTargetGrams: Schema.String,
  carbsTargetGrams: Schema.String,
  fatTargetGrams: Schema.String,
  fiberTargetGrams: Schema.String,
  sugarTargetGrams: Schema.String,
  saturatedFatTargetGrams: Schema.String,
  saltTargetGrams: Schema.String,
});

const MealPlanFormMealValueSchema = Schema.Struct({
  id: Schema.optionalKey(Domain.MealId),
  name: Schema.String,
});

const MealPlanFormTextFieldNameSchema = Schema.Literals([
  "name",
  "proteinTargetGrams",
  "carbsTargetGrams",
  "fatTargetGrams",
  "fiberTargetGrams",
  "sugarTargetGrams",
  "saturatedFatTargetGrams",
  "saltTargetGrams",
]);

export const MealPlanFormSubmission = Schema.Struct({
  targetRules: Schema.optional(Domain.PlanTargetRules),
  name: Schema.String,
  meals: Schema.Array(
    Schema.Struct({
      id: Schema.optional(Schema.String),
      name: Schema.String,
    })
  ),
  proteinTargetGrams: Schema.String,
  carbsTargetGrams: Schema.String,
  fatTargetGrams: Schema.String,
  fiberTargetGrams: Schema.optional(Schema.String),
  sugarTargetGrams: Schema.optional(Schema.String),
  saltTargetGrams: Schema.optional(Schema.String),
  saturatedFatTargetGrams: Schema.optional(Schema.String),
});

export type MealPlanFormSubmission = typeof MealPlanFormSubmission.Type;

const MealPlanFormInput = Schema.Struct({
  initialPlan: Schema.NullOr(Domain.Plan),
});

export const MealPlanMealsStates = Machine.state({
  fields: { meals: Schema.Array(MealPlanFormMealValueSchema) },
});

export const MealPlanMealsEvents = Machine.events({
  AddMeal: {},
  ChangeMealName: { index: Schema.Number, value: Schema.String },
  RemoveMeal: { index: Schema.Number },
});

export const MealPlanMealsMachine = Machine.make({
  id: "MealPlanMeals",
  root: MealPlanMealsStates,
  events: MealPlanMealsEvents,
  input: MealPlanFormInput,
}).handle({
  root: ({ input }) => ({
    meals:
      input.initialPlan === null
        ? []
        : [...input.initialPlan.meals]
            .sort((left, right) => left.position - right.position)
            .map((meal) => ({
              id: meal.id,
              name: meal.name,
            })),
  }),
  on: {
    AddMeal: {
      update: "root",
      data: ({ root }) => ({ meals: [...root.meals, { name: "" }] }),
    },
    ChangeMealName: {
      update: "root",
      data: ({ root, event }) => ({
        meals: root.meals.map((meal, index) =>
          index === event.index ? { ...meal, name: event.value } : meal
        ),
      }),
    },
    RemoveMeal: {
      update: "root",
      data: ({ root, event }) => ({
        meals: root.meals.flatMap((meal, index) =>
          index === event.index ? [] : [meal]
        ),
      }),
    },
  },
});

export const MealPlanMealsChild = Machine.child(
  "mealPlanFormMeals",
  MealPlanMealsMachine
);

export const MealPlanFormStates = Machine.state({
  fields: { values: MealPlanFormValuesSchema },
  states: {
    Ready: { fields: { initialPlan: Schema.NullOr(Domain.Plan) } },
  },
});

export const MealPlanFormEvents = Machine.events({
  ChangeTargetRule: {
    nutrient: Schema.Literals([
      "energyKcal",
      "proteinGrams",
      "carbsGrams",
      "fatGrams",
      "fiberGrams",
      "sugarGrams",
      "saturatedFatGrams",
      "saltGrams",
    ]),
    rule: Domain.NutrientTargetSemantics,
  },
  ChangeField: {
    name: MealPlanFormTextFieldNameSchema,
    value: Schema.String,
  },
});

export const MealPlanFormMachine = Machine.make({
  id: "MealPlanForm",
  root: MealPlanFormStates,
  events: MealPlanFormEvents,
  input: MealPlanFormInput,
  children: { mealPlanFormMeals: MealPlanMealsChild },
}).handle({
  root: ({ input }) => ({
    values: {
      targetRules:
        input.initialPlan?.targetRules ?? Domain.DefaultPlanTargetRules,
      name: input.initialPlan?.name ?? "",
      proteinTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.proteinTargetGrams
      ),
      carbsTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.carbsTargetGrams
      ),
      fatTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.fatTargetGrams
      ),
      fiberTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.fiberTargetGrams
      ),
      sugarTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.sugarTargetGrams
      ),
      saturatedFatTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.saturatedFatTargetGrams
      ),
      saltTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.saltTargetGrams
      ),
    },
  }),
  initial: {
    target: "Ready",
    data: ({ input }) => ({ initialPlan: input.initialPlan }),
  },
  on: {
    ChangeTargetRule: {
      update: "root",
      data: ({ root, event }) => ({
        values: {
          ...root.values,
          targetRules: {
            ...root.values.targetRules,
            [event.nutrient]: event.rule,
          },
        },
      }),
    },
    ChangeField: {
      update: "root",
      data: ({ root, event }) => ({
        values: { ...root.values, [event.name]: event.value },
      }),
    },
  },
  states: {
    Ready: {
      invoke: {
        src: "mealPlanFormMeals",
        input: ({ state }) => ({ initialPlan: state.initialPlan }),
      },
    },
  },
});

export function createMealPlanInputFromValues({
  meals,
  values,
}: {
  readonly meals: readonly MealPlanFormMealValue[];
  readonly values: MealPlanFormValues;
}): MealPlans.CreateMealPlanInput {
  const fiberTargetGrams = _optionalFormString(values.fiberTargetGrams);
  const sugarTargetGrams = _optionalFormString(values.sugarTargetGrams);
  const saturatedFatTargetGrams = _optionalFormString(
    values.saturatedFatTargetGrams
  );
  const saltTargetGrams = _optionalFormString(values.saltTargetGrams);

  return {
    name: values.name.trim(),
    targetRules: values.targetRules,
    meals: meals.map((meal) => ({
      ...(meal.id === undefined ? {} : { id: meal.id }),
      name: meal.name.trim(),
    })),
    proteinTargetGrams: values.proteinTargetGrams,
    carbsTargetGrams: values.carbsTargetGrams,
    fatTargetGrams: values.fatTargetGrams,
    ...(fiberTargetGrams === undefined ? {} : { fiberTargetGrams }),
    ...(sugarTargetGrams === undefined ? {} : { sugarTargetGrams }),
    ...(saturatedFatTargetGrams === undefined
      ? {}
      : { saturatedFatTargetGrams }),
    ...(saltTargetGrams === undefined ? {} : { saltTargetGrams }),
  };
}

export function calculateMealPlanEnergyKcalFromValues({
  values,
}: {
  readonly values: MealPlanFormValues;
}) {
  return Utils.calculateMacronutrientEnergyKcal({
    carbsGrams: _formNonNegativeNumber(values.carbsTargetGrams),
    fatGrams: _formNonNegativeNumber(values.fatTargetGrams),
    proteinGrams: _formNonNegativeNumber(values.proteinTargetGrams),
  });
}

function _stringFromOptionalNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function _optionalFormString(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function _formNonNegativeNumber(value: string) {
  const parsedValue = Number(value.replace(",", "."));

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
}
