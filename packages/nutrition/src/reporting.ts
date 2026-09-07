import { Array, Option } from "effect";

import type {
  Food,
  CurrencyCode,
  LoggedFoodQuantity,
  MealEntry,
  NutritionMultiplier,
  OneOffNutrients,
  NutrientValue,
  Plan,
  NutrientTargetSemantics as DomainNutrientTargetSemantics,
} from "./domain.ts";
import { DefaultPlanTargetRules, isCatalogMealEntry } from "./domain.ts";
import { calculateEntryNutrients, calculatePlanEnergyKcal } from "./utils.ts";
import { massGramsFromQuantity } from "./measurements.ts";
import {
  convertMeasuredQuantityOption,
  measuredQuantityFromLoggedQuantity,
} from "./measurements.ts";

export const NutrientNames = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const;

export type NutrientName = (typeof NutrientNames)[number];

export type NutrientTargetSemantics = DomainNutrientTargetSemantics;

export type NutrientTargetStatusKind = "above" | "below" | "inside";

export type NutrientTotals = {
  readonly energyKcal: number;
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams: number;
  readonly sugarGrams: number;
  readonly saturatedFatGrams: number;
  readonly saltGrams: number;
};

export type NutrientCoverage = Record<NutrientName, number>;

export type NutrientTarget = {
  readonly amount: number;
  readonly lowerBound: number | undefined;
  readonly nutrientName: NutrientName;
  readonly semantics: NutrientTargetSemantics;
  readonly upperBound: number | undefined;
};

export type NutrientTargetStatus = NutrientTarget & {
  readonly deltaFromTarget: number;
  readonly percentOfTarget: number | null;
  readonly status: NutrientTargetStatusKind;
  readonly value: number;
};

export type EntriesNutrientTotals = {
  readonly coverage: NutrientCoverage;
  readonly entriesCount: number;
  readonly totals: NutrientTotals;
};

export type EntriesWeightTotals = {
  readonly entriesCount: number;
  readonly quantityGrams: number;
  readonly resolvedEntriesCount: number;
};

export type EntryCost = {
  readonly costMinor: number;
  readonly currency: CurrencyCode;
};

export type EntriesCostTotals = {
  readonly costMinorByCurrency: Readonly<Record<CurrencyCode, number>>;
  readonly entriesCount: number;
  readonly resolvedEntriesCount: number;
};

const zeroCostMinorByCurrency = {
  EUR: 0,
  JPY: 0,
  NZD: 0,
  USD: 0,
} satisfies Record<CurrencyCode, number>;

export const emptyEntriesCostTotals = (): EntriesCostTotals => ({
  costMinorByCurrency: { ...zeroCostMinorByCurrency },
  entriesCount: 0,
  resolvedEntriesCount: 0,
});

export const calculateEntryCost = ({
  food,
  quantity,
}: {
  readonly food: Food;
  readonly quantity: LoggedFoodQuantity;
}): EntryCost | null => {
  const currentPrice = food.prices.find((price) => price.isCurrent);

  if (currentPrice === undefined) {
    return null;
  }

  return convertMeasuredQuantityOption({
    food,
    quantity: measuredQuantityFromLoggedQuantity({ quantity }),
    targetUnit: currentPrice.referenceQuantity.unit,
  }).pipe(
    Option.map((amount) => ({
      costMinor:
        currentPrice.priceMinor *
        (amount / currentPrice.referenceQuantity.amount),
      currency: currentPrice.currency,
    })),
    Option.getOrNull
  );
};

export const calculateEntriesCostTotals = ({
  entries,
}: {
  readonly entries: readonly {
    readonly food: Food;
    readonly quantity: LoggedFoodQuantity;
  }[];
}): EntriesCostTotals =>
  entries.reduce<EntriesCostTotals>((totals, entry) => {
    const cost = calculateEntryCost(entry);

    return {
      costMinorByCurrency:
        cost === null
          ? totals.costMinorByCurrency
          : {
              ...totals.costMinorByCurrency,
              [cost.currency]:
                totals.costMinorByCurrency[cost.currency] + cost.costMinor,
            },
      entriesCount: totals.entriesCount + 1,
      resolvedEntriesCount:
        totals.resolvedEntriesCount + (cost === null ? 0 : 1),
    };
  }, emptyEntriesCostTotals());

