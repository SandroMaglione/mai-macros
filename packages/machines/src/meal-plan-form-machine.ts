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

const MealPlanFormInputSchema = Schema.Struct({
  initialPlan: Schema.NullOr(Domain.Plan),
});

export class MealPlanMealsEditing extends Schema.TaggedClass<MealPlanMealsEditing>(
  "MealPlanMealsEditing"
)("MealPlanMealsEditing", {
  meals: Schema.Array(MealPlanFormMealValueSchema),
}) {}

export class AddMeal extends Schema.TaggedClass<AddMeal>("AddMeal")(
  "AddMeal",
  {}
) {}

export class ChangeMealName extends Schema.TaggedClass<ChangeMealName>(
  "ChangeMealName"
)("ChangeMealName", {
  index: Schema.Number,
  value: Schema.String,
}) {}

export class RemoveMeal extends Schema.TaggedClass<RemoveMeal>("RemoveMeal")(
  "RemoveMeal",
  { index: Schema.Number }
) {}

export const MealPlanMealsStates = Machine.defineStates({
  Editing: MealPlanMealsEditing,
});

export const mealPlanMealsMachine = Machine.make({
  id: "mealPlanMeals",
  states: MealPlanMealsStates.states,
  events: [AddMeal, ChangeMealName, RemoveMeal],
  input: MealPlanFormInputSchema,
  initial: ({ initialPlan }) =>
    MealPlanMealsStates.initial.Editing(
      new MealPlanMealsEditing({
        meals:
          initialPlan === null
            ? []
            : [...initialPlan.meals]
                .sort((left, right) => left.position - right.position)
                .map((meal) => ({
                  id: meal.id,
                  name: meal.name,
                })),
      })
    ),
}).handle({
  Editing: {
    on: {
      AddMeal: ({ state, target }) =>
        target.full.Editing(
          new MealPlanMealsEditing({
            meals: [...state.meals, { name: "" }],
          })
        ),
      ChangeMealName: ({ event, state, target }) =>
        target.full.Editing(
          new MealPlanMealsEditing({
            meals: state.meals.map((meal, index) =>
              index === event.index
                ? {
                    ...meal,
                    name: event.value,
                  }
                : meal
            ),
          })
        ),
      RemoveMeal: ({ event, state, target }) =>
        target.full.Editing(
          new MealPlanMealsEditing({
            meals: state.meals.flatMap((meal, index) =>
              index === event.index ? [] : [meal]
            ),
          })
        ),
    },
  },
});

export const MealPlanMealsChild = Machine.child(
  "mealPlanFormMeals",
  mealPlanMealsMachine
);

export class MealPlanFormEditing extends Schema.TaggedClass<MealPlanFormEditing>(
  "MealPlanFormEditing"
)("MealPlanFormEditing", {
  initialPlan: Schema.NullOr(Domain.Plan),
  values: MealPlanFormValuesSchema,
}) {}

export class ChangeMealPlanField extends Schema.TaggedClass<ChangeMealPlanField>(
  "ChangeMealPlanField"
)("ChangeMealPlanField", {
  name: MealPlanFormTextFieldNameSchema,
  value: Schema.String,
}) {}

export const MealPlanFormStates = Machine.defineStates({
  Editing: MealPlanFormEditing,
});

export const mealPlanFormMachine = Machine.make({
  id: "mealPlanForm",
  states: MealPlanFormStates.states,
  events: [ChangeMealPlanField],
  input: MealPlanFormInputSchema,
  initial: ({ initialPlan }) =>
    MealPlanFormStates.initial.Editing(
      new MealPlanFormEditing({
        initialPlan,
        values: {
          name: initialPlan?.name ?? "",
          proteinTargetGrams: _stringFromOptionalNumber(
            initialPlan?.proteinTargetGrams
          ),
          carbsTargetGrams: _stringFromOptionalNumber(
            initialPlan?.carbsTargetGrams
          ),
          fatTargetGrams: _stringFromOptionalNumber(
            initialPlan?.fatTargetGrams
          ),
          fiberTargetGrams: _stringFromOptionalNumber(
            initialPlan?.fiberTargetGrams
          ),
          sugarTargetGrams: _stringFromOptionalNumber(
            initialPlan?.sugarTargetGrams
          ),
          saturatedFatTargetGrams: _stringFromOptionalNumber(
            initialPlan?.saturatedFatTargetGrams
          ),
          saltTargetGrams: _stringFromOptionalNumber(
            initialPlan?.saltTargetGrams
          ),
        },
      })
    ),
}).handle({
  Editing: {
    invoke: ({ state }) =>
      Machine.invokeMachine({
        child: MealPlanMealsChild,
        input: { initialPlan: state.initialPlan },
      }),
    on: {
      ChangeMealPlanField: {
        reenter: false,
        transition: ({ event, state, target }) =>
          target.full.Editing(
            new MealPlanFormEditing({
              ...state,
              values: {
                ...state.values,
                [event.name]: event.value,
              },
            })
          ),
      },
    },
  },
});

export const MealPlanFormChild = Machine.child(
  "mealPlanForm",
  mealPlanFormMachine
);
export type MealPlanMealsActorRef = Machine.ChildMachine.Ref<
  typeof MealPlanMealsChild
>;
export type MealPlanMealsSnapshot = Machine.Machine.Snapshot<
  typeof MealPlanMealsStates.states
>;
export type MealPlanFormActorRef = Machine.ChildMachine.Ref<
  typeof MealPlanFormChild
>;
export type MealPlanFormSnapshot = Machine.Machine.Snapshot<
  typeof MealPlanFormStates.states
>;

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
