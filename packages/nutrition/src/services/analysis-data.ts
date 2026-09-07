import { Array, DateTime, Effect, HashMap, Option, Schema } from "effect";
import { DateKey } from "../domain.ts";
import {
  NutrientNames,
  getPlanNutrientTargets,
  resolveMealEntryNutrients,
  calculateNutrientBreakdown,
} from "../reporting.ts";
import { MaiBackupStores, validateBackup, type MaiBackup } from "./backup.ts";
import * as Analysis from "./analysis-schema.ts";
import { AnalysisExportError } from "./analysis-documentation.ts";

const json = Schema.fromJsonString(Schema.Unknown);

export const buildAnalysisData = Effect.fn("buildAnalysisData")(function* (
  backup: MaiBackup
) {
  yield* validateBackup({ backup });
  const stores = backup.stores;
  const encoded = yield* Schema.encodeEffect(MaiBackupStores)(stores);
  const source_records: (typeof Analysis.SourceRecord.Encoded)[] = [];
  for (const [collection, records] of Object.entries(encoded)) {
    for (const [recordIndex, record] of records.entries()) {
      source_records.push({
        collection,
        recordIndex,
        recordJson: yield* Schema.encodeEffect(json)(record),
      });
    }
  }
  const foods = HashMap.fromIterable(
    stores.foods.map((food) => [food.id, food] as const)
  );
  const meals = HashMap.fromIterable(
    stores.plans.flatMap((plan) =>
      plan.meals.map((meal) => [meal.id, meal] as const)
    )
  );
  const logs = HashMap.fromIterable(
    stores.dailyLogs.map((day) => [day.dateKey, day] as const)
  );
  const entries: (typeof Analysis.Entry.Encoded)[] = [];
  const entry_nutrients: (typeof Analysis.EntryNutrient.Encoded)[] = [];
  let resolvedByDay = HashMap.empty<
    string,
    ReturnType<typeof resolveMealEntryNutrients>[]
  >();
  for (const entry of [...stores.mealEntries].sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id)
  )) {
    const food =
      entry.kind === "catalog"
        ? Option.getOrUndefined(HashMap.get(foods, entry.foodId))
        : undefined;
    const nutrients = resolveMealEntryNutrients({ food, mealEntry: entry });
    const dayEntries =
      Option.getOrUndefined(HashMap.get(resolvedByDay, entry.dateKey)) ?? [];
    dayEntries.push(nutrients);
    resolvedByDay = HashMap.set(resolvedByDay, entry.dateKey, dayEntries);
    const quantity = entry.kind === "catalog" ? entry.quantity : undefined;
    entries.push({
      id: entry.id,
      date: entry.dateKey,
      mealId: entry.mealId,
      mealName:
        Option.getOrUndefined(HashMap.get(meals, entry.mealId))?.name ?? "",
      foodId: entry.kind === "catalog" ? entry.foodId : null,
      foodName: entry.kind === "one-off" ? entry.name : (food?.name ?? ""),
      kind: entry.kind,
      amountDescription:
        entry.kind === "one-off"
          ? entry.amountDescription
          : quantity?._tag === "MeasuredFoodQuantity"
            ? `${quantity.amount} ${quantity.unit}`
            : quantity?._tag === "PortionFoodQuantity"
              ? `${quantity.count} × ${quantity.portionName}`
              : "",
      quantityJson:
        quantity === undefined
          ? null
          : yield* Schema.encodeEffect(json)(quantity),
      quantityAccuracy:
        entry.kind === "catalog" ? entry.quantityAccuracy : null,
      note: entry.kind === "one-off" ? entry.note : "",
      createdAt: DateTime.toEpochMillis(entry.createdAt),
      updatedAt: DateTime.toEpochMillis(entry.updatedAt),
    });
    for (const nutrient of NutrientNames) {
      const value = nutrients[nutrient];
      entry_nutrients.push({
        entryId: entry.id,
        nutrient,
        value: value._tag === "Unknown" ? null : value.value,
        status:
          value._tag === "Unknown"
            ? "unknown"
            : value._tag === "Estimated"
              ? "estimated"
              : "recorded",
      });
    }
  }
  const observedDates = Array.dedupe([
    ...stores.dailyLogs.map((day) => day.dateKey),
    ...stores.mealEntries.map((entry) => entry.dateKey),
    ...stores.bodyWeightEntries.map((weight) => weight.dateKey),
    ...stores.recordedEvents.map((event) => event.dateKey),
  ]).sort();
  const days: (typeof Analysis.Day.Encoded)[] = [];
  const daily_nutrients: (typeof Analysis.DailyNutrient.Encoded)[] = [];
  for (const date of observedDates) {
    const parsed = yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(
      `${date}T00:00:00.000Z`
    );
    if (DateTime.formatIsoDateUtc(parsed) !== date)
      return yield* new AnalysisExportError({
        detail: `The diary contains an invalid calendar date: ${date}.`,
      });
  }
  if (Array.isArrayNonEmpty(observedDates)) {
    let current = yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(
      `${observedDates[0]}T00:00:00.000Z`
    );
    const end = Array.lastNonEmpty(observedDates);
    while (DateTime.formatIsoDateUtc(current) <= end) {
      const date = yield* Schema.decodeEffect(DateKey)(
        DateTime.formatIsoDateUtc(current)
      );
      const day = Option.getOrUndefined(HashMap.get(logs, date));
      const resolved =
        Option.getOrUndefined(HashMap.get(resolvedByDay, date)) ?? [];
      const totals = calculateNutrientBreakdown(resolved);
      days.push({
        date,
        loggingStatus: day?.mode ?? "absent",
        planId: day?.planId ?? null,
        waterMl:
          day?.waterServings === null || day?.waterServings === undefined
            ? null
            : day.waterServings * 250,
        entryCount: resolved.length,
      });
      for (const nutrient of NutrientNames) {
        daily_nutrients.push({
          date,
          nutrient,
          knownTotal:
            totals.coverage[nutrient] === 0
              ? null
              : totals.recorded[nutrient] + totals.estimated[nutrient],
          recordedTotal: totals.recorded[nutrient],
          estimatedTotal: totals.estimated[nutrient],
          recordedEntryCount:
            totals.coverage[nutrient] - totals.estimatedCoverage[nutrient],
          estimatedEntryCount: totals.estimatedCoverage[nutrient],
          missingEntryCount: totals.missing[nutrient],
        });
      }
      current = DateTime.add(current, { days: 1 });
    }
  }
  return yield* Schema.decodeEffect(Analysis.AnalysisData)({
    source_records,
    entries,
    entry_nutrients,
    days,
    daily_nutrients,
    nutrients: NutrientNames.map((code) => ({
      code,
      unit: code === "energyKcal" ? "kcal" : "g",
    })),
    foods: stores.foods.map((food) => ({
      id: food.id,
      name: food.name,
      brand: food.brand ?? null,
      category: food.category ?? null,
      referenceAmount: food.nutritionReference.amount,
      referenceUnit: food.nutritionReference.unit,
    })),
    plans: stores.plans.map((plan) => ({ id: plan.id, name: plan.name })),
    meals: stores.plans.flatMap((plan) =>
      plan.meals.map((meal) => ({
        id: meal.id,
        planId: plan.id,
        name: meal.name,
        position: meal.position,
      }))
    ),
    plan_targets: stores.plans.flatMap((plan) =>
      getPlanNutrientTargets({ plan }).map((target) => ({
        planId: plan.id,
        nutrient: target.nutrientName,
        amount: target.amount,
        semantics: target.semantics,
        lowerBound: target.lowerBound ?? null,
        upperBound: target.upperBound ?? null,
      }))
    ),
    body_weights: stores.bodyWeightEntries.map((weight) => ({
      date: weight.dateKey,
      kilograms: weight.weightKilograms,
      createdAt: DateTime.toEpochMillis(weight.createdAt),
      updatedAt: DateTime.toEpochMillis(weight.updatedAt),
    })),
    event_types: stores.recordableEvents.map((event) => ({
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      archivedAt:
        event.archivedAt === undefined
          ? null
          : DateTime.toEpochMillis(event.archivedAt),
    })),
    recorded_events: stores.recordedEvents.map((event) => ({
      id: event.id,
      eventTypeId: event.recordableEventId,
      date: event.dateKey,
      occurredAt:
        event.occurredAt === undefined
          ? null
          : DateTime.toEpochMillis(event.occurredAt),
      createdAt: DateTime.toEpochMillis(event.createdAt),
      updatedAt: DateTime.toEpochMillis(event.updatedAt),
    })),
  });
});
