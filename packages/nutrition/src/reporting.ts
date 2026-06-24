import { Array } from "effect";

import type { Food, MealEntry, Plan, QuantityGrams } from "./domain.ts";
import { calculateEntryNutrients, calculatePlanEnergyKcal } from "./utils.ts";

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

export type NutrientTargetSemantics = "maximum" | "minimum" | "range";

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

export const NutrientTargetSemanticsByName = {
  carbsGrams: "range",
  energyKcal: "range",
  fatGrams: "range",
  fiberGrams: "minimum",
  proteinGrams: "minimum",
  saltGrams: "maximum",
  saturatedFatGrams: "maximum",
  sugarGrams: "maximum",
} satisfies Record<NutrientName, NutrientTargetSemantics>;

export const TargetRangeToleranceFraction = 0.1;

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
    readonly quantityGrams: QuantityGrams;
  }[];
}): EntriesNutrientTotals =>
  entries.reduce<EntriesNutrientTotals>(
    (aggregate, entry) => {
      const nutrients = calculateEntryNutrients({
        food: entry.food,
        quantityGrams: entry.quantityGrams,
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

export const calculateMealEntriesNutrientTotals = ({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): EntriesNutrientTotals =>
  calculateEntriesNutrientTotals({
    entries: mealEntries.flatMap((mealEntry) => {
      const food = foods.find((candidate) => candidate.id === mealEntry.foodId);

      return food === undefined
        ? []
        : [
            {
              food,
              quantityGrams: mealEntry.quantityGrams,
            },
          ];
    }),
  });

export const makeNutrientTarget = ({
  amount,
  nutrientName,
  toleranceFraction = TargetRangeToleranceFraction,
}: {
  readonly amount: number;
  readonly nutrientName: NutrientName;
  readonly toleranceFraction?: number;
}): NutrientTarget => {
  const semantics = NutrientTargetSemanticsByName[nutrientName];
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
      upperBound: undefined,
    },
    range: {
      amount,
      lowerBound: Math.max(0, amount * (1 - safeToleranceFraction)),
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
    : makeNutrientTarget({ amount, nutrientName });
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
