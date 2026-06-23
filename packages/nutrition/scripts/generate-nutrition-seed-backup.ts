import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";

import { Backup, DefaultFoods } from "../src/index.ts";

type FoodKey = string;
type SeedFoodDefinition = readonly [
  foodKey: FoodKey,
  food: Omit<
    Backup.MaiBackupEncoded["stores"]["foods"][number],
    "basedOnFoodId" | "createdAt" | "id" | "origin" | "updatedAt"
  >,
];
type MealSeedEntry = Pick<
  Backup.MaiBackupEncoded["stores"]["mealEntries"][number],
  "foodId" | "quantityGrams"
>;
type MealSeedTemplate = Record<
  Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["meal"],
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

const foodDefinitions = [
  [
    "oats",
    {
      name: "Steel-cut oats",
      brand: "Seed Kitchen",
      category: "grain",
      energyKcalPer100g: 379,
      proteinGramsPer100g: 13.2,
      carbsGramsPer100g: 67.7,
      fatGramsPer100g: 6.5,
      fiberGramsPer100g: 10.1,
      sugarGramsPer100g: 1,
      saturatedFatGramsPer100g: 1.2,
      saltGramsPer100g: 0.02,
    },
  ],
  [
    "greekYogurt",
    {
      name: "Greek yogurt 2%",
      brand: "Seed Dairy",
      category: "dairy-egg",
      energyKcalPer100g: 73,
      proteinGramsPer100g: 9.9,
      carbsGramsPer100g: 3.9,
      fatGramsPer100g: 2,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 3.6,
      saturatedFatGramsPer100g: 1.3,
      saltGramsPer100g: 0.09,
    },
  ],
  [
    "blueberries",
    {
      name: "Blueberries",
      category: "fruit",
      energyKcalPer100g: 57,
      proteinGramsPer100g: 0.7,
      carbsGramsPer100g: 14.5,
      fatGramsPer100g: 0.3,
      fiberGramsPer100g: 2.4,
      sugarGramsPer100g: 10,
      saturatedFatGramsPer100g: 0.03,
      saltGramsPer100g: 0,
    },
  ],
  [
    "banana",
    {
      name: "Banana",
      category: "fruit",
      energyKcalPer100g: 89,
      proteinGramsPer100g: 1.1,
      carbsGramsPer100g: 22.8,
      fatGramsPer100g: 0.3,
      fiberGramsPer100g: 2.6,
      sugarGramsPer100g: 12.2,
      saturatedFatGramsPer100g: 0.1,
      saltGramsPer100g: 0,
    },
  ],
  [
    "whey",
    {
      name: "Whey isolate",
      brand: "Seed Sports",
      category: "dairy-egg",
      energyKcalPer100g: 370,
      proteinGramsPer100g: 82,
      carbsGramsPer100g: 7,
      fatGramsPer100g: 3,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 2,
      saturatedFatGramsPer100g: 1.2,
      saltGramsPer100g: 0.45,
    },
  ],
  [
    "eggs",
    {
      name: "Scrambled egg mix",
      brand: "Seed Kitchen",
      category: "dairy-egg",
      energyKcalPer100g: 155,
      proteinGramsPer100g: 13,
      carbsGramsPer100g: 1.1,
      fatGramsPer100g: 11,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 1.1,
      saturatedFatGramsPer100g: 3.3,
      saltGramsPer100g: 0.31,
    },
  ],
  [
    "chicken",
    {
      name: "Chicken breast grilled",
      category: "meat",
      energyKcalPer100g: 165,
      proteinGramsPer100g: 31,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 3.6,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      saturatedFatGramsPer100g: 1,
      saltGramsPer100g: 0.18,
    },
  ],
  [
    "turkey",
    {
      name: "Turkey mince lean",
      category: "meat",
      energyKcalPer100g: 150,
      proteinGramsPer100g: 27,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 5,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      saturatedFatGramsPer100g: 1.5,
      saltGramsPer100g: 0.16,
    },
  ],
  [
    "salmon",
    {
      name: "Salmon fillet",
      category: "fish-seafood",
      energyKcalPer100g: 208,
      proteinGramsPer100g: 20,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 13,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      saturatedFatGramsPer100g: 3.1,
      saltGramsPer100g: 0.15,
    },
  ],
  [
    "tuna",
    {
      name: "Tuna in water",
      category: "fish-seafood",
      energyKcalPer100g: 116,
      proteinGramsPer100g: 26,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 1,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      saturatedFatGramsPer100g: 0.2,
      saltGramsPer100g: 0.37,
    },
  ],
  [
    "rice",
    {
      name: "Cooked jasmine rice",
      category: "grain",
      energyKcalPer100g: 130,
      proteinGramsPer100g: 2.7,
      carbsGramsPer100g: 28.2,
      fatGramsPer100g: 0.3,
      fiberGramsPer100g: 0.4,
      sugarGramsPer100g: 0.1,
      saturatedFatGramsPer100g: 0.1,
      saltGramsPer100g: 0.01,
    },
  ],
  [
    "quinoa",
    {
      name: "Cooked quinoa",
      category: "grain",
      energyKcalPer100g: 120,
      proteinGramsPer100g: 4.4,
      carbsGramsPer100g: 21.3,
      fatGramsPer100g: 1.9,
      fiberGramsPer100g: 2.8,
      sugarGramsPer100g: 0.9,
      saturatedFatGramsPer100g: 0.2,
      saltGramsPer100g: 0.01,
    },
  ],
  [
    "pasta",
    {
      name: "Whole wheat pasta cooked",
      category: "grain",
      energyKcalPer100g: 149,
      proteinGramsPer100g: 5.8,
      carbsGramsPer100g: 30.1,
      fatGramsPer100g: 1.5,
      fiberGramsPer100g: 3.9,
      sugarGramsPer100g: 0.8,
      saturatedFatGramsPer100g: 0.3,
      saltGramsPer100g: 0.01,
    },
  ],
  [
    "sweetPotato",
    {
      name: "Sweet potato roasted",
      category: "tuber",
      energyKcalPer100g: 90,
      proteinGramsPer100g: 2,
      carbsGramsPer100g: 20.7,
      fatGramsPer100g: 0.2,
      fiberGramsPer100g: 3.3,
      sugarGramsPer100g: 6.5,
      saturatedFatGramsPer100g: 0.04,
      saltGramsPer100g: 0.08,
    },
  ],
  [
    "blackBeans",
    {
      name: "Black beans cooked",
      category: "legume",
      energyKcalPer100g: 132,
      proteinGramsPer100g: 8.9,
      carbsGramsPer100g: 23.7,
      fatGramsPer100g: 0.5,
      fiberGramsPer100g: 8.7,
      sugarGramsPer100g: 0.3,
      saturatedFatGramsPer100g: 0.1,
      saltGramsPer100g: 0.24,
    },
  ],
  [
    "tofu",
    {
      name: "Tofu firm",
      category: "plant-protein",
      energyKcalPer100g: 144,
      proteinGramsPer100g: 15.7,
      carbsGramsPer100g: 3.9,
      fatGramsPer100g: 8.7,
      fiberGramsPer100g: 2.3,
      sugarGramsPer100g: 0.6,
      saturatedFatGramsPer100g: 1.3,
      saltGramsPer100g: 0.02,
    },
  ],
  [
    "chickpeas",
    {
      name: "Chickpeas cooked",
      category: "legume",
      energyKcalPer100g: 164,
      proteinGramsPer100g: 8.9,
      carbsGramsPer100g: 27.4,
      fatGramsPer100g: 2.6,
      fiberGramsPer100g: 7.6,
      sugarGramsPer100g: 4.8,
      saturatedFatGramsPer100g: 0.3,
      saltGramsPer100g: 0.24,
    },
  ],
  [
    "avocado",
    {
      name: "Avocado",
      category: "fruit",
      energyKcalPer100g: 160,
      proteinGramsPer100g: 2,
      carbsGramsPer100g: 8.5,
      fatGramsPer100g: 14.7,
      fiberGramsPer100g: 6.7,
      sugarGramsPer100g: 0.7,
      saturatedFatGramsPer100g: 2.1,
      saltGramsPer100g: 0.02,
    },
  ],
  [
    "oliveOil",
    {
      name: "Extra virgin olive oil",
      category: "oil-fat",
      energyKcalPer100g: 884,
      proteinGramsPer100g: 0,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 100,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      saturatedFatGramsPer100g: 13.8,
      saltGramsPer100g: 0,
    },
  ],
  [
    "peanutButter",
    {
      name: "Peanut butter",
      brand: "Seed Pantry",
      category: "nut",
      energyKcalPer100g: 588,
      proteinGramsPer100g: 25,
      carbsGramsPer100g: 20,
      fatGramsPer100g: 50,
      fiberGramsPer100g: 6,
      sugarGramsPer100g: 9,
      saturatedFatGramsPer100g: 10,
      saltGramsPer100g: 0.43,
    },
  ],
  [
    "almonds",
    {
      name: "Almonds roasted",
      category: "nut",
      energyKcalPer100g: 579,
      proteinGramsPer100g: 21.2,
      carbsGramsPer100g: 21.6,
      fatGramsPer100g: 49.9,
      fiberGramsPer100g: 12.5,
      sugarGramsPer100g: 4.4,
      saturatedFatGramsPer100g: 3.8,
      saltGramsPer100g: 0.01,
    },
  ],
  [
    "broccoli",
    {
      name: "Broccoli steamed",
      category: "vegetable",
      energyKcalPer100g: 35,
      proteinGramsPer100g: 2.4,
      carbsGramsPer100g: 7.2,
      fatGramsPer100g: 0.4,
      fiberGramsPer100g: 3.3,
      sugarGramsPer100g: 1.4,
      saturatedFatGramsPer100g: 0.04,
      saltGramsPer100g: 0.04,
    },
  ],
  [
    "spinach",
    {
      name: "Spinach cooked",
      category: "vegetable",
      energyKcalPer100g: 23,
      proteinGramsPer100g: 3,
      carbsGramsPer100g: 3.8,
      fatGramsPer100g: 0.3,
      fiberGramsPer100g: 2.4,
      sugarGramsPer100g: 0.4,
      saturatedFatGramsPer100g: 0.1,
      saltGramsPer100g: 0.08,
    },
  ],
  [
    "salad",
    {
      name: "Mixed salad greens",
      category: "vegetable",
      energyKcalPer100g: 17,
      proteinGramsPer100g: 1.4,
      carbsGramsPer100g: 3.3,
      fatGramsPer100g: 0.2,
      fiberGramsPer100g: 1.8,
      sugarGramsPer100g: 1.2,
      saturatedFatGramsPer100g: 0.03,
      saltGramsPer100g: 0.03,
    },
  ],
  [
    "darkChocolate",
    {
      name: "Dark chocolate 70%",
      brand: "Seed Treats",
      category: "sweetener",
      energyKcalPer100g: 598,
      proteinGramsPer100g: 7.8,
      carbsGramsPer100g: 45.9,
      fatGramsPer100g: 42.6,
      fiberGramsPer100g: 10.9,
      sugarGramsPer100g: 24,
      saturatedFatGramsPer100g: 24.5,
      saltGramsPer100g: 0.02,
    },
  ],
  [
    "honey",
    {
      name: "Honey",
      category: "sweetener",
      energyKcalPer100g: 304,
      proteinGramsPer100g: 0.3,
      carbsGramsPer100g: 82.4,
      fatGramsPer100g: 0,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 82.1,
      saturatedFatGramsPer100g: 0,
      saltGramsPer100g: 0.01,
    },
  ],
  [
    "sourdough",
    {
      name: "Sourdough bread",
      category: "bread-like",
      energyKcalPer100g: 260,
      proteinGramsPer100g: 8.5,
      carbsGramsPer100g: 51,
      fatGramsPer100g: 1.5,
      fiberGramsPer100g: 2.9,
      sugarGramsPer100g: 2.8,
      saturatedFatGramsPer100g: 0.3,
      saltGramsPer100g: 1.2,
    },
  ],
  [
    "cottageCheese",
    {
      name: "Cottage cheese",
      category: "dairy-egg",
      energyKcalPer100g: 98,
      proteinGramsPer100g: 11.1,
      carbsGramsPer100g: 3.4,
      fatGramsPer100g: 4.3,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 2.7,
      saturatedFatGramsPer100g: 1.7,
      saltGramsPer100g: 0.36,
    },
  ],
  [
    "electrolyteDrink",
    {
      name: "Electrolyte drink",
      brand: "Seed Hydration",
      energyKcalPer100g: 0,
      proteinGramsPer100g: 0,
      carbsGramsPer100g: 0,
      fatGramsPer100g: 0,
      saltGramsPer100g: 0.08,
    },
  ],
  [
    "pizza",
    {
      name: "Frozen pizza slice",
      brand: "Seed Freezer",
      category: "bread-like",
      energyKcalPer100g: 266,
      proteinGramsPer100g: 11,
      carbsGramsPer100g: 33,
      fatGramsPer100g: 10,
      fiberGramsPer100g: 2.3,
      sugarGramsPer100g: 3.5,
      saturatedFatGramsPer100g: 4,
      saltGramsPer100g: 1.2,
    },
  ],
  [
    "proteinBar",
    {
      name: "Protein bar caramel",
      brand: "Seed Sports",
      category: "sweetener",
      energyKcalPer100g: 360,
      proteinGramsPer100g: 32,
      carbsGramsPer100g: 34,
      fatGramsPer100g: 12,
      fiberGramsPer100g: 8,
      sugarGramsPer100g: 4,
      saturatedFatGramsPer100g: 5,
      saltGramsPer100g: 0.4,
    },
  ],
  [
    "granola",
    {
      name: "Granola clusters",
      brand: "Seed Pantry",
      category: "grain",
      energyKcalPer100g: 471,
      proteinGramsPer100g: 10,
      carbsGramsPer100g: 64,
      fatGramsPer100g: 19,
      fiberGramsPer100g: 7,
      sugarGramsPer100g: 18,
      saturatedFatGramsPer100g: 4,
      saltGramsPer100g: 0.2,
    },
  ],
  [
    "seitan",
    {
      name: "Seitan strips",
      category: "plant-protein",
      energyKcalPer100g: 130,
      proteinGramsPer100g: 25,
      carbsGramsPer100g: 5,
      fatGramsPer100g: 2,
      fiberGramsPer100g: 1,
      sugarGramsPer100g: 1,
      saturatedFatGramsPer100g: 0.4,
      saltGramsPer100g: 0.8,
    },
  ],
  [
    "currySauce",
    {
      name: "Coconut milk curry sauce",
      category: "oil-fat",
      energyKcalPer100g: 190,
      proteinGramsPer100g: 2,
      carbsGramsPer100g: 6,
      fatGramsPer100g: 18,
      fiberGramsPer100g: 1.2,
      sugarGramsPer100g: 3,
      saturatedFatGramsPer100g: 15,
      saltGramsPer100g: 0.5,
    },
  ],
  [
    "riceCrackers",
    {
      name: "White rice crackers",
      category: "grain",
      energyKcalPer100g: 387,
      proteinGramsPer100g: 7,
      carbsGramsPer100g: 82,
      fatGramsPer100g: 3,
      fiberGramsPer100g: 1,
      sugarGramsPer100g: 0.5,
      saturatedFatGramsPer100g: 0.6,
      saltGramsPer100g: 0.9,
    },
  ],
  [
    "lentilSoup",
    {
      name: "Lentil soup",
      brand: "Seed Batch Cook",
      category: "legume",
      energyKcalPer100g: 72,
      proteinGramsPer100g: 4.5,
      carbsGramsPer100g: 11,
      fatGramsPer100g: 1.5,
      fiberGramsPer100g: 4,
      sugarGramsPer100g: 1.8,
      saturatedFatGramsPer100g: 0.2,
      saltGramsPer100g: 0.7,
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
  basedOnFoodId: greekYogurtFood.id,
  name: "Greek yogurt 2% low-sugar batch",
  sugarGramsPer100g: 2.1,
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
  readonly quantityGrams: Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["quantityGrams"];
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
const mealNames = [
  "breakfast",
  "lunch",
  "dinner",
] satisfies readonly Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["meal"][];

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
          meal: mealName,
          foodId: entry.foodId,
          quantityGrams: entry.quantityGrams,
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
        dailyLogs: dailyLogs.length,
        foods: foods.length,
        mealEntries: mealEntries.length,
        plans: plans.length,
      },
    },
    source: {
      databaseName: "mai",
      databaseVersion: 3,
      exportedAt: timestampForDateKey({ dateKey: todayDateKey, hour: 12 }),
    },
    stores: {
      activeMealPlanSelections,
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

        totals.energyKcal +=
          ((food.energyKcalPer100g ?? 0) * entry.quantityGrams) / 100;
        totals.proteinGrams +=
          ((food.proteinGramsPer100g ?? 0) * entry.quantityGrams) / 100;
        totals.carbsGrams +=
          ((food.carbsGramsPer100g ?? 0) * entry.quantityGrams) / 100;
        totals.fatGrams +=
          ((food.fatGramsPer100g ?? 0) * entry.quantityGrams) / 100;
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
  mealName: Backup.MaiBackupEncoded["stores"]["mealEntries"][number]["meal"]
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
