import {
  parseFoodQuickInput,
  type Food,
  type FoodQuickInputParseResult,
} from "@mai/nutrition";
import type { CreateFoodInput } from "@mai/nutrition/services/foods";
import { Effect } from "effect";
import {
  assign,
  sendParent,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";

export type FoodNutrientFieldName =
  | "energyKcalPer100g"
  | "proteinGramsPer100g"
  | "carbsGramsPer100g"
  | "fatGramsPer100g"
  | "fiberGramsPer100g"
  | "sugarGramsPer100g"
  | "saturatedFatGramsPer100g"
  | "saltGramsPer100g";

export type FoodFormValues = Record<
  "brand" | "name" | FoodNutrientFieldName,
  string
>;

export type FoodNumberWarning = {
  readonly field?: FoodNutrientFieldName;
  readonly message: string;
};

type FoodFormMachineContext = {
  readonly formValues: FoodFormValues;
  readonly numberWarnings: readonly FoodNumberWarning[];
  readonly quickInput: string;
  readonly quickInputParseResult: FoodQuickInputParseResult;
  readonly syncQuickInputFromFields: boolean;
};

type FoodFormMachineEvent =
  | {
      readonly input: string;
      readonly type: "changeQuickInput";
    }
  | {
      readonly name: keyof FoodFormValues;
      readonly type: "changeFormValue";
      readonly value: string;
    }
  | {
      readonly type: "reset";
    }
  | {
      readonly type: "submit";
    };

export type FoodFormSubmitEvent = {
  readonly input: CreateFoodInput;
  readonly type: "submit";
};

export const foodFormMachine = setup({
  types: {
    context: {} as FoodFormMachineContext,
    events: {} as FoodFormMachineEvent,
    input: {} as {
      readonly initialFood: Food | null;
      readonly syncQuickInputFromFields: boolean;
    },
  },
}).createMachine({
  context: ({ input }) => _foodFormContextFromInput(input),
  on: {
    reset: {
      actions: assign(({ context }) =>
        _foodFormContextFromInput({
          initialFood: null,
          syncQuickInputFromFields: context.syncQuickInputFromFields,
        })
      ),
    },
    submit: {
      actions: sendParent(({ context }) => {
        return {
          type: "submit",
          input: createFoodInputFromFormValues({
            formValues: context.formValues,
          }),
        } satisfies FoodFormSubmitEvent;
      }),
    },
    changeFormValue: {
      actions: assign(({ context, event }) => {
        const formValues = {
          ...context.formValues,
          [event.name]: event.value,
        };
        const name = formValues.name.trim();
        const brand = formValues.brand.trim();
        const nutrients = [
          _quickNutrientTag({
            tag: "k",
            value: formValues.energyKcalPer100g,
          }),
          _quickNutrientTag({
            tag: "f",
            value: formValues.fatGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "sf",
            value: formValues.saturatedFatGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "c",
            value: formValues.carbsGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "su",
            value: formValues.sugarGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "fi",
            value: formValues.fiberGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "p",
            value: formValues.proteinGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "sa",
            value: formValues.saltGramsPer100g,
          }),
        ].filter((value): value is string => value !== undefined);
        const quickInput = context.syncQuickInputFromFields
          ? [name, brand, nutrients.join(" ")]
              .join(", ")
              .replace(/(?:, )+$/g, "")
          : context.quickInput;

        return {
          formValues,
          numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
          quickInput,
          quickInputParseResult: context.syncQuickInputFromFields
            ? Effect.runSync(parseFoodQuickInput({ input: quickInput }))
            : context.quickInputParseResult,
        };
      }),
    },
    changeQuickInput: {
      actions: assign(({ event }) => {
        const quickInputParseResult = Effect.runSync(
          parseFoodQuickInput({ input: event.input })
        );
        const { partial } = quickInputParseResult;
        const formValues = {
          name: partial.name ?? "",
          brand: partial.brand ?? "",
          energyKcalPer100g:
            partial.energyKcalPer100g === undefined
              ? ""
              : `${partial.energyKcalPer100g}`,
          proteinGramsPer100g:
            partial.proteinGramsPer100g === undefined
              ? ""
              : `${partial.proteinGramsPer100g}`,
          carbsGramsPer100g:
            partial.carbsGramsPer100g === undefined
              ? ""
              : `${partial.carbsGramsPer100g}`,
          fatGramsPer100g:
            partial.fatGramsPer100g === undefined
              ? ""
              : `${partial.fatGramsPer100g}`,
          fiberGramsPer100g:
            partial.fiberGramsPer100g === undefined
              ? ""
              : `${partial.fiberGramsPer100g}`,
          sugarGramsPer100g:
            partial.sugarGramsPer100g === undefined
              ? ""
              : `${partial.sugarGramsPer100g}`,
          saturatedFatGramsPer100g:
            partial.saturatedFatGramsPer100g === undefined
              ? ""
              : `${partial.saturatedFatGramsPer100g}`,
          saltGramsPer100g:
            partial.saltGramsPer100g === undefined
              ? ""
              : `${partial.saltGramsPer100g}`,
        } satisfies FoodFormValues;

        return {
          formValues,
          numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
          quickInput: event.input,
          quickInputParseResult,
        };
      }),
    },
  },
});

export type FoodFormActorRef = ActorRefFrom<typeof foodFormMachine>;
export type FoodFormSnapshot = SnapshotFrom<typeof foodFormMachine>;

function _foodFormContextFromInput({
  initialFood,
  syncQuickInputFromFields,
}: {
  readonly initialFood: Food | null;
  readonly syncQuickInputFromFields: boolean;
}): FoodFormMachineContext {
  const food = initialFood;
  const formValues = {
    name: food?.name ?? "",
    brand: food?.brand ?? "",
    energyKcalPer100g: food === null ? "" : `${food.energyKcalPer100g}`,
    proteinGramsPer100g: food === null ? "" : `${food.proteinGramsPer100g}`,
    carbsGramsPer100g: food === null ? "" : `${food.carbsGramsPer100g}`,
    fatGramsPer100g: food === null ? "" : `${food.fatGramsPer100g}`,
    fiberGramsPer100g:
      food?.fiberGramsPer100g === undefined ? "" : `${food.fiberGramsPer100g}`,
    sugarGramsPer100g:
      food?.sugarGramsPer100g === undefined ? "" : `${food.sugarGramsPer100g}`,
    saturatedFatGramsPer100g:
      food?.saturatedFatGramsPer100g === undefined
        ? ""
        : `${food.saturatedFatGramsPer100g}`,
    saltGramsPer100g:
      food?.saltGramsPer100g === undefined ? "" : `${food.saltGramsPer100g}`,
  } satisfies FoodFormValues;
  const quickInput = "";

  return {
    formValues,
    numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
    quickInput,
    quickInputParseResult: Effect.runSync(
      parseFoodQuickInput({ input: quickInput })
    ),
    syncQuickInputFromFields,
  };
}

export function foodNumberWarningsFromFormValues({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}) {
  const warnings: FoodNumberWarning[] = [];
  const energyKcal = _formNumber(formValues.energyKcalPer100g);
  const proteinGrams = _formNumber(formValues.proteinGramsPer100g);
  const carbsGrams = _formNumber(formValues.carbsGramsPer100g);
  const fatGrams = _formNumber(formValues.fatGramsPer100g);
  const sugarGrams = _formNumber(formValues.sugarGramsPer100g);
  const saturatedFatGrams = _formNumber(formValues.saturatedFatGramsPer100g);
  const saltGrams = _formNumber(formValues.saltGramsPer100g);
  const macroTotalGrams =
    (proteinGrams ?? 0) + (carbsGrams ?? 0) + (fatGrams ?? 0);
  const macroEnergyKcal =
    (proteinGrams ?? 0) * 4 + (carbsGrams ?? 0) * 4 + (fatGrams ?? 0) * 9;

  if (macroTotalGrams > 100) {
    warnings.push({
      message: "Protein, carbs, and fat add up to more than 100g per 100g.",
    });
  }

  if (energyKcal !== undefined && energyKcal > 900) {
    warnings.push({
      field: "energyKcalPer100g",
      message: "Calories are above 900 kcal per 100g.",
    });
  }

  if (energyKcal !== undefined && macroEnergyKcal > 0) {
    const difference = Math.abs(energyKcal - macroEnergyKcal);
    const threshold = Math.max(50, energyKcal * 0.35);

    if (difference > threshold) {
      warnings.push({
        message:
          "Calories do not closely match the energy from protein, carbs, and fat.",
      });
    }
  }

  if (
    sugarGrams !== undefined &&
    carbsGrams !== undefined &&
    sugarGrams > carbsGrams
  ) {
    warnings.push({
      field: "sugarGramsPer100g",
      message: "Sugar is greater than total carbs.",
    });
  }

  if (
    saturatedFatGrams !== undefined &&
    fatGrams !== undefined &&
    saturatedFatGrams > fatGrams
  ) {
    warnings.push({
      field: "saturatedFatGramsPer100g",
      message: "Saturated fat is greater than total fat.",
    });
  }

  if (saltGrams !== undefined && saltGrams > 20) {
    warnings.push({
      field: "saltGramsPer100g",
      message: "Salt is above 20g per 100g.",
    });
  }

  return warnings;
}

export function createFoodInputFromFormValues({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}): CreateFoodInput {
  const brand = formValues.brand.trim();
  const fiberGramsPer100g = _optionalFormValue(formValues.fiberGramsPer100g);
  const sugarGramsPer100g = _optionalFormValue(formValues.sugarGramsPer100g);
  const saturatedFatGramsPer100g = _optionalFormValue(
    formValues.saturatedFatGramsPer100g
  );
  const saltGramsPer100g = _optionalFormValue(formValues.saltGramsPer100g);

  return {
    name: formValues.name.trim(),
    ...(brand === "" ? {} : { brand }),
    energyKcalPer100g: formValues.energyKcalPer100g,
    proteinGramsPer100g: formValues.proteinGramsPer100g,
    carbsGramsPer100g: formValues.carbsGramsPer100g,
    fatGramsPer100g: formValues.fatGramsPer100g,
    ...(fiberGramsPer100g === undefined ? {} : { fiberGramsPer100g }),
    ...(sugarGramsPer100g === undefined ? {} : { sugarGramsPer100g }),
    ...(saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGramsPer100g }),
    ...(saltGramsPer100g === undefined ? {} : { saltGramsPer100g }),
  };
}

function _quickNutrientTag({
  tag,
  value,
}: {
  readonly tag: string;
  readonly value: string;
}) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : `${tag}${trimmedValue}`;
}

function _optionalFormValue(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function _formNumber(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
