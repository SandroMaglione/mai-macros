import { calculateMacronutrientEnergyKcal, type DateKey } from "@mai/nutrition";

import type { CreateMealEntryInput } from "./services/meal-entries.ts";
import type { CreateFoodInput } from "./services/foods.ts";
import type { CreateMealPlanInput } from "./services/meal-plans.ts";

export const dateKeyFromDate = ({ date }: { readonly date: Date }) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const _formString = ({
  formData,
  name,
}: {
  readonly formData: FormData;
  readonly name: string;
}) => {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
};

const _formTrimmedString = ({
  formData,
  name,
}: {
  readonly formData: FormData;
  readonly name: string;
}) => {
  return _formString({ formData, name }).trim();
};

const _formOptionalString = ({
  formData,
  name,
}: {
  readonly formData: FormData;
  readonly name: string;
}) => {
  const value = _formTrimmedString({ formData, name });

  return value === "" ? undefined : value;
};

export const shiftDateKey = ({
  dateKey,
  days,
}: {
  readonly dateKey: DateKey | string;
  readonly days: number;
}) => {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);

  return dateKeyFromDate({ date });
};

export const createMealPlanInputFromFormData = ({
  formData,
}: {
  readonly formData: FormData;
}): CreateMealPlanInput => {
  const fiberTargetGrams = _formOptionalString({
    formData,
    name: "fiberTargetGrams",
  });
  const sugarTargetGrams = _formOptionalString({
    formData,
    name: "sugarTargetGrams",
  });
  const saltTargetGrams = _formOptionalString({
    formData,
    name: "saltTargetGrams",
  });
  const saturatedFatTargetGrams = _formOptionalString({
    formData,
    name: "saturatedFatTargetGrams",
  });

  return {
    name: _formTrimmedString({ formData, name: "name" }),
    proteinTargetGrams: _formString({
      formData,
      name: "proteinTargetGrams",
    }),
    carbsTargetGrams: _formString({
      formData,
      name: "carbsTargetGrams",
    }),
    fatTargetGrams: _formString({
      formData,
      name: "fatTargetGrams",
    }),
    ...(fiberTargetGrams === undefined ? {} : { fiberTargetGrams }),
    ...(sugarTargetGrams === undefined ? {} : { sugarTargetGrams }),
    ...(saltTargetGrams === undefined ? {} : { saltTargetGrams }),
    ...(saturatedFatTargetGrams === undefined
      ? {}
      : { saturatedFatTargetGrams }),
  };
};

export const calculateMealPlanEnergyKcalFromFormData = ({
  formData,
}: {
  readonly formData: FormData;
}) =>
  calculateMacronutrientEnergyKcal({
    proteinGrams: _formNonNegativeNumber({
      formData,
      name: "proteinTargetGrams",
    }),
    carbsGrams: _formNonNegativeNumber({
      formData,
      name: "carbsTargetGrams",
    }),
    fatGrams: _formNonNegativeNumber({
      formData,
      name: "fatTargetGrams",
    }),
  });

export const createFoodInputFromFormData = ({
  formData,
}: {
  readonly formData: FormData;
}): CreateFoodInput => {
  const brand = _formTrimmedString({ formData, name: "brand" });
  const fiberGramsPer100g = _formOptionalString({
    formData,
    name: "fiberGramsPer100g",
  });
  const sugarGramsPer100g = _formOptionalString({
    formData,
    name: "sugarGramsPer100g",
  });
  const saturatedFatGramsPer100g = _formOptionalString({
    formData,
    name: "saturatedFatGramsPer100g",
  });
  const saltGramsPer100g = _formOptionalString({
    formData,
    name: "saltGramsPer100g",
  });

  return {
    name: _formTrimmedString({ formData, name: "name" }),
    ...(brand === "" ? {} : { brand }),
    energyKcalPer100g: _formString({
      formData,
      name: "energyKcalPer100g",
    }),
    proteinGramsPer100g: _formString({
      formData,
      name: "proteinGramsPer100g",
    }),
    carbsGramsPer100g: _formString({
      formData,
      name: "carbsGramsPer100g",
    }),
    fatGramsPer100g: _formString({
      formData,
      name: "fatGramsPer100g",
    }),
    ...(fiberGramsPer100g === undefined ? {} : { fiberGramsPer100g }),
    ...(sugarGramsPer100g === undefined ? {} : { sugarGramsPer100g }),
    ...(saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGramsPer100g }),
    ...(saltGramsPer100g === undefined ? {} : { saltGramsPer100g }),
  };
};

export const createMealEntryInputFromFormData = ({
  dateKey,
  formData,
}: {
  readonly dateKey: DateKey;
  readonly formData: FormData;
}): CreateMealEntryInput => {
  return {
    dateKey,
    meal: _formString({
      formData,
      name: "meal",
    }),
    foodId: _formString({ formData, name: "foodId" }),
    quantityGrams: _formString({ formData, name: "quantityGrams" }),
  };
};

const _formNonNegativeNumber = ({
  formData,
  name,
}: {
  readonly formData: FormData;
  readonly name: string;
}) => {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
};
