import type { DateKey } from "@mai/nutrition";

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
  return {
    name: _formString({ formData, name: "name" }),
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
  };
};
