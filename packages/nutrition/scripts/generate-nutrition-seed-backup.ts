import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";

import { Backup, DefaultFoods, Migrations } from "../src/index.ts";

const CustomPlanMealsMigration = Migrations.Version004CustomPlanMeals;

type FoodKey = string;
type SeedFoodDefinition = readonly [
  foodKey: FoodKey,
  food: Omit<
    Backup.MaiBackupEncoded["stores"]["foods"][number],
    "createdAt" | "id" | "origin" | "updatedAt"
  >,
];
type MealSeedEntry = {
  readonly foodId: Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["foodId"];
  readonly quantityGrams: number;
};
type MealSeedTemplate = Record<
  (typeof CustomPlanMealsMigration.mealsBeforeCustomPlanMeals)[number],
  readonly MealSeedEntry[]
>;
type DaySeedTemplate = {
  readonly meals: MealSeedTemplate;
  readonly planId: Backup.MaiBackupEncoded["stores"]["plans"][number]["id"];
};
type NutrientTotals = {
  carbsGrams: number;
  energyKcal: number;
  fatGrams: number;
  proteinGrams: number;
};
type Summary = {
  readonly averageCarbsGrams: number;
  readonly averageEnergyKcal: number;
  readonly averageFatGrams: number;
  readonly averageProteinGrams: number;
  readonly firstDateKey: Backup.MaiBackupEncoded["stores"]["dailyLogs"][number]["dateKey"];
  readonly lastDateKey: Backup.MaiBackupEncoded["stores"]["dailyLogs"][number]["dateKey"];
};

const outputDefaultPath = fileURLToPath(
  new URL("../../../nutrition-seed-backup.json", import.meta.url)
);

const args = parseCliArgs({ values: process.argv.slice(2) });
const commandCwd = process.env.INIT_CWD ?? process.cwd();

const dayCount = 28;
const outputPath =
  args.output === undefined
    ? outputDefaultPath
    : resolve(commandCwd, args.output);
const todayDateKey =
  args.today === undefined ? dateKeyFromDate(new Date()) : args.today;

assertDateKey(todayDateKey);

