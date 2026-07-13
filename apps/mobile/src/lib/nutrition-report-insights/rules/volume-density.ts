import { Reporting } from "@mai/nutrition";

import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const volumeDensityInsightModule = {
  id: "volume-density",
  defaultSummaryLimit: 1,
  collect: (context) => {
    if (!context.weightCoverageComplete) {
      return [];
    }

    return sortedByScore({
      insights: [
        ...(() => {
          const topFood = context.foodContributors
            .filter((food) => food.quantityGrams > 0)
            .sort((left, right) => right.quantityGrams - left.quantityGrams)[0];

          if (context.totalQuantityGrams <= 0 || topFood === undefined) {
            return [];
          }

          const share = topFood.quantityGrams / context.totalQuantityGrams;

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
                  text: ` made up ${context.formatPercent({
                    share,
                  })} of your food weight.`,
                  tone: "text",
                },
              ],
              score: share,
            } satisfies NutritionReportInsight,
          ];
        })(),
        ...context.dayVolumeContributors.flatMap((day, dayIndex) =>
          context.dayVolumeContributors
            .slice(dayIndex + 1)
            .flatMap((otherDay) => {
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

              if (
                calorieDeltaShare > 0.15 ||
                lowerVolumeDay.quantityGrams <= 0
              ) {
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
                      text: `${context.formatDate({
                        dateKey: higherVolumeDay.dateKey,
                      })} had ${context.formatPercent({
                        share: volumeRatio - 1,
                      })} more food weight than ${context.formatDate({
                        dateKey: lowerVolumeDay.dateKey,
                      })} at similar calories.`,
                      tone: "text",
                    },
                  ],
                  score: (volumeRatio - 1) * (1 - calorieDeltaShare),
                } satisfies NutritionReportInsight,
              ];
            })
        ),
        ...context.mealContributors.flatMap((meal) => {
          const otherMeals = context.mealContributors.filter(
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
            context.totals.energyKcal <= 0
              ? 0
              : meal.totals.energyKcal / context.totals.energyKcal;

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
                  }-volume per calorie than your other meals (${context.formatWeight(
                    {
                      quantityGrams: meal.quantityGrams,
                    }
                  )}).`,
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
  },
} satisfies NutritionReportInsightModule;
