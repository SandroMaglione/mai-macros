import { NutritionReports, Reporting, type Domain } from "@mai/nutrition";

export type NutritionReportInsightKind =
  | "diet-concentration"
  | "food-contribution"
  | "meal-imbalance"
  | "nutrient-concentration"
  | "repeated-food";

export type NutritionReportInsightPart = {
  readonly text: string;
  readonly tone: "food" | "text";
};

export type NutritionReportInsight = {
  readonly id: string;
  readonly kind: NutritionReportInsightKind;
  readonly parts: readonly NutritionReportInsightPart[];
  readonly score: number;
};

type FoodInsightContributor = {
  readonly daysByDateKey: Record<string, true>;
  readonly foodId: Domain.Food["id"];
  readonly mealsByName: Record<string, Record<string, true>>;
  readonly name: string;
  readonly totals: Reporting.NutrientTotals;
};

type MealInsightContributor = {
  readonly mealId: Domain.MealId;
  readonly mealLabel: string;
  readonly totals: Reporting.NutrientTotals;
};

const insightNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const satisfies readonly Reporting.NutrientName[];

const nutrientInsightLabels = {
  carbsGrams: "carbs",
  energyKcal: "calories",
  fatGrams: "fat",
  fiberGrams: "fiber",
  proteinGrams: "protein",
  saltGrams: "salt",
  saturatedFatGrams: "saturated fat",
  sugarGrams: "sugar",
} satisfies Record<Reporting.NutrientName, string>;