const foodId = (
  index: number
): Backup.MaiBackupEncoded["stores"]["foods"][number]["id"] =>
  `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const planId = (
  index: number
): Backup.MaiBackupEncoded["stores"]["plans"][number]["id"] =>
  `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const mealEntryId = (
  index: number
): Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["id"] =>
  `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const seedCreatedAt = timestampForDateKey({
  dateKey: shiftDateKey({ dateKey: todayDateKey, days: -(dayCount - 1) }),
  hour: 8,
});

const seedPlanMeals = ({
  planId,
}: {
  readonly planId: Backup.MaiBackupEncoded["stores"]["plans"][number]["id"];
}): Backup.MaiBackupEncoded["stores"]["plans"][number]["meals"] =>
  CustomPlanMealsMigration.mealsBeforeCustomPlanMeals.map(
    (mealName, position) => ({
      id: CustomPlanMealsMigration.makeMigratedMealId({
        meal: mealName,
        planId,
      }),
      name: CustomPlanMealsMigration.mealLabelsBeforeCustomPlanMeals[mealName],
      position,
      createdAt: seedCreatedAt,
    })
  );

const foodDefinitions = [
  [
    "oats",
    {
      name: "Steel-cut oats",
      brand: "Seed Kitchen",
      category: "grain",
      energyKcal: 379,
      proteinGrams: 13.2,
      carbsGrams: 67.7,
      fatGrams: 6.5,
      fiberGrams: 10.1,
      sugarGrams: 1,
      saturatedFatGrams: 1.2,
      saltGrams: 0.02,
    },
  ],
  [
    "greekYogurt",
    {
      name: "Greek yogurt 2%",
      brand: "Seed Dairy",
      category: "dairy-egg",
      energyKcal: 73,
      proteinGrams: 9.9,
      carbsGrams: 3.9,
      fatGrams: 2,
      fiberGrams: 0,
      sugarGrams: 3.6,
      saturatedFatGrams: 1.3,
      saltGrams: 0.09,
    },
  ],
  [
    "blueberries",
    {
      name: "Blueberries",
      category: "fruit",
      energyKcal: 57,
      proteinGrams: 0.7,
      carbsGrams: 14.5,
      fatGrams: 0.3,
      fiberGrams: 2.4,
      sugarGrams: 10,
      saturatedFatGrams: 0.03,
      saltGrams: 0,
    },
  ],
  [
    "banana",
    {
      name: "Banana",
      category: "fruit",
      energyKcal: 89,
      proteinGrams: 1.1,
      carbsGrams: 22.8,
      fatGrams: 0.3,
      fiberGrams: 2.6,
      sugarGrams: 12.2,
      saturatedFatGrams: 0.1,
      saltGrams: 0,
    },
  ],
  [
    "whey",
    {
      name: "Whey isolate",
      brand: "Seed Sports",
      category: "dairy-egg",
      energyKcal: 370,
      proteinGrams: 82,
      carbsGrams: 7,
      fatGrams: 3,
      fiberGrams: 0,
      sugarGrams: 2,
      saturatedFatGrams: 1.2,
      saltGrams: 0.45,
    },
  ],
  [
    "eggs",
    {
      name: "Scrambled egg mix",
      brand: "Seed Kitchen",
      category: "dairy-egg",
      energyKcal: 155,
      proteinGrams: 13,
      carbsGrams: 1.1,
      fatGrams: 11,
      fiberGrams: 0,
      sugarGrams: 1.1,
      saturatedFatGrams: 3.3,
      saltGrams: 0.31,
    },
  ],
  [
    "chicken",
    {
      name: "Chicken breast grilled",
      category: "meat",
      energyKcal: 165,
      proteinGrams: 31,
      carbsGrams: 0,
      fatGrams: 3.6,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 1,
      saltGrams: 0.18,
    },
  ],
  [
    "turkey",
    {
      name: "Turkey mince lean",
      category: "meat",
      energyKcal: 150,
      proteinGrams: 27,
      carbsGrams: 0,
      fatGrams: 5,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 1.5,
      saltGrams: 0.16,
    },
  ],
  [
    "salmon",
    {
      name: "Salmon fillet",
      category: "fish-seafood",
      energyKcal: 208,
      proteinGrams: 20,
      carbsGrams: 0,
      fatGrams: 13,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 3.1,
      saltGrams: 0.15,
    },
  ],
  [
    "tuna",
    {
      name: "Tuna in water",
      category: "fish-seafood",
      energyKcal: 116,
      proteinGrams: 26,
      carbsGrams: 0,
      fatGrams: 1,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 0.2,
      saltGrams: 0.37,
    },
  ],
  [
    "rice",
    {
      name: "Cooked jasmine rice",
      category: "grain",
      energyKcal: 130,
      proteinGrams: 2.7,
      carbsGrams: 28.2,
      fatGrams: 0.3,
      fiberGrams: 0.4,
      sugarGrams: 0.1,
      saturatedFatGrams: 0.1,
      saltGrams: 0.01,
    },
  ],
  [
    "quinoa",
    {
      name: "Cooked quinoa",
      category: "grain",
      energyKcal: 120,
      proteinGrams: 4.4,
      carbsGrams: 21.3,
      fatGrams: 1.9,
      fiberGrams: 2.8,
      sugarGrams: 0.9,
      saturatedFatGrams: 0.2,
      saltGrams: 0.01,
    },
  ],
  [
    "pasta",
    {
      name: "Whole wheat pasta cooked",
      category: "grain",
      energyKcal: 149,
      proteinGrams: 5.8,
      carbsGrams: 30.1,
      fatGrams: 1.5,
      fiberGrams: 3.9,
      sugarGrams: 0.8,
      saturatedFatGrams: 0.3,
      saltGrams: 0.01,
    },
  ],
  [
    "sweetPotato",
    {
      name: "Sweet potato roasted",
      category: "tuber",
      energyKcal: 90,
      proteinGrams: 2,
      carbsGrams: 20.7,
      fatGrams: 0.2,
      fiberGrams: 3.3,
      sugarGrams: 6.5,
      saturatedFatGrams: 0.04,
      saltGrams: 0.08,
    },
  ],
  [
    "blackBeans",
    {
      name: "Black beans cooked",
      category: "legume",
      energyKcal: 132,
      proteinGrams: 8.9,
      carbsGrams: 23.7,
      fatGrams: 0.5,
      fiberGrams: 8.7,
      sugarGrams: 0.3,
      saturatedFatGrams: 0.1,
      saltGrams: 0.24,
    },
  ],
  [
    "tofu",
    {
      name: "Tofu firm",
      category: "plant-protein",
      energyKcal: 144,
      proteinGrams: 15.7,
      carbsGrams: 3.9,
      fatGrams: 8.7,
      fiberGrams: 2.3,
      sugarGrams: 0.6,
      saturatedFatGrams: 1.3,
      saltGrams: 0.02,
    },
  ],
  [
    "chickpeas",
    {
      name: "Chickpeas cooked",
      category: "legume",
      energyKcal: 164,
      proteinGrams: 8.9,
      carbsGrams: 27.4,
      fatGrams: 2.6,
      fiberGrams: 7.6,
      sugarGrams: 4.8,
      saturatedFatGrams: 0.3,
      saltGrams: 0.24,
    },
  ],
  [
    "avocado",
    {
      name: "Avocado",
      category: "fruit",
      energyKcal: 160,
      proteinGrams: 2,
      carbsGrams: 8.5,
      fatGrams: 14.7,
      fiberGrams: 6.7,
      sugarGrams: 0.7,
      saturatedFatGrams: 2.1,
      saltGrams: 0.02,
    },
  ],
  [
    "oliveOil",
    {
      name: "Extra virgin olive oil",
      category: "oil-fat",
      energyKcal: 884,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 100,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 13.8,
      saltGrams: 0,
    },
  ],
  [
    "peanutButter",
    {
      name: "Peanut butter",
      brand: "Seed Pantry",
      category: "nut",
      energyKcal: 588,
      proteinGrams: 25,
      carbsGrams: 20,
      fatGrams: 50,
      fiberGrams: 6,
      sugarGrams: 9,
      saturatedFatGrams: 10,
      saltGrams: 0.43,
    },
  ],
  [
    "almonds",
    {
      name: "Almonds roasted",
      category: "nut",
      energyKcal: 579,
      proteinGrams: 21.2,
      carbsGrams: 21.6,
      fatGrams: 49.9,
      fiberGrams: 12.5,
      sugarGrams: 4.4,
      saturatedFatGrams: 3.8,
      saltGrams: 0.01,
    },
  ],
  [
    "broccoli",
    {
      name: "Broccoli steamed",
      category: "vegetable",
      energyKcal: 35,
      proteinGrams: 2.4,
      carbsGrams: 7.2,
      fatGrams: 0.4,
      fiberGrams: 3.3,
      sugarGrams: 1.4,
      saturatedFatGrams: 0.04,
      saltGrams: 0.04,
    },
  ],
  [
    "spinach",
    {
      name: "Spinach cooked",
      category: "vegetable",
      energyKcal: 23,
      proteinGrams: 3,
      carbsGrams: 3.8,
      fatGrams: 0.3,
      fiberGrams: 2.4,
      sugarGrams: 0.4,
      saturatedFatGrams: 0.1,
      saltGrams: 0.08,
    },
  ],
  [
    "salad",
    {
      name: "Mixed salad greens",
      category: "vegetable",
      energyKcal: 17,
      proteinGrams: 1.4,
      carbsGrams: 3.3,
      fatGrams: 0.2,
      fiberGrams: 1.8,
      sugarGrams: 1.2,
      saturatedFatGrams: 0.03,
      saltGrams: 0.03,
    },
  ],
  [
    "darkChocolate",
    {
      name: "Dark chocolate 70%",
      brand: "Seed Treats",
      category: "sweetener",
      energyKcal: 598,
      proteinGrams: 7.8,
      carbsGrams: 45.9,
      fatGrams: 42.6,
      fiberGrams: 10.9,
      sugarGrams: 24,
      saturatedFatGrams: 24.5,
      saltGrams: 0.02,
    },
  ],
  [
    "honey",
    {
      name: "Honey",
      category: "sweetener",
      energyKcal: 304,
      proteinGrams: 0.3,
      carbsGrams: 82.4,
      fatGrams: 0,
      fiberGrams: 0,
      sugarGrams: 82.1,
      saturatedFatGrams: 0,
      saltGrams: 0.01,
    },
  ],
  [
    "sourdough",
    {
      name: "Sourdough bread",
      category: "bread-like",
      energyKcal: 260,
      proteinGrams: 8.5,
      carbsGrams: 51,
      fatGrams: 1.5,
      fiberGrams: 2.9,
      sugarGrams: 2.8,
      saturatedFatGrams: 0.3,
      saltGrams: 1.2,
    },
  ],
  [
    "cottageCheese",
    {
      name: "Cottage cheese",
      category: "dairy-egg",
      energyKcal: 98,
      proteinGrams: 11.1,
      carbsGrams: 3.4,
      fatGrams: 4.3,
      fiberGrams: 0,
      sugarGrams: 2.7,
      saturatedFatGrams: 1.7,
      saltGrams: 0.36,
    },
  ],
  [
    "electrolyteDrink",
    {
      name: "Electrolyte drink",
      brand: "Seed Hydration",
      energyKcal: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      saltGrams: 0.08,
    },
  ],
  [
    "pizza",
    {
      name: "Frozen pizza slice",
      brand: "Seed Freezer",
      category: "bread-like",
      energyKcal: 266,
      proteinGrams: 11,
      carbsGrams: 33,
      fatGrams: 10,
      fiberGrams: 2.3,
      sugarGrams: 3.5,
      saturatedFatGrams: 4,
      saltGrams: 1.2,
    },
  ],
  [
    "proteinBar",
    {
      name: "Protein bar caramel",
      brand: "Seed Sports",
      category: "sweetener",
      energyKcal: 360,
      proteinGrams: 32,
      carbsGrams: 34,
      fatGrams: 12,
      fiberGrams: 8,
      sugarGrams: 4,
      saturatedFatGrams: 5,
      saltGrams: 0.4,
    },
  ],
  [
    "granola",
    {
      name: "Granola clusters",
      brand: "Seed Pantry",
      category: "grain",
      energyKcal: 471,
      proteinGrams: 10,
      carbsGrams: 64,
      fatGrams: 19,
      fiberGrams: 7,
      sugarGrams: 18,
      saturatedFatGrams: 4,
      saltGrams: 0.2,
    },
  ],
  [
    "seitan",
    {
      name: "Seitan strips",
      category: "plant-protein",
      energyKcal: 130,
      proteinGrams: 25,
      carbsGrams: 5,
      fatGrams: 2,
      fiberGrams: 1,
      sugarGrams: 1,
      saturatedFatGrams: 0.4,
      saltGrams: 0.8,
    },
  ],
  [
    "currySauce",
    {
      name: "Coconut milk curry sauce",
      category: "oil-fat",
      energyKcal: 190,
      proteinGrams: 2,
      carbsGrams: 6,
      fatGrams: 18,
      fiberGrams: 1.2,
      sugarGrams: 3,
      saturatedFatGrams: 15,
      saltGrams: 0.5,
    },
  ],
  [
    "riceCrackers",
    {
      name: "White rice crackers",
      category: "grain",
      energyKcal: 387,
      proteinGrams: 7,
      carbsGrams: 82,
      fatGrams: 3,
      fiberGrams: 1,
      sugarGrams: 0.5,
      saturatedFatGrams: 0.6,
      saltGrams: 0.9,
    },
  ],
  [
    "lentilSoup",
    {
      name: "Lentil soup",
      brand: "Seed Batch Cook",
      category: "legume",
      energyKcal: 72,
      proteinGrams: 4.5,
      carbsGrams: 11,
      fatGrams: 1.5,
      fiberGrams: 4,
      sugarGrams: 1.8,
      saturatedFatGrams: 0.2,
      saltGrams: 0.7,
    },
  ],
] satisfies readonly SeedFoodDefinition[];

const foods: Backup.MaiBackupEncoded["stores"]["foods"][number][] =
  foodDefinitions.map(
    ([, food], index): Backup.MaiBackupEncoded["stores"]["foods"][number] => ({
      id: foodId(index + 1),
      ...food,
      origin: "user",
      createdAt: seedCreatedAt,
      updatedAt: seedCreatedAt,
    })
  );
const foodIdsByKey = new Map<
  FoodKey,
  Backup.MaiBackupEncoded["stores"]["foods"][number]["id"]
>();

for (const [foodKey] of foodDefinitions) {
  foodIdsByKey.set(foodKey, foodId(foodIdsByKey.size + 1));
}

const greekYogurtFood = requiredItem({
  index: 1,
  name: "Greek yogurt seed food",
  values: foods,
});
const lowSugarYogurt: Backup.MaiBackupEncoded["stores"]["foods"][number] = {
  ...greekYogurtFood,
  id: foodId(foods.length + 1),
  name: "Greek yogurt 2% low-sugar batch",
  sugarGrams: 2.1,
  updatedAt: timestampForDateKey({
    dateKey: shiftDateKey({ dateKey: todayDateKey, days: -18 }),
    hour: 9,
  }),
};

foods.push(lowSugarYogurt);
foodIdsByKey.set("lowSugarYogurt", lowSugarYogurt.id);

const appDefaultFoodNamesByKey = {
  appApple: "apple",
  appBanana: "banana",
  appCarrot: "carrot",
  appKiwi: "kiwi",
  appStrawberry: "strawberry",
  appTomato: "tomato",
} satisfies Record<
  FoodKey,
  Backup.MaiBackupEncoded["stores"]["foods"][number]["name"]
>;
const appDefaultFoods = Object.entries(appDefaultFoodNamesByKey).map(
  ([foodKey, foodName]) => {
    const food = defaultFoodByName({ foodName });

    foodIdsByKey.set(foodKey, food.id);

    return food;
  }
);

foods.push(...appDefaultFoods);

const plans: Backup.MaiBackupEncoded["stores"]["plans"][number][] = [
  {
    id: planId(1),
    name: "Seed balanced 2000 kcal",
    meals: seedPlanMeals({ planId: planId(1) }),
    proteinTargetGrams: 150,
    carbsTargetGrams: 225,
    fatTargetGrams: 60,
    fiberTargetGrams: 30,
    sugarTargetGrams: 65,
    saltTargetGrams: 6,
    saturatedFatTargetGrams: 22,
    createdAt: seedCreatedAt,
  },
  {
    id: planId(2),
    name: "Seed rest day lower appetite",
    meals: seedPlanMeals({ planId: planId(2) }),
    proteinTargetGrams: 125,
    carbsTargetGrams: 190,
    fatTargetGrams: 65,
    fiberTargetGrams: 25,
    sugarTargetGrams: 55,
    saltTargetGrams: 6,
    saturatedFatTargetGrams: 20,
    createdAt: seedCreatedAt,
  },
  {
    id: planId(3),
    name: "Seed endurance high carb",
    meals: seedPlanMeals({ planId: planId(3) }),
    proteinTargetGrams: 140,
    carbsTargetGrams: 285,
    fatTargetGrams: 55,
    fiberTargetGrams: 35,
    sugarTargetGrams: 80,
    saltTargetGrams: 7,
    saturatedFatTargetGrams: 22,
    createdAt: seedCreatedAt,
  },
];
const balancedPlan = requiredItem({
  index: 0,
  name: "balanced seed plan",
  values: plans,
});
const restPlan = requiredItem({
  index: 1,
  name: "rest day seed plan",
  values: plans,
});
const endurancePlan = requiredItem({
  index: 2,
  name: "endurance seed plan",
  values: plans,
});

const meal = ({
  foodKey,
  quantityGrams,
}: {
  readonly foodKey: FoodKey;
  readonly quantityGrams: number;
}): MealSeedEntry => ({
  foodId: foodIdFor({ foodKey }),
  quantityGrams,
});

const templates = {
  balancedA: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "oats", quantityGrams: 70 }),
        meal({ foodKey: "greekYogurt", quantityGrams: 220 }),
        meal({ foodKey: "appApple", quantityGrams: 160 }),
        meal({ foodKey: "peanutButter", quantityGrams: 15 }),
      ],
      lunch: [
        meal({ foodKey: "chicken", quantityGrams: 180 }),
        meal({ foodKey: "rice", quantityGrams: 220 }),
        meal({ foodKey: "broccoli", quantityGrams: 180 }),
        meal({ foodKey: "oliveOil", quantityGrams: 10 }),
      ],
      dinner: [
        meal({ foodKey: "salmon", quantityGrams: 150 }),
        meal({ foodKey: "sweetPotato", quantityGrams: 250 }),
        meal({ foodKey: "spinach", quantityGrams: 150 }),
        meal({ foodKey: "salad", quantityGrams: 100 }),
        meal({ foodKey: "quinoa", quantityGrams: 150 }),
      ],
    },
  },
  balancedB: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "sourdough", quantityGrams: 100 }),
        meal({ foodKey: "eggs", quantityGrams: 160 }),
        meal({ foodKey: "avocado", quantityGrams: 80 }),
        meal({ foodKey: "lowSugarYogurt", quantityGrams: 150 }),
        meal({ foodKey: "appKiwi", quantityGrams: 90 }),
      ],
      lunch: [
        meal({ foodKey: "tuna", quantityGrams: 140 }),
        meal({ foodKey: "pasta", quantityGrams: 260 }),
        meal({ foodKey: "salad", quantityGrams: 120 }),
        meal({ foodKey: "oliveOil", quantityGrams: 12 }),
      ],
      dinner: [
        meal({ foodKey: "turkey", quantityGrams: 180 }),
        meal({ foodKey: "quinoa", quantityGrams: 220 }),
        meal({ foodKey: "broccoli", quantityGrams: 150 }),
        meal({ foodKey: "darkChocolate", quantityGrams: 15 }),
      ],
    },
  },
  balancedPlant: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "oats", quantityGrams: 80 }),
        meal({ foodKey: "banana", quantityGrams: 120 }),
        meal({ foodKey: "almonds", quantityGrams: 20 }),
        meal({ foodKey: "blueberries", quantityGrams: 120 }),
      ],
      lunch: [
        meal({ foodKey: "tofu", quantityGrams: 230 }),
        meal({ foodKey: "rice", quantityGrams: 240 }),
        meal({ foodKey: "broccoli", quantityGrams: 220 }),
        meal({ foodKey: "currySauce", quantityGrams: 80 }),
      ],
      dinner: [
        meal({ foodKey: "chickpeas", quantityGrams: 230 }),
        meal({ foodKey: "quinoa", quantityGrams: 180 }),
        meal({ foodKey: "appTomato", quantityGrams: 160 }),
        meal({ foodKey: "oliveOil", quantityGrams: 8 }),
      ],
    },
  },
  highProteinLowCarb: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "whey", quantityGrams: 45 }),
        meal({ foodKey: "greekYogurt", quantityGrams: 250 }),
        meal({ foodKey: "blueberries", quantityGrams: 80 }),
      ],
      lunch: [
        meal({ foodKey: "chicken", quantityGrams: 250 }),
        meal({ foodKey: "tofu", quantityGrams: 150 }),
        meal({ foodKey: "salad", quantityGrams: 150 }),
        meal({ foodKey: "oliveOil", quantityGrams: 8 }),
      ],
      dinner: [
        meal({ foodKey: "tuna", quantityGrams: 180 }),
        meal({ foodKey: "salmon", quantityGrams: 170 }),
        meal({ foodKey: "spinach", quantityGrams: 200 }),
        meal({ foodKey: "broccoli", quantityGrams: 200 }),
        meal({ foodKey: "proteinBar", quantityGrams: 60 }),
      ],
    },
  },
  highCarbLowFat: {
    planId: endurancePlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "oats", quantityGrams: 90 }),
        meal({ foodKey: "banana", quantityGrams: 150 }),
        meal({ foodKey: "honey", quantityGrams: 20 }),
        meal({ foodKey: "greekYogurt", quantityGrams: 150 }),
      ],
      lunch: [
        meal({ foodKey: "pasta", quantityGrams: 350 }),
        meal({ foodKey: "sourdough", quantityGrams: 80 }),
        meal({ foodKey: "lentilSoup", quantityGrams: 300 }),
        meal({ foodKey: "salad", quantityGrams: 120 }),
      ],
      dinner: [
        meal({ foodKey: "rice", quantityGrams: 300 }),
        meal({ foodKey: "blackBeans", quantityGrams: 220 }),
        meal({ foodKey: "sweetPotato", quantityGrams: 200 }),
        meal({ foodKey: "broccoli", quantityGrams: 150 }),
      ],
    },
  },
  highFat: {
    planId: restPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "granola", quantityGrams: 80 }),
        meal({ foodKey: "peanutButter", quantityGrams: 35 }),
        meal({ foodKey: "greekYogurt", quantityGrams: 200 }),
      ],
      lunch: [
        meal({ foodKey: "avocado", quantityGrams: 180 }),
        meal({ foodKey: "salmon", quantityGrams: 220 }),
        meal({ foodKey: "salad", quantityGrams: 120 }),
        meal({ foodKey: "oliveOil", quantityGrams: 20 }),
      ],
      dinner: [
        meal({ foodKey: "tofu", quantityGrams: 220 }),
        meal({ foodKey: "currySauce", quantityGrams: 150 }),
        meal({ foodKey: "spinach", quantityGrams: 150 }),
      ],
    },
  },
  lowDay: {
    planId: restPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "greekYogurt", quantityGrams: 150 }),
        meal({ foodKey: "appStrawberry", quantityGrams: 120 }),
        meal({ foodKey: "electrolyteDrink", quantityGrams: 500 }),
      ],
      lunch: [
        meal({ foodKey: "tuna", quantityGrams: 100 }),
        meal({ foodKey: "salad", quantityGrams: 150 }),
        meal({ foodKey: "riceCrackers", quantityGrams: 20 }),
      ],
      dinner: [
        meal({ foodKey: "lentilSoup", quantityGrams: 250 }),
        meal({ foodKey: "broccoli", quantityGrams: 150 }),
        meal({ foodKey: "spinach", quantityGrams: 100 }),
      ],
    },
  },
  overDay: {
    planId: endurancePlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "granola", quantityGrams: 120 }),
        meal({ foodKey: "greekYogurt", quantityGrams: 250 }),
        meal({ foodKey: "peanutButter", quantityGrams: 35 }),
        meal({ foodKey: "honey", quantityGrams: 25 }),
      ],
      lunch: [
        meal({ foodKey: "pizza", quantityGrams: 350 }),
        meal({ foodKey: "oliveOil", quantityGrams: 15 }),
        meal({ foodKey: "salad", quantityGrams: 100 }),
      ],
      dinner: [
        meal({ foodKey: "pasta", quantityGrams: 350 }),
        meal({ foodKey: "salmon", quantityGrams: 250 }),
        meal({ foodKey: "darkChocolate", quantityGrams: 50 }),
        meal({ foodKey: "avocado", quantityGrams: 150 }),
      ],
    },
  },
  sameFood: {
    planId: endurancePlan.id,
    meals: {
      breakfast: [meal({ foodKey: "riceCrackers", quantityGrams: 170 })],
      lunch: [meal({ foodKey: "riceCrackers", quantityGrams: 170 })],
      dinner: [meal({ foodKey: "riceCrackers", quantityGrams: 170 })],
    },
  },
  highSugar: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "oats", quantityGrams: 60 }),
        meal({ foodKey: "appBanana", quantityGrams: 180 }),
        meal({ foodKey: "honey", quantityGrams: 35 }),
        meal({ foodKey: "granola", quantityGrams: 60 }),
      ],
      lunch: [
        meal({ foodKey: "greekYogurt", quantityGrams: 200 }),
        meal({ foodKey: "blueberries", quantityGrams: 250 }),
        meal({ foodKey: "honey", quantityGrams: 30 }),
      ],
      dinner: [
        meal({ foodKey: "rice", quantityGrams: 250 }),
        meal({ foodKey: "sweetPotato", quantityGrams: 250 }),
        meal({ foodKey: "darkChocolate", quantityGrams: 60 }),
      ],
    },
  },
  highFiber: {
    planId: balancedPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "oats", quantityGrams: 90 }),
        meal({ foodKey: "blueberries", quantityGrams: 200 }),
        meal({ foodKey: "almonds", quantityGrams: 25 }),
      ],
      lunch: [
        meal({ foodKey: "blackBeans", quantityGrams: 300 }),
        meal({ foodKey: "broccoli", quantityGrams: 250 }),
        meal({ foodKey: "quinoa", quantityGrams: 150 }),
        meal({ foodKey: "appCarrot", quantityGrams: 160 }),
      ],
      dinner: [
        meal({ foodKey: "chickpeas", quantityGrams: 280 }),
        meal({ foodKey: "sweetPotato", quantityGrams: 250 }),
        meal({ foodKey: "spinach", quantityGrams: 200 }),
        meal({ foodKey: "oliveOil", quantityGrams: 10 }),
      ],
    },
  },
  saltyProcessed: {
    planId: restPlan.id,
    meals: {
      breakfast: [
        meal({ foodKey: "sourdough", quantityGrams: 120 }),
        meal({ foodKey: "cottageCheese", quantityGrams: 220 }),
      ],
      lunch: [
        meal({ foodKey: "pizza", quantityGrams: 450 }),
        meal({ foodKey: "salad", quantityGrams: 100 }),
      ],
      dinner: [
        meal({ foodKey: "lentilSoup", quantityGrams: 400 }),
        meal({ foodKey: "seitan", quantityGrams: 160 }),
        meal({ foodKey: "spinach", quantityGrams: 100 }),
      ],
    },
  },
} satisfies Record<string, DaySeedTemplate>;

const schedule = [
  "balancedA",
  "balancedB",
  "balancedPlant",
  "highProteinLowCarb",
  "highCarbLowFat",
  "lowDay",
  "overDay",
  "balancedA",
  "highFiber",
  "balancedB",
  "highFat",
  "sameFood",
  "balancedPlant",
  "highSugar",
  "balancedA",
  "saltyProcessed",
  "balancedB",
  "highProteinLowCarb",
  "highCarbLowFat",
  "lowDay",
  "balancedPlant",
  "highFiber",
  "balancedA",
  "highFat",
  "balancedB",
  "sameFood",
  "overDay",
  "balancedA",
] satisfies readonly (keyof typeof templates)[];
const mealNames = CustomPlanMealsMigration.mealsBeforeCustomPlanMeals;

const backup: Backup.MaiBackupEncoded = buildBackup();
const json = `${JSON.stringify(backup, null, 2)}\n`;
const decodedBackup: Backup.MaiBackup = await Effect.runPromise(
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeEffect(Backup.MaiBackupJson)(json);

    yield* Backup.validateBackup({ backup: decoded });

    return decoded;
  })
);
const summary = calculateSummary({ backup: decodedBackup });

await writeFile(outputPath, json, "utf8");

console.log(
  [
    `Wrote ${outputPath}`,
    `Dates: ${summary.firstDateKey} to ${summary.lastDateKey}`,
    `Counts: ${JSON.stringify(decodedBackup.integrity.counts)}`,
    `Average: ${summary.averageEnergyKcal} kcal, ${summary.averageProteinGrams}g protein, ${summary.averageCarbsGrams}g carbs, ${summary.averageFatGrams}g fat`,
  ].join("\n")
);

function buildBackup(): Backup.MaiBackupEncoded {
  const startDateKey = shiftDateKey({
    dateKey: todayDateKey,
    days: -(dayCount - 1),
  });
  const activeMealPlanSelections: Backup.MaiBackupEncoded["stores"]["activeMealPlanSelections"][number][] =
    [
      {
        id: "active-meal-plan",
        planId: balancedPlan.id,
        updatedAt: timestampForDateKey({ dateKey: todayDateKey, hour: 12 }),
      },
    ];
  const dailyLogs: Backup.MaiBackupEncoded["stores"]["dailyLogs"][number][] =
    [];
  const mealEntries: Backup.MaiBackupEncoded["stores"]["mealEntries"][number][] =
    [];
  let nextMealEntry = 1;

  for (const [dayIndex, templateName] of schedule.entries()) {
    const dateKey = shiftDateKey({ dateKey: startDateKey, days: dayIndex });
    const template = templates[templateName];

    dailyLogs.push({
      dateKey,
      planId: template.planId,
      createdAt: timestampForDateKey({ dateKey, hour: 6 }),
      updatedAt: timestampForDateKey({ dateKey, hour: 20 }),
    });

    for (const mealName of mealNames) {
      for (const entry of template.meals[mealName]) {
        mealEntries.push({
          id: mealEntryId(nextMealEntry),
          dateKey,
          mealId: CustomPlanMealsMigration.makeMigratedMealId({
            meal: mealName,
            planId: template.planId,
          }),
          foodId: entry.foodId,
          quantity: {
            _tag: "MeasuredFoodQuantity",
            amount: entry.quantityGrams,
            unit: "g",
          },
          nutritionMultiplier: entry.quantityGrams / 100,
          createdAt:
            timestampForDateKey({ dateKey, hour: mealHour(mealName) }) +
            nextMealEntry * 1000,
          updatedAt:
            timestampForDateKey({ dateKey, hour: mealHour(mealName) }) +
            nextMealEntry * 1000,
        });
        nextMealEntry += 1;
      }
    }
  }

  return {
    format: "mai.backup",
    formatVersion: 1,
    integrity: {
      counts: {
        activeMealPlanSelections: activeMealPlanSelections.length,
        bodyWeightEntries: 0,
        dailyLogs: dailyLogs.length,
        foods: foods.length,
        mealEntries: mealEntries.length,
        plans: plans.length,
      },
    },
    source: {
      databaseName: "mai",
      databaseVersion: 5,
      exportedAt: timestampForDateKey({ dateKey: todayDateKey, hour: 12 }),
    },
    stores: {
      activeMealPlanSelections,
      bodyWeightEntries: [],
      dailyLogs,
      foods,
      mealEntries,
      plans,
    },
  };
}

function calculateSummary({
  backup,
}: {
  readonly backup: Backup.MaiBackup;
}): Summary {
  const foodById = new Map(backup.stores.foods.map((food) => [food.id, food]));
  const dayTotals: NutrientTotals[] = backup.stores.dailyLogs.map(
    (dailyLog) => {
      const totals: NutrientTotals = {
        carbsGrams: 0,
        energyKcal: 0,
        fatGrams: 0,
        proteinGrams: 0,
      };
      const entries = backup.stores.mealEntries.filter(
        (mealEntry) => mealEntry.dateKey === dailyLog.dateKey
      );

      for (const entry of entries) {
        const food = foodByIdFor({
          foodById,
          foodId: entry.foodId,
        });

        totals.energyKcal += (food.energyKcal ?? 0) * entry.nutritionMultiplier;
        totals.proteinGrams +=
          (food.proteinGrams ?? 0) * entry.nutritionMultiplier;
        totals.carbsGrams += (food.carbsGrams ?? 0) * entry.nutritionMultiplier;
        totals.fatGrams += (food.fatGrams ?? 0) * entry.nutritionMultiplier;
      }

      return totals;
    }
  );
  const firstDailyLog = requiredItem({
    index: 0,
    name: "first daily log",
    values: backup.stores.dailyLogs,
  });
  const lastDailyLog = requiredItem({
    index: backup.stores.dailyLogs.length - 1,
    name: "last daily log",
    values: backup.stores.dailyLogs,
  });

  return {
    averageCarbsGrams: averageRounded({
      totals: dayTotals,
      property: "carbsGrams",
    }),
    averageEnergyKcal: averageRounded({
      totals: dayTotals,
      property: "energyKcal",
    }),
    averageFatGrams: averageRounded({
      totals: dayTotals,
      property: "fatGrams",
    }),
    averageProteinGrams: averageRounded({
      totals: dayTotals,
      property: "proteinGrams",
    }),
    firstDateKey: firstDailyLog.dateKey,
    lastDateKey: lastDailyLog.dateKey,
  };
}

function averageRounded({
  totals,
  property,
}: {
  readonly property: keyof NutrientTotals;
  readonly totals: readonly NutrientTotals[];
}): number {
  const total = totals.reduce((sum, entry) => sum + entry[property], 0);

  return Math.round((total / totals.length) * 10) / 10;
}

function mealHour(
  mealName: (typeof CustomPlanMealsMigration.mealsBeforeCustomPlanMeals)[number]
): number {
  return { breakfast: 7, dinner: 19, lunch: 12 }[mealName];
}

function dateKeyFromDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateKey({
  dateKey,
  days,
}: {
  readonly dateKey: string;
  readonly days: number;
}): string {
  const { day, month, year } = parseDateKey({ dateKey });

  return dateKeyFromDate(new Date(year, month - 1, day + days, 12));
}

function timestampForDateKey({
  dateKey,
  hour,
}: {
  readonly dateKey: string;
  readonly hour: number;
}): number {
  const { day, month, year } = parseDateKey({ dateKey });

  return new Date(year, month - 1, day, hour).getTime();
}

function parseDateKey({ dateKey }: { readonly dateKey: string }): {
  readonly day: number;
  readonly month: number;
  readonly year: number;
} {
  assertDateKey(dateKey);

  const parts = dateKey.split("-").map(Number);

  return {
    day: requiredItem({ index: 2, name: "date day", values: parts }),
    month: requiredItem({ index: 1, name: "date month", values: parts }),
    year: requiredItem({ index: 0, name: "date year", values: parts }),
  };
}

function assertDateKey(dateKey: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Expected --today to use YYYY-MM-DD, got ${dateKey}`);
  }
}

