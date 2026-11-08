import { Utils, Domain, FoodQuickInput } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

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
  | "initialPriceQuantity"
  | "initialPriceQuantityUnit"
  | "initialPriceValue"
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
  initialPriceValue: Schema.String,
  initialPriceQuantity: Schema.String,
  initialPriceQuantityUnit: Schema.String,
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
  "initialPriceValue",
  "initialPriceQuantity",
  "initialPriceQuantityUnit",
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

const FoodQuickInputParseIssueSchema = Schema.Struct({
  field: Schema.optionalKey(
    Schema.Literals([
      "brand",
      "carbsGrams",
      "energyKcal",
      "fatGrams",
      "fiberGrams",
      "name",
      "proteinGrams",
      "saltGrams",
      "saturatedFatGrams",
      "sugarGrams",
    ])
  ),
  input: Schema.String,
  message: Schema.String,
  reason: Schema.Literals([
    "duplicate-tag",
    "invalid-number",
    "missing-name",
    "missing-required-nutrient",
    "schema-error",
    "too-many-fields",
    "unrecognized-token",
  ]),
});

const FoodQuickInputParseResultSchema = Schema.Struct({
  food: Schema.optionalKey(FoodQuickInput.FoodQuickInput),
  input: Schema.String,
  issues: Schema.Array(FoodQuickInputParseIssueSchema),
  partial: Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    brand: Schema.optionalKey(Schema.String),
    energyKcal: Schema.optionalKey(Schema.Number),
    proteinGrams: Schema.optionalKey(Schema.Number),
    carbsGrams: Schema.optionalKey(Schema.Number),
    fatGrams: Schema.optionalKey(Schema.Number),
    fiberGrams: Schema.optionalKey(Schema.Number),
    sugarGrams: Schema.optionalKey(Schema.Number),
    saturatedFatGrams: Schema.optionalKey(Schema.Number),
    saltGrams: Schema.optionalKey(Schema.Number),
  }),
  status: Schema.Literals(["complete", "empty", "incomplete", "invalid"]),
});

export const FoodFormSubmitInput = Schema.Struct({
  name: Schema.String,
  brand: Schema.optionalKey(Schema.String),
  energyKcal: Schema.String,
  proteinGrams: Schema.String,
  carbsGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.optionalKey(Schema.String),
  sugarGrams: Schema.optionalKey(Schema.String),
  saturatedFatGrams: Schema.optionalKey(Schema.String),
  saltGrams: Schema.optionalKey(Schema.String),
  nutritionReference: Schema.Struct({
    amount: Schema.String,
    unit: Domain.MeasurementUnit,
  }),
  initialPrice: Schema.optionalKey(
    Schema.Struct({
      price: Schema.String,
      currency: Schema.Literal("EUR"),
      referenceQuantity: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MeasurementUnit,
      }),
    })
  ),
  portions: Schema.Array(
    Schema.Struct({
      id: Schema.optionalKey(Domain.FoodPortionId),
      name: Schema.String,
      size: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MeasurementUnit,
      }),
    })
  ),
  massVolumeConversion: Schema.optionalKey(
    Schema.Struct({
      mass: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MassUnit,
      }),
      volume: Schema.Struct({
        amount: Schema.String,
        unit: Domain.VolumeUnit,
      }),
    })
  ),
});

export type FoodFormSubmitInput = typeof FoodFormSubmitInput.Type;

export const FoodFormParentEvents = Machine.events({
  FoodFormSubmitted: { input: FoodFormSubmitInput },
});

export const FoodFormEvents = Machine.events({
  AddPortion: {},
  ChangeFormValue: { name: FoodFormValueNameSchema, value: Schema.String },
  ChangePortion: {
    field: FoodPortionFormFieldSchema,
    index: Schema.Int,
    value: Schema.String,
  },
  ChangeQuickInput: { input: Schema.String },
  LoadFood: { food: Domain.Food },
  RemovePortion: { index: Schema.Int },
  Reset: {},
  Submit: {},
});

export const FoodFormStates = Machine.state({
  fields: {
    formValues: FoodFormValuesSchema,
    portions: Schema.Array(FoodPortionFormValueSchema),
    numberWarnings: Schema.Array(FoodNumberWarningSchema),
    quickInput: Schema.String,
    quickInputParseResult: FoodQuickInputParseResultSchema,
    syncQuickInputFromFields: Schema.Boolean,
  },
});

