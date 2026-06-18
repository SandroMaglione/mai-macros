import {
  IndexedDb,
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer } from "effect";

import { DailyLog, Food, MealEntry, Plan } from "./domain.ts";

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
    yield* api.createObjectStore("mealEntries");
    yield* api.createIndex("mealEntries", "byDate");
    yield* api.createIndex("mealEntries", "byDateMeal");
    yield* api.createIndex("mealEntries", "byFood");
  })
) {}

export const BrowserDatabaseLayer = MaiDatabase.layer(DatabaseName).pipe(
  Layer.provide(IndexedDb.layerWindow)
);
