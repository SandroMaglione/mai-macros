import { Domain, FoodQuickInput, type Foods } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import { EmptyEvent } from "./schemas";

export type FoodNutrientFieldName =
  | "energyKcal"
  | "proteinGrams"
  | "carbsGrams"
  | "fatGrams"
  | "fiberGrams"
  | "sugarGrams"
  | "saturatedFatGrams"
  | "saltGrams";

export type FoodFormValues = Record<
  | "brand"
  | "conversionMassAmount"
  | "conversionMassUnit"
  | "conversionVolumeAmount"
  | "conversionVolumeUnit"
  | "name"
  | "nutritionReferenceAmount"
  | "nutritionReferenceUnit"
  | FoodNutrientFieldName,
  string
>;

export type FoodPortionFormValue = {
  readonly id?: Domain.FoodPortionId | undefined;
  readonly name: string;
  readonly amount: string;
  readonly unit: Domain.MeasurementUnit;
};

export type FoodPortionFormError = {
  readonly amount?: string;
  readonly name?: string;
};

const measurementUnitByValue: Record<
  string,
  Domain.MeasurementUnit | undefined
> = {
  g: "g",
  kg: "kg",
  l: "l",
  lb: "lb",
  ml: "ml",
  oz: "oz",
};

const massUnitByValue: Record<string, Domain.MassUnit | undefined> = {
  g: "g",
  kg: "kg",
  lb: "lb",
  oz: "oz",
};

const volumeUnitByValue: Record<string, Domain.VolumeUnit | undefined> = {
  l: "l",
  ml: "ml",
};

export type FoodNumberWarning = {
  readonly field?: FoodNutrientFieldName;
  readonly message: string;
};

const FoodNutrientFieldNameSchema = Schema.Literals([
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
]);

const FoodFormValuesSchema = Schema.Struct({
  brand: Schema.String,
  name: Schema.String,
  energyKcal: Schema.String,
  proteinGrams: Schema.String,
  carbsGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.String,
  sugarGrams: Schema.String,
  saturatedFatGrams: Schema.String,
  saltGrams: Schema.String,
  nutritionReferenceAmount: Schema.String,
  nutritionReferenceUnit: Schema.String,
  conversionMassAmount: Schema.String,
  conversionMassUnit: Schema.String,
  conversionVolumeAmount: Schema.String,
  conversionVolumeUnit: Schema.String,
});

const FoodPortionFormValueSchema = Schema.Struct({
  id: Schema.optionalKey(Domain.FoodPortionId),
  name: Schema.String,
  amount: Schema.String,
  unit: Domain.MeasurementUnit,
});

const FoodFormValueNameSchema = Schema.Literals([
  "brand",
  "name",
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
  "nutritionReferenceAmount",
  "nutritionReferenceUnit",
  "conversionMassAmount",
  "conversionMassUnit",
  "conversionVolumeAmount",
  "conversionVolumeUnit",
]);

const FoodPortionFormFieldSchema = Schema.Literals(["amount", "name", "unit"]);

const FoodNumberWarningSchema = Schema.Struct({
  field: Schema.optionalKey(FoodNutrientFieldNameSchema),
  message: Schema.String,
});

const FoodFormMachineContextSchema = Schema.Struct({
  formValues: FoodFormValuesSchema,
  portions: Schema.Array(FoodPortionFormValueSchema),
  numberWarnings: Schema.Array(FoodNumberWarningSchema),
  quickInput: Schema.String,
  quickInputParseResult: Schema.Any,
  syncQuickInputFromFields: Schema.Boolean,
});

export type FoodFormSubmitEvent = {
  readonly input: Foods.CreateFoodInput;
  readonly type: "submit";
};

