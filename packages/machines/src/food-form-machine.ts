import { Domain, FoodQuickInput, type Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Predicate, Schema } from "effect";

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

const FoodFormInputSchema = Schema.Struct({
  initialFood: Schema.NullOr(Domain.Food),
  syncQuickInputFromFields: Schema.Boolean,
});

const CreateFoodInputSchema = Schema.declare<Foods.CreateFoodInput>(
  (value): value is Foods.CreateFoodInput => Predicate.isObject(value),
  { expected: "Foods.CreateFoodInput" }
);

export class FoodFormEditing extends Schema.TaggedClass<FoodFormEditing>(
  "FoodFormEditing"
)("FoodFormEditing", {
  formValues: FoodFormValuesSchema,
  portions: Schema.Array(FoodPortionFormValueSchema),
  numberWarnings: Schema.Array(FoodNumberWarningSchema),
  quickInput: Schema.String,
  quickInputParseResult: Schema.Any,
  syncQuickInputFromFields: Schema.Boolean,
}) {
  declare readonly quickInputParseResult: FoodQuickInput.FoodQuickInputParseResult;
}

export class FoodFormPristine extends Schema.TaggedClass<FoodFormPristine>(
  "FoodFormPristine"
)("FoodFormPristine", {}) {}

export class FoodFormDirty extends Schema.TaggedClass<FoodFormDirty>(
  "FoodFormDirty"
)("FoodFormDirty", {}) {}

export class ChangeFoodFormValue extends Schema.TaggedClass<ChangeFoodFormValue>(
  "ChangeFoodFormValue"
)("ChangeFoodFormValue", {
  name: FoodFormValueNameSchema,
  value: Schema.String,
}) {}

export class ChangeFoodQuickInput extends Schema.TaggedClass<ChangeFoodQuickInput>(
  "ChangeFoodQuickInput"
)("ChangeFoodQuickInput", { input: Schema.String }) {}

export class AddFoodPortion extends Schema.TaggedClass<AddFoodPortion>(
  "AddFoodPortion"
)("AddFoodPortion", {}) {}

export class LoadFood extends Schema.TaggedClass<LoadFood>("LoadFood")(
  "LoadFood",
  { food: Domain.Food }
) {}

export class ChangeFoodPortion extends Schema.TaggedClass<ChangeFoodPortion>(
  "ChangeFoodPortion"
)("ChangeFoodPortion", {
  field: FoodPortionFormFieldSchema,
  index: Schema.Int,
  value: Schema.String,
}) {}

export class RemoveFoodPortion extends Schema.TaggedClass<RemoveFoodPortion>(
  "RemoveFoodPortion"
)("RemoveFoodPortion", { index: Schema.Int }) {}

export class ResetFoodForm extends Schema.TaggedClass<ResetFoodForm>(
  "ResetFoodForm"
)("ResetFoodForm", {}) {}

export class SubmitFoodForm extends Schema.TaggedClass<SubmitFoodForm>(
  "SubmitFoodForm"
)("SubmitFoodForm", {}) {}

export class FoodFormSubmitted extends Schema.TaggedClass<FoodFormSubmitted>(
  "FoodFormSubmitted"
)("FoodFormSubmitted", { input: CreateFoodInputSchema }) {}

export type FoodFormSubmitEvent = typeof FoodFormSubmitted.Type;

export const FoodFormStates = Machine.defineStates({
  Editing: {
    schema: FoodFormEditing,
    initial: "Pristine",
    states: {
      Pristine: FoodFormPristine,
      Dirty: FoodFormDirty,
    },
  },
});

const _pristineFoodFormSnapshot = (
  values: ConstructorParameters<typeof FoodFormEditing>[0]
) =>
  FoodFormStates.initial.Editing(new FoodFormEditing(values), (editing) =>
    editing.Pristine(new FoodFormPristine())
  );