function foodIdFor({
  foodKey,
}: {
  readonly foodKey: FoodKey;
}): Backup.MaiBackupEncoded["stores"]["foods"][number]["id"] {
  const id = foodIdsByKey.get(foodKey);

  if (id === undefined) {
    throw new Error(`Missing food id for ${foodKey}`);
  }

  return id;
}

function foodByIdFor({
  foodById,
  foodId,
}: {
  readonly foodById: ReadonlyMap<
    Backup.MaiBackup["stores"]["foods"][number]["id"],
    Backup.MaiBackup["stores"]["foods"][number]
  >;
  readonly foodId: Backup.MaiBackup["stores"]["foods"][number]["id"];
}): Backup.MaiBackup["stores"]["foods"][number] {
  const food = foodById.get(foodId);

  if (food === undefined) {
    throw new Error(`Missing food for ${foodId}`);
  }

  return food;
}

function defaultFoodByName({
  foodName,
}: {
  readonly foodName: Backup.MaiBackupEncoded["stores"]["foods"][number]["name"];
}): Backup.MaiBackupEncoded["stores"]["foods"][number] {
  const food = DefaultFoods.DefaultFoods.find(
    (candidate) => candidate.name === foodName
  );

  if (food === undefined) {
    throw new Error(`Missing app-default food ${foodName}`);
  }

  return food;
}

function requiredItem<T>({
  index,
  name,
  values,
}: {
  readonly index: number;
  readonly name: string;
  readonly values: readonly T[];
}): T {
  const value = values[index];

  if (value === undefined) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function parseCliArgs({
  values,
}: {
  readonly values: readonly string[];
}): Record<string, string> {
  const entries: [string, string][] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === undefined || !value.startsWith("--")) {
      continue;
    }

    const raw = value.slice(2);

    if (raw.length === 0) {
      continue;
    }

    const equalsIndex = raw.indexOf("=");

    if (equalsIndex >= 0) {
      entries.push([raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1)]);
      continue;
    }

    const nextValue = values[index + 1];

    if (nextValue !== undefined && !nextValue.startsWith("--")) {
      entries.push([raw, nextValue]);
      index += 1;
      continue;
    }

    entries.push([raw, "true"]);
  }

  return Object.fromEntries(entries);
}