export const foodFormMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(FoodFormMachineContextSchema),
    events: {
      changeFormValue: Schema.toStandardSchemaV1(
        Schema.Struct({
          name: FoodFormValueNameSchema,
          value: Schema.String,
        })
      ),
      changeQuickInput: Schema.toStandardSchemaV1(
        Schema.Struct({
          input: Schema.String,
        })
      ),
      addPortion: Schema.toStandardSchemaV1(EmptyEvent),
      loadFood: Schema.toStandardSchemaV1(Schema.Struct({ food: Domain.Food })),
      changePortion: Schema.toStandardSchemaV1(
        Schema.Struct({
          field: FoodPortionFormFieldSchema,
          index: Schema.Int,
          value: Schema.String,
        })
      ),
      removePortion: Schema.toStandardSchemaV1(
        Schema.Struct({ index: Schema.Int })
      ),
      reset: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(
      Schema.Struct({
        initialFood: Schema.NullOr(Domain.Food),
        syncQuickInputFromFields: Schema.Boolean,
      })
    ),
  },
  states: {
    Ready: {},
  },
}).createMachine({
  context: ({ input }) => _foodFormContextFromInput(input),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        loadFood: ({ context, event }) => ({
          context: _foodFormContextFromInput({
            initialFood: event.food,
            syncQuickInputFromFields: context.syncQuickInputFromFields,
          }),
        }),
        reset: ({ context }) => ({
          context: _foodFormContextFromInput({
            initialFood: null,
            syncQuickInputFromFields: context.syncQuickInputFromFields,
          }),
        }),
        submit: ({ context, parent }, enq) => {
          if (
            parent === undefined ||
            !foodPortionFormValuesAreValid({ portions: context.portions })
          ) {
            return;
          }

          enq.sendTo(parent, {
            type: "submit",
            input: createFoodInputFromFormValues({
              formValues: context.formValues,
              portions: context.portions,
            }),
          } satisfies FoodFormSubmitEvent);
        },
        addPortion: ({ context }) => ({
          context: {
            portions: [
              ...context.portions,
              { name: "", amount: "", unit: "g" },
            ],
          },
        }),
        changePortion: ({ context, event }) => ({
          context: {
            portions: context.portions.map((portion, index) =>
              index === event.index
                ? {
                    ...portion,
                    [event.field]:
                      event.field === "unit"
                        ? (measurementUnitByValue[event.value] ?? portion.unit)
                        : event.value,
                  }
                : portion
            ),
          },
        }),
        removePortion: ({ context, event }) => ({
          context: {
            portions: context.portions.filter(
              (_portion, index) => index !== event.index
            ),
          },
        }),
        changeFormValue: ({ context, event }) => {
          const formValues = {
            ...context.formValues,
            [event.name]: event.value,
          };
          const name = formValues.name.trim();
          const brand = formValues.brand.trim();
          const nutrients = [
            _quickNutrientTag({
              tag: "k",
              value: formValues.energyKcal,
            }),
            _quickNutrientTag({
              tag: "f",
              value: formValues.fatGrams,
            }),
            _quickNutrientTag({
              tag: "sf",
              value: formValues.saturatedFatGrams,
            }),
            _quickNutrientTag({
              tag: "c",
              value: formValues.carbsGrams,
            }),
            _quickNutrientTag({
              tag: "su",
              value: formValues.sugarGrams,
            }),
            _quickNutrientTag({
              tag: "fi",
              value: formValues.fiberGrams,
            }),
            _quickNutrientTag({
              tag: "p",
              value: formValues.proteinGrams,
            }),
            _quickNutrientTag({
              tag: "sa",
              value: formValues.saltGrams,
            }),
          ].filter((value): value is string => value !== undefined);
          const quickInput = context.syncQuickInputFromFields
            ? [name, brand, nutrients.join(" ")]
                .join(", ")
                .replace(/(?:, )+$/g, "")
            : context.quickInput;

          return {
            context: {
              formValues,
              numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
              quickInput,
              quickInputParseResult: context.syncQuickInputFromFields
                ? Effect.runSync(
                    FoodQuickInput.parseFoodQuickInput({ input: quickInput })
                  )
                : context.quickInputParseResult,
            },
          };
        },
        changeQuickInput: ({ context, event }) => {
          const quickInputParseResult = Effect.runSync(
            FoodQuickInput.parseFoodQuickInput({ input: event.input })
          );
          const { partial } = quickInputParseResult;
          const formValues = {
            name: partial.name ?? "",
            brand: partial.brand ?? "",
            energyKcal:
              partial.energyKcal === undefined ? "" : `${partial.energyKcal}`,
            proteinGrams:
              partial.proteinGrams === undefined
                ? ""
                : `${partial.proteinGrams}`,
            carbsGrams:
              partial.carbsGrams === undefined ? "" : `${partial.carbsGrams}`,
            fatGrams:
              partial.fatGrams === undefined ? "" : `${partial.fatGrams}`,
            fiberGrams:
              partial.fiberGrams === undefined ? "" : `${partial.fiberGrams}`,
            sugarGrams:
              partial.sugarGrams === undefined ? "" : `${partial.sugarGrams}`,
            saturatedFatGrams:
              partial.saturatedFatGrams === undefined
                ? ""
                : `${partial.saturatedFatGrams}`,
            saltGrams:
              partial.saltGrams === undefined ? "" : `${partial.saltGrams}`,
            nutritionReferenceAmount:
              context.formValues.nutritionReferenceAmount,
            nutritionReferenceUnit: context.formValues.nutritionReferenceUnit,
            conversionMassAmount: context.formValues.conversionMassAmount,
            conversionMassUnit: context.formValues.conversionMassUnit,
            conversionVolumeAmount: context.formValues.conversionVolumeAmount,
            conversionVolumeUnit: context.formValues.conversionVolumeUnit,
          } satisfies FoodFormValues;

          return {
            context: {
              formValues,
              numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
              quickInput: event.input,
              quickInputParseResult,
            },
          };
        },
      },
    },
  },
});

