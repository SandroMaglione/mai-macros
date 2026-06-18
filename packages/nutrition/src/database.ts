import {
  IndexedDb,
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer, Schema } from "effect";

import {
  ActiveMealPlanSelection,
  DailyLog,
  Food,
  MealEntry,
  Plan,
} from "./domain.ts";

export const DatabaseName = "mai";

export class FoodsTable extends IndexedDbTable.make({
  name: "foods",
  schema: Food,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

export class PlansTable extends IndexedDbTable.make({
  name: "plans",
  schema: Plan,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

export class DailyLogsTable extends IndexedDbTable.make({
  name: "dailyLogs",
  schema: DailyLog,
  keyPath: "dateKey",
  indexes: {
    byPlan: "planId",
  },
}) {}

export class ActiveMealPlanSelectionsTable extends IndexedDbTable.make({
  name: "activeMealPlanSelections",
  schema: ActiveMealPlanSelection,
  keyPath: "id",
}) {}

export class MealEntriesTable extends IndexedDbTable.make({
  name: "mealEntries",
  schema: MealEntry,
  keyPath: "id",
  indexes: {
    byDate: "dateKey",
    byDateMeal: ["dateKey", "meal"],
    byFood: "foodId",
  },
}) {}

export class MaiVersion1 extends IndexedDbVersion.make(
  FoodsTable,
  PlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  MealEntriesTable
) {}

export class MaiVersion2 extends IndexedDbVersion.make(
  FoodsTable,
  PlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  MealEntriesTable
) {}

export class MaiDatabase extends IndexedDbDatabase.make(
  MaiVersion1,
  Effect.fn(function* (api) {
    yield* api.createObjectStore("foods");
    yield* api.createIndex("foods", "byName");
    yield* api.createObjectStore("plans");
    yield* api.createIndex("plans", "byName");
    yield* api.createObjectStore("dailyLogs");
    yield* api.createIndex("dailyLogs", "byPlan");
    yield* api.createObjectStore("activeMealPlanSelections");
    yield* api.createObjectStore("mealEntries");
    yield* api.createIndex("mealEntries", "byDate");
    yield* api.createIndex("mealEntries", "byDateMeal");
    yield* api.createIndex("mealEntries", "byFood");
  })
).add(
  MaiVersion2,
  Effect.fn(function* (from, to) {
    const plans = yield* from.from("plans").select();
    const usedNames: string[] = [];
    const renamedPlans = yield* Effect.forEach(plans, (plan) =>
      Effect.gen(function* () {
        const baseName = plan.name.trim() === "" ? "Plan" : plan.name.trim();
        let index = 0;
        let name = baseName;

        while (usedNames.includes(name)) {
          index += 1;
          name = `${baseName} (${index})`;
        }

        usedNames.push(name);

        const encodedPlan = yield* Schema.encodeEffect(Plan)(plan);

        return yield* Schema.decodeEffect(Plan)({
          ...encodedPlan,
          name,
        });
      })
    );

    yield* from.deleteIndex("plans", "byName");
    yield* to.from("plans").upsertAll(renamedPlans);
    yield* to.createIndex("plans", "byName", { unique: true });
  })
) {}

export const BrowserDatabaseLayer = MaiDatabase.layer(DatabaseName).pipe(
  Layer.provide(IndexedDb.layerWindow)
);
