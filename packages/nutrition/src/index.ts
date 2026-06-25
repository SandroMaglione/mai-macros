import * as BackupService from "./services/backup.ts";
import * as DailyLogsService from "./services/daily-logs.ts";
import * as FoodCatalogTransferService from "./services/food-catalog-transfer.ts";
import * as FoodsService from "./services/foods.ts";
import * as LocalDataService from "./services/local-data.ts";
import * as MealEntriesService from "./services/meal-entries.ts";
import * as MealPlansService from "./services/meal-plans.ts";
import * as MigrationsService from "./migrations/index.ts";
import * as NutritionReportsService from "./services/nutrition-reports.ts";
import * as StoreService from "./services/store.ts";

export * as DefaultFoods from "./default-foods.ts";
export * as Domain from "./domain.ts";
export * as FoodQuickInput from "./food-quick-input.ts";
export * as Metadata from "./metadata.ts";
export * as Migrations from "./migrations/index.ts";
export * as Reporting from "./reporting.ts";
export * as Utils from "./utils.ts";
export {
  BackupService as Backup,
  DailyLogsService as DailyLogs,
  FoodCatalogTransferService as FoodCatalogTransfer,
  FoodsService as Foods,
  LocalDataService as LocalData,
  MealEntriesService as MealEntries,
  MealPlansService as MealPlans,
  NutritionReportsService as NutritionReports,
  StoreService as Store,
};

export const Service = {
  Backup: BackupService,
  DailyLogs: DailyLogsService,
  FoodCatalogTransfer: FoodCatalogTransferService,
  Foods: FoodsService,
  LocalData: LocalDataService,
  MealEntries: MealEntriesService,
  MealPlans: MealPlansService,
  Migrations: MigrationsService,
  NutritionReports: NutritionReportsService,
  Store: StoreService,
} as const;

export type Service = typeof Service;
