import {
  calculateMacronutrientEnergyKcal,
  type DateKey,
  type FoodQuickInput,
  type Plan,
} from "@mai/nutrition";
import { Array, DateTime, Iterable, Option, Schema } from "effect";

import type { CreateFoodInput } from "@mai/nutrition/services/foods";
import type { CreateMealEntryInput } from "@mai/nutrition/services/meal-entries";
import type { CreateMealPlanInput } from "@mai/nutrition/services/meal-plans";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

type MealPlanRequiredNumberFieldName =
  | "proteinTargetGrams"
  | "carbsTargetGrams"
  | "fatTargetGrams";

type MealPlanOptionalNumberFieldName =
  | "fiberTargetGrams"
  | "sugarTargetGrams"
  | "saltTargetGrams"
  | "saturatedFatTargetGrams";

const mealPlanRequiredNumberFieldNames = [
  "proteinTargetGrams",
  "carbsTargetGrams",
  "fatTargetGrams",
] as const satisfies readonly MealPlanRequiredNumberFieldName[];

const mealPlanOptionalNumberFieldNames = [
  "fiberTargetGrams",
  "sugarTargetGrams",
  "saltTargetGrams",
  "saturatedFatTargetGrams",
] as const satisfies readonly MealPlanOptionalNumberFieldName[];

export const dateKeyFromDate = ({ date }: { readonly date: Date }) => {
  return DateTime.formatIsoDate(_localDateTimeFromDate({ date }));
};

const _localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const _localDateTimeFromDate = ({ date }: { readonly date: Date }) =>
  DateTime.makeZoned(date, {
    timeZone: _localTimeZone(),
  }).pipe(Option.getOrThrow);

const _localDateTimeFromDateKey = ({
  dateKey,
}: {
  readonly dateKey: DateKey | string;
}) =>
  DateTime.makeZoned(dateKey, {
    adjustForTimeZone: true,
    timeZone: _localTimeZone(),
  }).pipe(Option.getOrThrow);

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
  return DateTime.formatIsoDate(
    DateTime.add(_localDateTimeFromDateKey({ dateKey }), { days })
  );
};

export const dateKeysInRange = ({
  endDateKey,
  startDateKey,
}: {
  readonly endDateKey: DateKey | string;
  readonly startDateKey: DateKey | string;
}) => {
  const startDate = _localDateTimeFromDateKey({ dateKey: startDateKey });
  const endDate = _localDateTimeFromDateKey({ dateKey: endDateKey });

  if (DateTime.isGreaterThan(startDate, endDate)) {
    return [];
  }

  const dates = Iterable.takeWhile(
    Iterable.makeBy<DateTime.DateTime>((days) =>
      DateTime.add(startDate, { days })
    ),
    (date) => DateTime.isLessThanOrEqualTo(date, endDate)
  );

  return Array.fromIterable(
    Iterable.map(dates, (date) => DateTime.formatIsoDate(date))
  );
};

export const startOfWeekDateKey = ({ date }: { readonly date: Date }) => {
  return DateTime.formatIsoDate(
    DateTime.startOf(_localDateTimeFromDate({ date }), "week", {
      weekStartsOn: 1,
    })
  );
};

export const startOfMonthDateKey = ({ date }: { readonly date: Date }) => {
  return DateTime.formatIsoDate(
    DateTime.startOf(_localDateTimeFromDate({ date }), "month")
  );
};

export const endOfMonthDateKey = ({ date }: { readonly date: Date }) => {
  return DateTime.formatIsoDate(
    DateTime.endOf(_localDateTimeFromDate({ date }), "month")
  );
};

export const monthKeyFromDateKey = ({
  dateKey,
}: {
  readonly dateKey: DateKey | string;
}) => dateKey.slice(0, 7);

export const dateFromMonthKey = ({ monthKey }: { readonly monthKey: string }) =>
  DateTime.toDateUtc(_localDateTimeFromDateKey({ dateKey: `${monthKey}-01` }));

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

export const mealPlanFormHasChangesFromPlan = ({
  formData,
  plan,
}: {
  readonly formData: FormData;
  readonly plan: Plan;
}) => {
  const input = createMealPlanInputFromFormData({ formData });

  if (input.name === "") {
    return false;
  }

  let hasChanges = input.name !== plan.name;

  for (const fieldName of mealPlanRequiredNumberFieldNames) {
    const fieldValue = _parseFormNonNegativeNumber({
      value: input[fieldName],
    });

    if (fieldValue === undefined) {
      return false;
    }

    if (fieldValue !== plan[fieldName]) {
      hasChanges = true;
    }
  }

  for (const fieldName of mealPlanOptionalNumberFieldNames) {
    const inputValue = input[fieldName];

    if (inputValue === undefined) {
      if (plan[fieldName] !== undefined) {
        hasChanges = true;
      }

      continue;
    }

    const fieldValue = _parseFormNonNegativeNumber({
      value: inputValue,
    });

    if (fieldValue === undefined) {
      return false;
    }

    if (fieldValue !== plan[fieldName]) {
      hasChanges = true;
    }
  }

  return hasChanges;
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

export const createFoodInputFromFoodQuickInput = ({
  food,
}: {
  readonly food: FoodQuickInput;
}): CreateFoodInput => {
  return {
    name: food.name,
    ...(food.brand === undefined ? {} : { brand: food.brand }),
    energyKcalPer100g: _numberInputValue({
      value: food.energyKcalPer100g,
    }),
    proteinGramsPer100g: _numberInputValue({
      value: food.proteinGramsPer100g,
    }),
    carbsGramsPer100g: _numberInputValue({
      value: food.carbsGramsPer100g,
    }),
    fatGramsPer100g: _numberInputValue({
      value: food.fatGramsPer100g,
    }),
    ...(food.fiberGramsPer100g === undefined
      ? {}
      : {
          fiberGramsPer100g: _numberInputValue({
            value: food.fiberGramsPer100g,
          }),
        }),
    ...(food.sugarGramsPer100g === undefined
      ? {}
      : {
          sugarGramsPer100g: _numberInputValue({
            value: food.sugarGramsPer100g,
          }),
        }),
    ...(food.saturatedFatGramsPer100g === undefined
      ? {}
      : {
          saturatedFatGramsPer100g: _numberInputValue({
            value: food.saturatedFatGramsPer100g,
          }),
        }),
    ...(food.saltGramsPer100g === undefined
      ? {}
      : {
          saltGramsPer100g: _numberInputValue({
            value: food.saltGramsPer100g,
          }),
        }),
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

  return _parseFormNonNegativeNumber({ value }) ?? 0;
};

const _parseFormNonNegativeNumber = ({ value }: { readonly value: string }) => {
  return Schema.decodeOption(_FormNonNegativeNumber)(value).pipe(
    Option.match({
      onNone: () => undefined,
      onSome: (parsedValue) => parsedValue,
    })
  );
};

const _numberInputValue = ({ value }: { readonly value: number }) => `${value}`;
