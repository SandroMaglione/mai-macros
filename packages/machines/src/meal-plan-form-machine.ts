import { Domain, MealPlans, Utils } from "@mai/nutrition";
import { Schema } from "effect";
import { Actor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import { EmptyEvent } from "./schemas";

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

const MealPlanFormValuesSchema = Schema.Struct({
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

export const mealPlanMealsMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        meals: Schema.Array(MealPlanFormMealValueSchema),
      })
    ),
    events: {
      addMeal: Schema.toStandardSchemaV1(EmptyEvent),
      changeMealName: Schema.toStandardSchemaV1(
        Schema.Struct({
          index: Schema.Number,
          value: Schema.String,
        })
      ),
      removeMeal: Schema.toStandardSchemaV1(
        Schema.Struct({
          index: Schema.Number,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(
      Schema.Struct({
        initialPlan: Schema.NullOr(Domain.Plan),
      })
    ),
  },
  states: {
    Ready: {},
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
  initial: "Ready",
  states: {
    Ready: {
      on: {
        addMeal: ({ context }) => ({
          context: {
            meals: [...context.meals, { name: "" }],
          },
        }),
        changeMealName: ({ context, event }) => ({
          context: {
            meals: context.meals.map((meal, index) =>
              index === event.index
                ? {
                    ...meal,
                    name: event.value,
                  }
                : meal
            ),
          },
        }),
        removeMeal: ({ context, event }) => ({
          context: {
            meals: context.meals.flatMap((meal, index) =>
              index === event.index ? [] : [meal]
            ),
          },
        }),
      },
    },
  },
});

type MealPlanMealsActor = ActorRefFrom<typeof mealPlanMealsMachine>;

const MealPlanMealsActorSchema = Schema.declare<MealPlanMealsActor>(
  (value): value is MealPlanMealsActor =>
    value instanceof Actor && value.logic === mealPlanMealsMachine,
  { expected: "MealPlanMealsActor" }
);

export const mealPlanFormMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        mealsActor: MealPlanMealsActorSchema,
        values: MealPlanFormValuesSchema,
      })
    ),
    events: {
      changeField: Schema.toStandardSchemaV1(
        Schema.Struct({
          name: MealPlanFormTextFieldNameSchema,
          value: Schema.String,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(
      Schema.Struct({
        initialPlan: Schema.NullOr(Domain.Plan),
      })
    ),
  },
  states: {
    Ready: {},
  },
  actorSources: {
    mealPlanMeals: mealPlanMealsMachine,
  },
}).createMachine({
  context: ({ actorSources, input, spawn }) => ({
    mealsActor: spawn(actorSources.mealPlanMeals, {
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
  initial: "Ready",
  states: {
    Ready: {
      on: {
        changeField: ({ context, event }) => ({
          context: {
            values: {
              ...context.values,
              [event.name]: event.value,
            },
          },
        }),
      },
    },
  },
});

export type MealPlanMealsActorRef = MealPlanMealsActor;
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