export type FoodFormActorRef = ActorRefFrom<typeof foodFormMachine>;
export type FoodFormSnapshot = SnapshotFrom<typeof foodFormMachine>;

function _foodFormContextFromInput({
  initialFood,
  syncQuickInputFromFields,
}: {
  readonly initialFood: Domain.Food | null;
  readonly syncQuickInputFromFields: boolean;
}): {
  readonly formValues: FoodFormValues;
  readonly numberWarnings: readonly FoodNumberWarning[];
  readonly portions: readonly FoodPortionFormValue[];
  readonly quickInput: string;
  readonly quickInputParseResult: FoodQuickInput.FoodQuickInputParseResult;
  readonly syncQuickInputFromFields: boolean;
} {
  const food = initialFood;
  const formValues = {
    name: food?.name ?? "",
    brand: food?.brand ?? "",
    energyKcal: food === null ? "" : `${food.energyKcal}`,
    proteinGrams: food === null ? "" : `${food.proteinGrams}`,
    carbsGrams: food === null ? "" : `${food.carbsGrams}`,
    fatGrams: food === null ? "" : `${food.fatGrams}`,
    fiberGrams: food?.fiberGrams === undefined ? "" : `${food.fiberGrams}`,
    sugarGrams: food?.sugarGrams === undefined ? "" : `${food.sugarGrams}`,
    saturatedFatGrams:
      food?.saturatedFatGrams === undefined ? "" : `${food.saturatedFatGrams}`,
    saltGrams: food?.saltGrams === undefined ? "" : `${food.saltGrams}`,
    nutritionReferenceAmount: `${food?.nutritionReference.amount ?? 100}`,
    nutritionReferenceUnit: food?.nutritionReference.unit ?? "g",
    conversionMassAmount:
      food?.massVolumeConversion === undefined
        ? ""
        : `${food.massVolumeConversion.mass.amount}`,
    conversionMassUnit: food?.massVolumeConversion?.mass.unit ?? "g",
    conversionVolumeAmount:
      food?.massVolumeConversion === undefined
        ? ""
        : `${food.massVolumeConversion.volume.amount}`,
    conversionVolumeUnit: food?.massVolumeConversion?.volume.unit ?? "ml",
  } satisfies FoodFormValues;
  const quickInput = "";

  return {
    formValues,
    numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
    portions:
      food?.portions.map((portion) => ({
        id: portion.id,
        name: portion.name,
        amount: `${portion.size.amount}`,
        unit: portion.size.unit,
      })) ?? [],
    quickInput,
    quickInputParseResult: Effect.runSync(
      FoodQuickInput.parseFoodQuickInput({ input: quickInput })
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
  const energyKcal = _formNumber(formValues.energyKcal);
  const proteinGrams = _formNumber(formValues.proteinGrams);
  const carbsGrams = _formNumber(formValues.carbsGrams);
  const fatGrams = _formNumber(formValues.fatGrams);
  const sugarGrams = _formNumber(formValues.sugarGrams);
  const saturatedFatGrams = _formNumber(formValues.saturatedFatGrams);
  const saltGrams = _formNumber(formValues.saltGrams);
  const macroTotalGrams =
    (proteinGrams ?? 0) + (carbsGrams ?? 0) + (fatGrams ?? 0);
  const macroEnergyKcal =
    (proteinGrams ?? 0) * 4 + (carbsGrams ?? 0) * 4 + (fatGrams ?? 0) * 9;

  const referenceAmount = _formNumber(formValues.nutritionReferenceAmount);
  const referenceMassMultiplier = {
    g: 1,
    kg: 1_000,
    oz: 28.349_523_125,
    lb: 453.592_37,
  }[formValues.nutritionReferenceUnit];
  const referenceMassGrams =
    referenceAmount === undefined || referenceMassMultiplier === undefined
      ? undefined
      : referenceAmount * referenceMassMultiplier;

  if (
    referenceMassGrams !== undefined &&
    macroTotalGrams > referenceMassGrams
  ) {
    warnings.push({
      message:
        "Protein, carbs, and fat add up to more than the reference weight.",
    });
  }

  if (
    energyKcal !== undefined &&
    referenceMassGrams !== undefined &&
    (energyKcal / referenceMassGrams) * 100 > 900
  ) {
    warnings.push({
      field: "energyKcal",
      message: "Calories are above 900 kcal per 100 g.",
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
      field: "sugarGrams",
      message: "Sugar is greater than total carbs.",
    });
  }

  if (
    saturatedFatGrams !== undefined &&
    fatGrams !== undefined &&
    saturatedFatGrams > fatGrams
  ) {
    warnings.push({
      field: "saturatedFatGrams",
      message: "Saturated fat is greater than total fat.",
    });
  }

  if (
    saltGrams !== undefined &&
    referenceMassGrams !== undefined &&
    (saltGrams / referenceMassGrams) * 100 > 20
  ) {
    warnings.push({
      field: "saltGrams",
      message: "Salt is above 20 g per 100 g.",
    });
  }

  return warnings;
}

export function foodPortionFormErrorsFromValues({
  portions,
}: {
  readonly portions: readonly FoodPortionFormValue[];
}): readonly FoodPortionFormError[] {
  const normalizedNames = portions.map((portion) =>
    portion.name.trim().toLocaleLowerCase()
  );

  return portions.map((portion, index) => {
    const normalizedName = normalizedNames[index] ?? "";
    const amount = _formNumber(portion.amount);
    const duplicateName =
      normalizedName !== "" &&
      normalizedNames.some(
        (otherName, otherIndex) =>
          otherIndex !== index && otherName === normalizedName
      );

    return {
      ...(normalizedName === ""
        ? { name: "Add a name or remove this portion." }
        : duplicateName
          ? { name: "Use a unique name for each portion." }
          : {}),
      ...(amount === undefined || amount <= 0
        ? { amount: "Enter an amount greater than zero." }
        : {}),
    };
  });
}

export function foodPortionFormValuesAreValid({
  portions,
}: {
  readonly portions: readonly FoodPortionFormValue[];
}) {
  return foodPortionFormErrorsFromValues({ portions }).every(
    (error) => error.name === undefined && error.amount === undefined
  );
}

export function createFoodInputFromFormValues({
  formValues,
  portions,
}: {
  readonly formValues: FoodFormValues;
  readonly portions: readonly FoodPortionFormValue[];
}): Foods.CreateFoodInput {
  const brand = formValues.brand.trim();
  const fiberGrams = _optionalFormValue(formValues.fiberGrams);
  const sugarGrams = _optionalFormValue(formValues.sugarGrams);
  const saturatedFatGrams = _optionalFormValue(formValues.saturatedFatGrams);
  const saltGrams = _optionalFormValue(formValues.saltGrams);
  const nutritionReferenceUnit =
    measurementUnitByValue[formValues.nutritionReferenceUnit] ?? "g";
  const conversionMassUnit =
    massUnitByValue[formValues.conversionMassUnit] ?? "g";
  const conversionVolumeUnit =
    volumeUnitByValue[formValues.conversionVolumeUnit] ?? "ml";
  const conversionMassAmount = _optionalFormValue(
    formValues.conversionMassAmount
  );
  const conversionVolumeAmount = _optionalFormValue(
    formValues.conversionVolumeAmount
  );

  return {
    name: formValues.name.trim(),
    ...(brand === "" ? {} : { brand }),
    nutritionReference: {
      amount: formValues.nutritionReferenceAmount,
      unit: nutritionReferenceUnit,
    },
    energyKcal: formValues.energyKcal,
    proteinGrams: formValues.proteinGrams,
    carbsGrams: formValues.carbsGrams,
    fatGrams: formValues.fatGrams,
    ...(fiberGrams === undefined ? {} : { fiberGrams }),
    ...(sugarGrams === undefined ? {} : { sugarGrams }),
    ...(saturatedFatGrams === undefined ? {} : { saturatedFatGrams }),
    ...(saltGrams === undefined ? {} : { saltGrams }),
    portions: portions.map((portion) => ({
      ...(portion.id === undefined ? {} : { id: portion.id }),
      name: portion.name,
      size: {
        amount: portion.amount,
        unit: portion.unit,
      },
    })),
    ...(conversionMassAmount === undefined &&
    conversionVolumeAmount === undefined
      ? {}
      : {
          massVolumeConversion: {
            mass: {
              amount: conversionMassAmount ?? "",
              unit: conversionMassUnit,
            },
            volume: {
              amount: conversionVolumeAmount ?? "",
              unit: conversionVolumeUnit,
            },
          },
        }),
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