export const calculateMealEntriesCostTotals = ({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): EntriesCostTotals => ({
  ...calculateEntriesCostTotals({
    entries: mealEntries.filter(isCatalogMealEntry).flatMap((entry) => {
      const food = foods.find((food) => food.id === entry.foodId);
      return food === undefined ? [] : [{ food, quantity: entry.quantity }];
    }),
  }),
  entriesCount: mealEntries.length,
});

export const NutrientTargetSemanticsByName = DefaultPlanTargetRules;

export const TargetOverageToleranceFraction = 0.1;

const zeroNutrientTotals = {
  carbsGrams: 0,
  energyKcal: 0,
  fatGrams: 0,
  fiberGrams: 0,
  proteinGrams: 0,
  saltGrams: 0,
  saturatedFatGrams: 0,
  sugarGrams: 0,
} satisfies NutrientTotals;

const zeroNutrientCoverage = {
  carbsGrams: 0,
  energyKcal: 0,
  fatGrams: 0,
  fiberGrams: 0,
  proteinGrams: 0,
  saltGrams: 0,
  saturatedFatGrams: 0,
  sugarGrams: 0,
} satisfies NutrientCoverage;

export const emptyNutrientTotals = (): NutrientTotals => ({
  ...zeroNutrientTotals,
});

export const emptyNutrientCoverage = (): NutrientCoverage => ({
  ...zeroNutrientCoverage,
});

export const addNutrientTotals = ({
  left,
  right,
}: {
  readonly left: NutrientTotals;
  readonly right: NutrientTotals;
}): NutrientTotals => ({
  carbsGrams: left.carbsGrams + right.carbsGrams,
  energyKcal: left.energyKcal + right.energyKcal,
  fatGrams: left.fatGrams + right.fatGrams,
  fiberGrams: left.fiberGrams + right.fiberGrams,
  proteinGrams: left.proteinGrams + right.proteinGrams,
  saltGrams: left.saltGrams + right.saltGrams,
  saturatedFatGrams: left.saturatedFatGrams + right.saturatedFatGrams,
  sugarGrams: left.sugarGrams + right.sugarGrams,
});

export const divideNutrientTotals = ({
  divisor,
  totals,
}: {
  readonly divisor: number;
  readonly totals: NutrientTotals;
}): NutrientTotals => {
  if (divisor <= 0) {
    return emptyNutrientTotals();
  }

  return {
    carbsGrams: totals.carbsGrams / divisor,
    energyKcal: totals.energyKcal / divisor,
    fatGrams: totals.fatGrams / divisor,
    fiberGrams: totals.fiberGrams / divisor,
    proteinGrams: totals.proteinGrams / divisor,
    saltGrams: totals.saltGrams / divisor,
    saturatedFatGrams: totals.saturatedFatGrams / divisor,
    sugarGrams: totals.sugarGrams / divisor,
  };
};

export const getNutrientTotal = ({
  nutrientName,
  totals,
}: {
  readonly nutrientName: NutrientName;
  readonly totals: NutrientTotals;
}): number => totals[nutrientName];

export const calculateEntriesNutrientTotals = ({
  entries,
}: {
  readonly entries: readonly {
    readonly food: Food;
    readonly nutritionMultiplier: NutritionMultiplier;
  }[];
}): EntriesNutrientTotals =>
  entries.reduce<EntriesNutrientTotals>(
    (aggregate, entry) => {
      const nutrients = calculateEntryNutrients({
        food: entry.food,
        nutritionMultiplier: entry.nutritionMultiplier,
      });

      return NutrientNames.reduce<EntriesNutrientTotals>(
        (nextAggregate, nutrientName) => {
          const value = nutrients[nutrientName];

          if (value === undefined) {
            return nextAggregate;
          }

          return {
            coverage: {
              ...nextAggregate.coverage,
              [nutrientName]: nextAggregate.coverage[nutrientName] + 1,
            },
            entriesCount: nextAggregate.entriesCount,
            totals: {
              ...nextAggregate.totals,
              [nutrientName]: nextAggregate.totals[nutrientName] + value,
            },
          };
        },
        {
          coverage: aggregate.coverage,
          entriesCount: aggregate.entriesCount + 1,
          totals: aggregate.totals,
        }
      );
    },
    {
      coverage: emptyNutrientCoverage(),
      entriesCount: 0,
      totals: emptyNutrientTotals(),
    }
  );

export type MealEntriesNutrientTotals = EntriesNutrientTotals & {
  readonly recorded: NutrientTotals;
  readonly estimated: NutrientTotals;
  readonly estimatedCoverage: NutrientCoverage;
  readonly missing: NutrientCoverage;
};

export const resolveMealEntryNutrients = ({
  food,
  mealEntry,
}: {
  readonly food: Food | undefined;
  readonly mealEntry: MealEntry;
}): OneOffNutrients => {
  if (mealEntry.kind === "one-off") return mealEntry.nutrients;
  const values =
    food === undefined
      ? undefined
      : calculateEntryNutrients({
          food,
          nutritionMultiplier: mealEntry.nutritionMultiplier,
        });
  const nutrient = (name: NutrientName): NutrientValue => {
    const value = values?.[name];
    return value === undefined
      ? { _tag: "Unknown" }
      : {
          _tag:
            mealEntry.quantityAccuracy === "estimated"
              ? "Estimated"
              : "Recorded",
          value,
        };
  };
  return {
    energyKcal: nutrient("energyKcal"),
    proteinGrams: nutrient("proteinGrams"),
    carbsGrams: nutrient("carbsGrams"),
    fatGrams: nutrient("fatGrams"),
    fiberGrams: nutrient("fiberGrams"),
    sugarGrams: nutrient("sugarGrams"),
    saturatedFatGrams: nutrient("saturatedFatGrams"),
    saltGrams: nutrient("saltGrams"),
  };
};

export const calculateNutrientBreakdown = (
  entries: readonly OneOffNutrients[]
): MealEntriesNutrientTotals => {
  let recorded = emptyNutrientTotals();
  let estimated = emptyNutrientTotals();
  const coverage = emptyNutrientCoverage();
  const estimatedCoverage = emptyNutrientCoverage();
  const missing = emptyNutrientCoverage();
  for (const entry of entries) {
    for (const name of NutrientNames) {
      const nutrient = entry[name];
      if (nutrient._tag === "Unknown") {
        missing[name]++;
        continue;
      }
      coverage[name]++;
      if (nutrient._tag === "Estimated") {
        estimated = { ...estimated, [name]: estimated[name] + nutrient.value };
        estimatedCoverage[name]++;
      } else {
        recorded = { ...recorded, [name]: recorded[name] + nutrient.value };
      }
    }
  }
  return {
    recorded,
    estimated,
    estimatedCoverage,
    missing,
    coverage,
    entriesCount: entries.length,
    totals: addNutrientTotals({ left: recorded, right: estimated }),
  };
};

export const calculateMealEntriesNutrientTotals = ({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): MealEntriesNutrientTotals =>
  calculateNutrientBreakdown(
    mealEntries.map((mealEntry) =>
      resolveMealEntryNutrients({
        mealEntry,
        food:
          mealEntry.kind === "catalog"
            ? foods.find((food) => food.id === mealEntry.foodId)
            : undefined,
      })
    )
  );

export const calculateEntriesWeightTotals = ({
  entries,
}: {
  readonly entries: readonly {
    readonly food: Food;
    readonly quantity: LoggedFoodQuantity;
  }[];
}): EntriesWeightTotals =>
  entries.reduce<EntriesWeightTotals>(
    (totals, entry) => {
      const quantityGrams = massGramsFromQuantity({
        food: entry.food,
        quantity: entry.quantity,
      });

      return {
        entriesCount: totals.entriesCount + 1,
        quantityGrams: totals.quantityGrams + (quantityGrams ?? 0),
        resolvedEntriesCount:
          totals.resolvedEntriesCount + (quantityGrams === undefined ? 0 : 1),
      };
    },
    {
      entriesCount: 0,
      quantityGrams: 0,
      resolvedEntriesCount: 0,
    }
  );

export const calculateMealEntriesWeightTotals = ({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): EntriesWeightTotals => ({
  ...calculateEntriesWeightTotals({
    entries: mealEntries.filter(isCatalogMealEntry).flatMap((entry) => {
      const food = foods.find((food) => food.id === entry.foodId);
      return food === undefined || entry.quantityAccuracy === "estimated"
        ? []
        : [{ food, quantity: entry.quantity }];
    }),
  }),
  entriesCount: mealEntries.length,
});

export const calculateCaloriesPerGram = ({
  energyKcal,
  quantityGrams,
}: {
  readonly energyKcal: number;
  readonly quantityGrams: number;
}): number | null =>
  quantityGrams <= 0 || energyKcal <= 0 ? null : energyKcal / quantityGrams;

export const calculateGramsPerCalorie = ({
  energyKcal,
  quantityGrams,
}: {
  readonly energyKcal: number;
  readonly quantityGrams: number;
}): number | null =>
  quantityGrams <= 0 || energyKcal <= 0 ? null : quantityGrams / energyKcal;

export const makeNutrientTarget = ({
  amount,
  nutrientName,
  toleranceFraction = TargetOverageToleranceFraction,
  semantics = NutrientTargetSemanticsByName[nutrientName],
}: {
  readonly amount: number;
  readonly nutrientName: NutrientName;
  readonly toleranceFraction?: number;
  readonly semantics?: NutrientTargetSemantics;
}): NutrientTarget => {
  const safeToleranceFraction = Math.max(0, toleranceFraction);
  const targetBySemantics = {
    maximum: {
      amount,
      lowerBound: undefined,
      nutrientName,
      semantics,
      upperBound: amount,
    },
    minimum: {
      amount,
      lowerBound: amount,
      nutrientName,
      semantics,
      upperBound: amount * (1 + safeToleranceFraction),
    },
  } satisfies Record<NutrientTargetSemantics, NutrientTarget>;

  return targetBySemantics[semantics];
};

export const getPlanNutrientTargetAmount = ({
  nutrientName,
  plan,
}: {
  readonly nutrientName: NutrientName;
  readonly plan: Plan;
}): number | undefined => {
  const targetAmountByNutrient = {
    carbsGrams: plan.carbsTargetGrams,
    energyKcal: calculatePlanEnergyKcal({ plan }),
    fatGrams: plan.fatTargetGrams,
    fiberGrams: plan.fiberTargetGrams,
    proteinGrams: plan.proteinTargetGrams,
    saltGrams: plan.saltTargetGrams,
    saturatedFatGrams: plan.saturatedFatTargetGrams,
    sugarGrams: plan.sugarTargetGrams,
  } satisfies Record<NutrientName, number | undefined>;

  return targetAmountByNutrient[nutrientName];
};

export const getPlanNutrientTarget = ({
  nutrientName,
  plan,
}: {
  readonly nutrientName: NutrientName;
  readonly plan: Plan;
}): NutrientTarget | undefined => {
  const amount = getPlanNutrientTargetAmount({ nutrientName, plan });

  return amount === undefined
    ? undefined
    : makeNutrientTarget({
        amount,
        nutrientName,
        semantics: plan.targetRules[nutrientName],
      });
};

export const getPlanNutrientTargets = ({
  plan,
}: {
  readonly plan: Plan;
}): readonly NutrientTarget[] =>
  NutrientNames.flatMap((nutrientName) => {
    const target = getPlanNutrientTarget({ nutrientName, plan });

    return target === undefined ? [] : [target];
  });

export const evaluateNutrientTarget = ({
  target,
  value,
}: {
  readonly target: NutrientTarget;
  readonly value: number;
}): NutrientTargetStatus => {
  const status = (() => {
    if (target.lowerBound !== undefined && value < target.lowerBound) {
      return "below";
    }

    if (target.upperBound !== undefined && value > target.upperBound) {
      return "above";
    }

    return "inside";
  })();

  return {
    ...target,
    deltaFromTarget: value - target.amount,
    percentOfTarget: target.amount > 0 ? (value / target.amount) * 100 : null,
    status,
    value,
  };
};

export function remainingNutrientTargetAmount({
  target,
  value,
}: {
  readonly target: NutrientTarget;
  readonly value: number;
}): number {
  const remaining = target.amount - value;
  return remaining;
}

export const evaluatePlanNutrientTargets = ({
  plan,
  totals,
}: {
  readonly plan: Plan;
  readonly totals: NutrientTotals;
}): readonly NutrientTargetStatus[] =>
  getPlanNutrientTargets({ plan }).map((target) =>
    evaluateNutrientTarget({
      target,
      value: getNutrientTotal({ nutrientName: target.nutrientName, totals }),
    })
  );

export const isInsideExpectedNutrientRange = ({
  status,
}: {
  readonly status: NutrientTargetStatus;
}): boolean => status.status === "inside";

export const isInsideExpectedPlanRange = ({
  statuses,
}: {
  readonly statuses: readonly NutrientTargetStatus[];
}): boolean =>
  Array.isReadonlyArrayNonEmpty(statuses) &&
  statuses.every((status) => isInsideExpectedNutrientRange({ status }));