export function getNutritionReportInsights({
  limit,
  report,
}: {
  readonly limit: number;
  readonly report: NutritionReports.NutritionReportRange;
}): readonly NutritionReportInsight[] {
  const dayCount = report.days.length;
  const totals = report.days.reduce<Reporting.NutrientTotals>(
    (currentTotals, day) =>
      Reporting.addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    Reporting.emptyNutrientTotals()
  );
  const getEntryTotals = ({
    entry,
  }: {
    readonly entry: NutritionReports.NutritionReportRange["days"][number]["entries"][number];
  }): Reporting.NutrientTotals => ({
    carbsGrams: entry.nutrients.carbsGrams,
    energyKcal: entry.nutrients.energyKcal,
    fatGrams: entry.nutrients.fatGrams,
    fiberGrams: entry.nutrients.fiberGrams ?? 0,
    proteinGrams: entry.nutrients.proteinGrams,
    saltGrams: entry.nutrients.saltGrams ?? 0,
    saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
    sugarGrams: entry.nutrients.sugarGrams ?? 0,
  });
  const mealLabelsById = report.days.reduce<Record<string, string>>(
    (labels, day) =>
      day.plan.meals.reduce<Record<string, string>>(
        (nextLabels, meal) => ({
          ...nextLabels,
          [meal.id]: meal.name,
        }),
        labels
      ),
    {}
  );
  const mealLabel = ({ mealId }: { readonly mealId: string }) =>
    mealLabelsById[mealId] ?? "Meal";
  const foodContributors = Object.values(
    report.days.reduce<Record<string, FoodInsightContributor>>(
      (contributors, day) =>
        day.entries.reduce<Record<string, FoodInsightContributor>>(
          (nextContributors, entry) => {
            const mealId = entry.mealEntry.mealId;
            const current =
              nextContributors[entry.food.id] ??
              ({
                daysByDateKey: {},
                foodId: entry.food.id,
                mealsByName: {},
                name: entry.food.name,
                totals: Reporting.emptyNutrientTotals(),
              } satisfies FoodInsightContributor);

            return {
              ...nextContributors,
              [entry.food.id]: {
                ...current,
                daysByDateKey: {
                  ...current.daysByDateKey,
                  [day.dateKey]: true,
                },
                mealsByName: {
                  ...current.mealsByName,
                  [mealId]: {
                    ...current.mealsByName[mealId],
                    [day.dateKey]: true,
                  },
                },
                totals: Reporting.addNutrientTotals({
                  left: current.totals,
                  right: getEntryTotals({ entry }),
                }),
              },
            };
          },
          contributors
        ),
      {}
    )
  );
  const mealContributors = Object.values(
    report.days.reduce<Record<string, MealInsightContributor>>(
      (contributors, day) =>
        day.entries.reduce<Record<string, MealInsightContributor>>(
          (nextContributors, entry) => {
            const mealId = entry.mealEntry.mealId;
            const current =
              nextContributors[mealId] ??
              ({
                mealId,
                mealLabel: mealLabel({ mealId }),
                totals: Reporting.emptyNutrientTotals(),
              } satisfies MealInsightContributor);

            return {
              ...nextContributors,
              [mealId]: {
                ...current,
                totals: Reporting.addNutrientTotals({
                  left: current.totals,
                  right: getEntryTotals({ entry }),
                }),
              },
            };
          },
          contributors
        ),
      {}
    )
  );
  const formatPercent = ({ share }: { readonly share: number }) =>
    `${Math.round(share * 100)}%`;
  const sortedByScore = ({
    insights,
  }: {
    readonly insights: readonly NutritionReportInsight[];
  }) => [...insights].sort((left, right) => right.score - left.score);
  const foodContributionInsights = sortedByScore({
    insights: insightNutrients.flatMap((nutrientName) => {
      const total = totals[nutrientName];
      const topFood = foodContributors
        .filter((food) => food.totals[nutrientName] > 0)
        .sort(
          (left, right) =>
            right.totals[nutrientName] - left.totals[nutrientName]
        )[0];

      if (total <= 0 || topFood === undefined) {
        return [];
      }

      const share = topFood.totals[nutrientName] / total;
      const threshold = nutrientName === "energyKcal" ? 0.2 : 0.25;

      if (share < threshold) {
        return [];
      }

      return [
        {
          id: `food-contribution-${nutrientName}-${topFood.foodId}`,
          kind: "food-contribution",
          parts: [
            { text: topFood.name, tone: "food" },
            {
              text: ` contributed ${formatPercent({
                share,
              })} of your ${nutrientInsightLabels[nutrientName]}.`,
              tone: "text",
            },
          ],
          score: share,
        } satisfies NutritionReportInsight,
      ];
    }),
  });
  const nutrientConcentrationInsights = sortedByScore({
    insights: insightNutrients.flatMap((nutrientName) => {
      const total = totals[nutrientName];
      const topFoods = foodContributors
        .filter((food) => food.totals[nutrientName] > 0)
        .sort(
          (left, right) =>
            right.totals[nutrientName] - left.totals[nutrientName]
        )
        .slice(0, 2);
      const firstFood = topFoods[0];
      const secondFood = topFoods[1];

      if (total <= 0 || firstFood === undefined || secondFood === undefined) {
        return [];
      }

      const share =
        (firstFood.totals[nutrientName] + secondFood.totals[nutrientName]) /
        total;

      if (share < 0.5) {
        return [];
      }

      return [
        {
          id: `nutrient-concentration-${nutrientName}`,
          kind: "nutrient-concentration",
          parts: [
            {
              text: `Most of your ${nutrientInsightLabels[nutrientName]} came from `,
              tone: "text",
            },
            { text: firstFood.name, tone: "food" },
            { text: " and ", tone: "text" },
            { text: secondFood.name, tone: "food" },
            {
              text: ` (${formatPercent({ share })}).`,
              tone: "text",
            },
          ],
          score: share,
        } satisfies NutritionReportInsight,
      ];
    }),
  });
  const repeatedFoodThreshold = Math.max(3, Math.ceil(dayCount * 0.7));
  const repeatedFoodInsights = sortedByScore({
    insights: foodContributors.flatMap((food) => {
      const dayFrequency = Object.keys(food.daysByDateKey).length;
      const mealFrequencyInsights = Object.entries(food.mealsByName).flatMap(
        ([mealId, daysByDateKey]) => {
          const mealDayFrequency = Object.keys(daysByDateKey).length;

          if (mealDayFrequency < repeatedFoodThreshold) {
            return [];
          }

          return [
            {
              id: `repeated-food-${food.foodId}-${mealId}`,
              kind: "repeated-food",
              parts: [
                { text: food.name, tone: "food" },
                {
                  text: ` appeared at ${mealLabel({
                    mealId,
                  }).toLocaleLowerCase()} on ${mealDayFrequency} of ${dayCount} days.`,
                  tone: "text",
                },
              ],
              score: mealDayFrequency / dayCount + 0.05,
            } satisfies NutritionReportInsight,
          ];
        }
      );

      if (dayFrequency < repeatedFoodThreshold) {
        return mealFrequencyInsights;
      }

      return [
        ...mealFrequencyInsights,
        {
          id: `repeated-food-${food.foodId}`,
          kind: "repeated-food",
          parts: [
            { text: food.name, tone: "food" },
            {
              text: ` appeared on ${dayFrequency} of ${dayCount} days.`,
              tone: "text",
            },
          ],
          score: dayFrequency / dayCount,
        } satisfies NutritionReportInsight,
      ];
    }),
  });
  const dietConcentrationInsights = sortedByScore({
    insights: (() => {
      const calorieFoods = foodContributors
        .filter((food) => food.totals.energyKcal > 0)
        .sort(
          (left, right) => right.totals.energyKcal - left.totals.energyKcal
        );

      if (totals.energyKcal <= 0 || calorieFoods.length < 5) {
        return [];
      }

      const topFoodCount = 5;
      const share =
        calorieFoods
          .slice(0, topFoodCount)
          .reduce((total, food) => total + food.totals.energyKcal, 0) /
        totals.energyKcal;

      if (share < 0.6) {
        return [];
      }

      return [
        {
          id: "diet-concentration-calories",
          kind: "diet-concentration",
          parts: [
            {
              text: `Your top ${topFoodCount} foods made up ${formatPercent({
                share,
              })} of weekly calories.`,
              tone: "text",
            },
          ],
          score: share,
        } satisfies NutritionReportInsight,
      ];
    })(),
  });
  const mealImbalanceInsights = sortedByScore({
    insights: [
      ...mealContributors.flatMap((meal) => {
        if (totals.energyKcal <= 0 || meal.totals.energyKcal <= 0) {
          return [];
        }

        const share = meal.totals.energyKcal / totals.energyKcal;

        if (share < 0.45) {
          return [];
        }

        return [
          {
            id: `meal-calories-${meal.mealId}`,
            kind: "meal-imbalance",
            parts: [
              {
                text: `${meal.mealLabel} made up ${formatPercent({
                  share,
                })} of your weekly calories.`,
                tone: "text",
              },
            ],
            score: share,
          } satisfies NutritionReportInsight,
        ];
      }),
      ...mealContributors.flatMap((meal) => {
        const otherMeals = mealContributors.filter(
          (otherMeal) => otherMeal.mealId !== meal.mealId
        );
        const otherTotals = otherMeals.reduce<Reporting.NutrientTotals>(
          (currentTotals, otherMeal) =>
            Reporting.addNutrientTotals({
              left: currentTotals,
              right: otherMeal.totals,
            }),
          Reporting.emptyNutrientTotals()
        );
        const mealProteinDensity =
          meal.totals.energyKcal <= 0
            ? 0
            : meal.totals.proteinGrams / meal.totals.energyKcal;
        const otherProteinDensity =
          otherTotals.energyKcal <= 0
            ? 0
            : otherTotals.proteinGrams / otherTotals.energyKcal;
        const calorieShare =
          totals.energyKcal <= 0
            ? 0
            : meal.totals.energyKcal / totals.energyKcal;

        if (
          calorieShare < 0.1 ||
          otherProteinDensity <= 0 ||
          mealProteinDensity >= otherProteinDensity * 0.65
        ) {
          return [];
        }

        return [
          {
            id: `meal-protein-density-${meal.mealId}`,
            kind: "meal-imbalance",
            parts: [
              {
                text: `${meal.mealLabel} had much less protein per calorie than your other meals.`,
                tone: "text",
              },
            ],
            score:
              (otherProteinDensity - mealProteinDensity) / otherProteinDensity,
          } satisfies NutritionReportInsight,
        ];
      }),
    ],
  });
  const selectedByPriority = [
    ...foodContributionInsights.slice(0, 2),
    ...nutrientConcentrationInsights.slice(0, 1),
    ...repeatedFoodInsights.slice(0, 1),
    ...dietConcentrationInsights.slice(0, 1),
    ...mealImbalanceInsights.slice(0, 1),
  ].slice(0, limit);
  const allCandidates = [
    ...foodContributionInsights,
    ...nutrientConcentrationInsights,
    ...repeatedFoodInsights,
    ...dietConcentrationInsights,
    ...mealImbalanceInsights,
  ];

  return allCandidates.reduce<readonly NutritionReportInsight[]>(
    (insights, candidate) => {
      if (
        insights.length >= limit ||
        insights.some((insight) => insight.id === candidate.id)
      ) {
        return insights;
      }

      return [...insights, candidate];
    },
    selectedByPriority
  );
}
