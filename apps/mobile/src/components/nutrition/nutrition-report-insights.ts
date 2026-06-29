import { NutritionReports, Reporting, type Domain } from "@mai/nutrition";

export type NutritionReportInsightKind =
  | "diet-concentration"
  | "food-contribution"
  | "food-volume"
  | "meal-imbalance"
  | "nutrient-concentration"
  | "repeated-food";

export type NutritionReportInsightPart = {
  readonly text: string;
  readonly tone: "food" | "meal" | "text";
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
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

type MealInsightContributor = {
  readonly mealId: Domain.MealId;
  readonly mealLabel: string;
  readonly quantityGrams: number;
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
  const totalQuantityGrams = report.days.reduce(
    (rangeTotal, day) =>
      rangeTotal +
      day.entries.reduce(
        (dayTotal, entry) => dayTotal + entry.mealEntry.quantityGrams,
        0
      ),
    0
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
                quantityGrams: 0,
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
                quantityGrams:
                  current.quantityGrams + entry.mealEntry.quantityGrams,
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
                quantityGrams: 0,
                totals: Reporting.emptyNutrientTotals(),
              } satisfies MealInsightContributor);

            return {
              ...nextContributors,
              [mealId]: {
                ...current,
                quantityGrams:
                  current.quantityGrams + entry.mealEntry.quantityGrams,
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
  const dayVolumeContributors = report.days.map(
    (
      day
    ): {
      readonly dateKey: Domain.DateKey;
      readonly energyKcal: number;
      readonly quantityGrams: number;
    } => ({
      dateKey: day.dateKey,
      energyKcal: day.totals.energyKcal,
      quantityGrams: day.entries.reduce(
        (total, entry) => total + entry.mealEntry.quantityGrams,
        0
      ),
    })
  );
  const formatPercent = ({ share }: { readonly share: number }) =>
    `${Math.round(share * 100)}%`;
  const formatWeight = ({
    quantityGrams,
  }: {
    readonly quantityGrams: number;
  }) => `${Math.round(quantityGrams)}g`;
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
                { text: " appeared at ", tone: "text" },
                {
                  text: mealLabel({ mealId }).toLocaleLowerCase(),
                  tone: "meal",
                },
                {
                  text: ` on ${mealDayFrequency} of ${dayCount} days.`,
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
  const foodVolumeInsights = sortedByScore({
    insights: [
      ...(() => {
        const topFood = foodContributors
          .filter((food) => food.quantityGrams > 0)
          .sort((left, right) => right.quantityGrams - left.quantityGrams)[0];

        if (totalQuantityGrams <= 0 || topFood === undefined) {
          return [];
        }

        const share = topFood.quantityGrams / totalQuantityGrams;

        if (share < 0.25) {
          return [];
        }

        return [
          {
            id: `food-volume-${topFood.foodId}`,
            kind: "food-volume",
            parts: [
              { text: topFood.name, tone: "food" },
              {
                text: ` made up ${formatPercent({
                  share,
                })} of your food weight.`,
                tone: "text",
              },
            ],
            score: share,
          } satisfies NutritionReportInsight,
        ];
      })(),
      ...dayVolumeContributors.flatMap((day, dayIndex) =>
        dayVolumeContributors.slice(dayIndex + 1).flatMap((otherDay) => {
          const higherEnergyKcal = Math.max(
            day.energyKcal,
            otherDay.energyKcal
          );
          const calorieDeltaShare =
            higherEnergyKcal <= 0
              ? 1
              : Math.abs(day.energyKcal - otherDay.energyKcal) /
                higherEnergyKcal;
          const higherVolumeDay =
            day.quantityGrams >= otherDay.quantityGrams ? day : otherDay;
          const lowerVolumeDay =
            day.quantityGrams >= otherDay.quantityGrams ? otherDay : day;

          if (calorieDeltaShare > 0.15 || lowerVolumeDay.quantityGrams <= 0) {
            return [];
          }

          const volumeRatio =
            higherVolumeDay.quantityGrams / lowerVolumeDay.quantityGrams;

          if (volumeRatio < 1.35) {
            return [];
          }

          return [
            {
              id: `food-volume-day-${higherVolumeDay.dateKey}-${lowerVolumeDay.dateKey}`,
              kind: "food-volume",
              parts: [
                {
                  text: `${higherVolumeDay.dateKey} had ${formatPercent({
                    share: volumeRatio - 1,
                  })} more food weight than ${lowerVolumeDay.dateKey} at similar calories.`,
                  tone: "text",
                },
              ],
              score: (volumeRatio - 1) * (1 - calorieDeltaShare),
            } satisfies NutritionReportInsight,
          ];
        })
      ),
      ...mealContributors.flatMap((meal) => {
        const otherMeals = mealContributors.filter(
          (otherMeal) => otherMeal.mealId !== meal.mealId
        );
        const otherTotals = otherMeals.reduce<{
          readonly energyKcal: number;
          readonly quantityGrams: number;
        }>(
          (totals, otherMeal) => ({
            energyKcal: totals.energyKcal + otherMeal.totals.energyKcal,
            quantityGrams: totals.quantityGrams + otherMeal.quantityGrams,
          }),
          {
            energyKcal: 0,
            quantityGrams: 0,
          }
        );
        const mealGramsPerCalorie = Reporting.calculateGramsPerCalorie({
          energyKcal: meal.totals.energyKcal,
          quantityGrams: meal.quantityGrams,
        });
        const otherGramsPerCalorie = Reporting.calculateGramsPerCalorie({
          energyKcal: otherTotals.energyKcal,
          quantityGrams: otherTotals.quantityGrams,
        });
        const calorieShare =
          totals.energyKcal <= 0
            ? 0
            : meal.totals.energyKcal / totals.energyKcal;

        if (
          calorieShare < 0.1 ||
          mealGramsPerCalorie === null ||
          otherGramsPerCalorie === null
        ) {
          return [];
        }

        const highVolume = mealGramsPerCalorie >= otherGramsPerCalorie * 1.35;
        const lowVolume = mealGramsPerCalorie <= otherGramsPerCalorie * 0.65;

        if (!highVolume && !lowVolume) {
          return [];
        }

        return [
          {
            id: `food-volume-meal-${meal.mealId}`,
            kind: "food-volume",
            parts: [
              { text: meal.mealLabel, tone: "meal" },
              {
                text: ` was ${
                  highVolume ? "higher" : "lower"
                }-volume per calorie than your other meals (${formatWeight({
                  quantityGrams: meal.quantityGrams,
                })}).`,
                tone: "text",
              },
            ],
            score: highVolume
              ? mealGramsPerCalorie / otherGramsPerCalorie - 1
              : otherGramsPerCalorie / mealGramsPerCalorie - 1,
          } satisfies NutritionReportInsight,
        ];
      }),
    ],
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
              { text: meal.mealLabel, tone: "meal" },
              {
                text: ` made up ${formatPercent({
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
              { text: meal.mealLabel, tone: "meal" },
              {
                text: " had much less protein per calorie than your other meals.",
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
    ...foodVolumeInsights.slice(0, 1),
    ...dietConcentrationInsights.slice(0, 1),
    ...mealImbalanceInsights.slice(0, 1),
  ].slice(0, limit);
  const allCandidates = [
    ...foodContributionInsights,
    ...nutrientConcentrationInsights,
    ...repeatedFoodInsights,
    ...foodVolumeInsights,
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
