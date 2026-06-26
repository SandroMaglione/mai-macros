import { MealPlans, Utils, type Domain } from "@mai/nutrition";
import { assign, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";

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
} & Record<MealPlanTargetFieldName, string>;

export type MealPlanFormMealValue = {
  readonly id?: Domain.MealId;
  readonly name: string;
};

export type MealPlanFormTextFieldName = keyof MealPlanFormValues;

export const mealPlanMealsMachine = setup({
  types: {
    context: {} as {
      readonly meals: readonly MealPlanFormMealValue[];
    },
    events: {} as
      | {
          readonly type: "addMeal";
        }
      | {
          readonly index: number;
          readonly type: "changeMealName";
          readonly value: string;
        }
      | {
          readonly index: number;
          readonly type: "removeMeal";
        },
    input: {} as {
      readonly initialPlan: Domain.Plan | null;
    },
  },
}).createMachine({
  context: ({ input }) => ({
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
    addMeal: {
      actions: assign(({ context }) => ({
        meals: [...context.meals, { name: "" }],
      })),
    },
    changeMealName: {
      actions: assign(({ context, event }) => ({
        meals: context.meals.map((meal, index) =>
          index === event.index
            ? {
                ...meal,
                name: event.value,
              }
            : meal
        ),
      })),
    },
    removeMeal: {
      actions: assign(({ context, event }) => ({
        meals: context.meals.flatMap((meal, index) =>
          index === event.index ? [] : [meal]
        ),
      })),
    },
  },
});

export const mealPlanFormMachine = setup({
  types: {
    context: {} as {
      readonly mealsActor: MealPlanMealsActorRef;
      readonly values: MealPlanFormValues;
    },
    events: {} as {
      readonly name: MealPlanFormTextFieldName;
      readonly type: "changeField";
      readonly value: string;
    },
    input: {} as {
      readonly initialPlan: Domain.Plan | null;
    },
  },
  actors: {
    mealPlanMeals: mealPlanMealsMachine,
  },
}).createMachine({
  context: ({ input, spawn }) => ({
    mealsActor: spawn("mealPlanMeals", {
      id: "mealPlanFormMeals",
      input: {
        initialPlan: input.initialPlan,
      },
    }),
    values: {
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
  on: {
    changeField: {
      actions: assign(({ context, event }) => ({
        values: {
          ...context.values,
          [event.name]: event.value,
        },
      })),
    },
  },
});

export type MealPlanMealsActorRef = ActorRefFrom<typeof mealPlanMealsMachine>;
export type MealPlanMealsSnapshot = SnapshotFrom<typeof mealPlanMealsMachine>;
export type MealPlanFormActorRef = ActorRefFrom<typeof mealPlanFormMachine>;
export type MealPlanFormSnapshot = SnapshotFrom<typeof mealPlanFormMachine>;

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