export const FoodFormMachine = Machine.make({
  id: "FoodForm",
  root: FoodFormStates,
  events: FoodFormEvents,
  input: Schema.Struct({
    initialFood: Schema.NullOr(Domain.Food),
    syncQuickInputFromFields: Schema.Boolean,
  }),
  parent: Machine.optionalParent(FoodFormParentEvents),
  branches: {
    submit: { submitted: { none: true } },
  },
}).handle({
  root: ({ input }) => _foodFormContextFromInput(input),
  on: {
    LoadFood: {
      update: "root",
      data: ({ root, event }) =>
        _foodFormContextFromInput({
          initialFood: event.food,
          syncQuickInputFromFields: root.syncQuickInputFromFields,
        }),
    },
    Reset: {
      update: "root",
      data: ({ root }) =>
        _foodFormContextFromInput({
          initialFood: null,
          syncQuickInputFromFields: root.syncQuickInputFromFields,
        }),
    },
    Submit: {
      branches: "submit",
      declinable: true,
      resolve: ({ root, parent, select, decline }, enqueue) => {
        if (
          parent === undefined ||
          !foodPortionFormValuesAreValid({ portions: root.portions }) ||
          !foodInitialPriceFormValuesAreValid({ formValues: root.formValues })
        ) {
          return decline();
        }

        enqueue.sendTo(
          parent,
          FoodFormParentEvents.FoodFormSubmitted({
            input: createFoodInputFromFormValues({
              formValues: root.formValues,
              portions: root.portions,
            }),
          })
        );

        return select.submitted();
      },
    },
    AddPortion: {
      update: "root",
      data: ({ root }) => ({
        ...root,
        portions: [...root.portions, { name: "", amount: "", unit: "g" }],
      }),
    },
    ChangePortion: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        portions: root.portions.map((portion, index) =>
          index !== event.index
            ? portion
            : event.field === "unit"
              ? {
                  ...portion,
                  unit: measurementUnitByValue[event.value] ?? portion.unit,
                }
              : event.field === "name"
                ? { ...portion, name: event.value }
                : { ...portion, amount: event.value }
        ),
      }),
    },
    RemovePortion: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        portions: root.portions.filter(
          (_portion, index) => index !== event.index
        ),
      }),
    },
    ChangeFormValue: {
      update: "root",
      data: ({ root, event }) => {
        const formValues = {
          ...root.formValues,
          [event.name]: event.value,
        };
        const quickInput = root.syncQuickInputFromFields
          ? FoodQuickInput.formatFoodQuickInput({ values: formValues })
          : root.quickInput;

        return {
          ...root,
          formValues,
          numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
          quickInput,
          quickInputParseResult: root.syncQuickInputFromFields
            ? Effect.runSync(
                FoodQuickInput.parseFoodQuickInput({ input: quickInput })
              )
            : root.quickInputParseResult,
        };
      },
    },
    ChangeQuickInput: {
      update: "root",
      data: ({ root, event }) => {
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
            partial.proteinGrams === undefined ? "" : `${partial.proteinGrams}`,
          carbsGrams:
            partial.carbsGrams === undefined ? "" : `${partial.carbsGrams}`,
          fatGrams: partial.fatGrams === undefined ? "" : `${partial.fatGrams}`,
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
          initialPriceValue: root.formValues.initialPriceValue,
          initialPriceQuantity: root.formValues.initialPriceQuantity,
          initialPriceQuantityUnit: root.formValues.initialPriceQuantityUnit,
          nutritionReferenceAmount: root.formValues.nutritionReferenceAmount,
          nutritionReferenceUnit: root.formValues.nutritionReferenceUnit,
          conversionMassAmount: root.formValues.conversionMassAmount,
          conversionMassUnit: root.formValues.conversionMassUnit,
          conversionVolumeAmount: root.formValues.conversionVolumeAmount,
          conversionVolumeUnit: root.formValues.conversionVolumeUnit,
        } satisfies FoodFormValues;

        return {
          ...root,
          formValues,
          numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
          quickInput: event.input,
          quickInputParseResult,
        };
      },
    },
  },
});

export const FoodFormChild = Machine.child("foodForm", FoodFormMachine);

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
  const nutrients = food === null ? null : Utils.foodNutrition(food);
  const formValues = {
    name: food?.name ?? "",
    brand: food?.brand ?? "",
    energyKcal: nutrients === null ? "" : `${nutrients.energyKcal}`,
    proteinGrams: nutrients === null ? "" : `${nutrients.proteinGrams}`,
    carbsGrams: nutrients === null ? "" : `${nutrients.carbsGrams}`,
    fatGrams: nutrients === null ? "" : `${nutrients.fatGrams}`,
    fiberGrams:
      nutrients?.fiberGrams === undefined ? "" : `${nutrients.fiberGrams}`,
    sugarGrams:
      nutrients?.sugarGrams === undefined ? "" : `${nutrients.sugarGrams}`,
    saturatedFatGrams:
      nutrients?.saturatedFatGrams === undefined
        ? ""
        : `${nutrients.saturatedFatGrams}`,
    saltGrams:
      nutrients?.saltGrams === undefined ? "" : `${nutrients.saltGrams}`,
    initialPriceValue: "",
    initialPriceQuantity: "1",
    initialPriceQuantityUnit: "kg",
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
  const quickInput =
    food === null
      ? ""
      : FoodQuickInput.formatFoodQuickInput({ values: formValues });

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

export type FoodInitialPriceFormError = {
  readonly price?: string;
  readonly quantity?: string;
};

export function foodInitialPriceFormErrorFromValues({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}): FoodInitialPriceFormError {
  if (formValues.initialPriceValue.trim() === "") {
    return {};
  }

  const price = _formNumber(formValues.initialPriceValue.replace(",", "."));
  const quantity = _formNumber(
    formValues.initialPriceQuantity.replace(",", ".")
  );

  return {
    ...(price === undefined || price <= 0
      ? { price: "Enter a price greater than zero." }
      : {}),
    ...(quantity === undefined || quantity <= 0
      ? { quantity: "Enter a quantity greater than zero." }
      : {}),
  };
}

export function foodInitialPriceFormValuesAreValid({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}) {
  const error = foodInitialPriceFormErrorFromValues({ formValues });
  return error.price === undefined && error.quantity === undefined;
}

export function createFoodInputFromFormValues({
  formValues,
  portions,
}: {
  readonly formValues: FoodFormValues;
  readonly portions: readonly FoodPortionFormValue[];
}): FoodFormSubmitInput {
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
  const initialPriceValue = _optionalFormValue(formValues.initialPriceValue);
  const initialPriceQuantityUnit =
    measurementUnitByValue[formValues.initialPriceQuantityUnit] ?? "kg";

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
    ...(initialPriceValue === undefined
      ? {}
      : {
          initialPrice: {
            price: initialPriceValue.replace(",", "."),
            currency: "EUR",
            referenceQuantity: {
              amount: formValues.initialPriceQuantity.replace(",", "."),
              unit: initialPriceQuantityUnit,
            },
          },
        }),
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