export const foodFormMachine = Machine.make({
  id: "foodForm",
  states: FoodFormStates.states,
  events: [
    ChangeFoodFormValue,
    ChangeFoodQuickInput,
    AddFoodPortion,
    LoadFood,
    ChangeFoodPortion,
    RemoveFoodPortion,
    ResetFoodForm,
    SubmitFoodForm,
  ],
  emits: [FoodFormSubmitted],
  input: FoodFormInputSchema,
  initial: (input) =>
    _pristineFoodFormSnapshot(_foodFormContextFromInput(input)),
}).handle({
  Editing: {
    on: {
      LoadFood: ({ event, state }) =>
        _pristineFoodFormSnapshot(
          _foodFormContextFromInput({
            initialFood: event.food,
            syncQuickInputFromFields: state.syncQuickInputFromFields,
          })
        ),
      ResetFoodForm: ({ state }) =>
        _pristineFoodFormSnapshot(
          _foodFormContextFromInput({
            initialFood: null,
            syncQuickInputFromFields: state.syncQuickInputFromFields,
          })
        ),
      SubmitFoodForm: ({ emit, state }) => {
        if (
          !foodPortionFormValuesAreValid({ portions: state.portions }) ||
          !foodInitialPriceFormValuesAreValid({
            formValues: state.formValues,
          })
        ) {
          return;
        }

        return Machine.action(
          emit(
            new FoodFormSubmitted({
              input: createFoodInputFromFormValues({
                formValues: state.formValues,
                portions: state.portions,
              }),
            })
          )
        );
      },
      AddFoodPortion: ({ state, target }) =>
        target.full.Editing(
          new FoodFormEditing({
            ...state,
            portions: [...state.portions, { name: "", amount: "", unit: "g" }],
          }),
          (editing) => editing.Dirty(new FoodFormDirty())
        ),
      ChangeFoodPortion: ({ event, state, target }) =>
        target.full.Editing(
          new FoodFormEditing({
            ...state,
            portions: state.portions.map((portion, index) =>
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
          }),
          (editing) => editing.Dirty(new FoodFormDirty())
        ),
      RemoveFoodPortion: ({ event, state, target }) =>
        target.full.Editing(
          new FoodFormEditing({
            ...state,
            portions: state.portions.filter(
              (_portion, index) => index !== event.index
            ),
          }),
          (editing) => editing.Dirty(new FoodFormDirty())
        ),
      ChangeFoodFormValue: ({ event, state, target }) => {
        const formValues = {
          ...state.formValues,
          [event.name]: event.value,
        };
        const name = formValues.name.trim();
        const brand = formValues.brand.trim();
        const nutrients = [
          _quickNutrientTag({ tag: "k", value: formValues.energyKcal }),
          _quickNutrientTag({ tag: "f", value: formValues.fatGrams }),
          _quickNutrientTag({
            tag: "sf",
            value: formValues.saturatedFatGrams,
          }),
          _quickNutrientTag({ tag: "c", value: formValues.carbsGrams }),
          _quickNutrientTag({ tag: "su", value: formValues.sugarGrams }),
          _quickNutrientTag({ tag: "fi", value: formValues.fiberGrams }),
          _quickNutrientTag({ tag: "p", value: formValues.proteinGrams }),
          _quickNutrientTag({ tag: "sa", value: formValues.saltGrams }),
        ].filter((value): value is string => value !== undefined);
        const quickInput = state.syncQuickInputFromFields
          ? [name, brand, nutrients.join(" ")]
              .join(", ")
              .replace(/(?:, )+$/g, "")
          : state.quickInput;

        return target.full.Editing(
          new FoodFormEditing({
            ...state,
            formValues,
            numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
            quickInput,
            quickInputParseResult: state.syncQuickInputFromFields
              ? Effect.runSync(
                  FoodQuickInput.parseFoodQuickInput({ input: quickInput })
                )
              : state.quickInputParseResult,
          }),
          (editing) => editing.Dirty(new FoodFormDirty())
        );
      },
      ChangeFoodQuickInput: ({ event, state, target }) => {
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
          initialPriceValue: state.formValues.initialPriceValue,
          initialPriceQuantity: state.formValues.initialPriceQuantity,
          initialPriceQuantityUnit: state.formValues.initialPriceQuantityUnit,
          nutritionReferenceAmount: state.formValues.nutritionReferenceAmount,
          nutritionReferenceUnit: state.formValues.nutritionReferenceUnit,
          conversionMassAmount: state.formValues.conversionMassAmount,
          conversionMassUnit: state.formValues.conversionMassUnit,
          conversionVolumeAmount: state.formValues.conversionVolumeAmount,
          conversionVolumeUnit: state.formValues.conversionVolumeUnit,
        } satisfies FoodFormValues;

        return target.full.Editing(
          new FoodFormEditing({
            ...state,
            formValues,
            numberWarnings: foodNumberWarningsFromFormValues({ formValues }),
            quickInput: event.input,
            quickInputParseResult,
          }),
          (editing) => editing.Dirty(new FoodFormDirty())
        );
      },
    },
  },
});

export const FoodFormChild = Machine.child("foodForm", foodFormMachine);
export type FoodFormActorRef = Machine.ChildMachine.Ref<typeof FoodFormChild>;
export type FoodFormSnapshot = Machine.Machine.Snapshot<
  typeof FoodFormStates.states
>;

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
