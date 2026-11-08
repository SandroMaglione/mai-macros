import { Domain, Measurements } from "@mai/nutrition";
import { Array, HashSet, Order, Schema } from "effect";
import { Machine } from "@typeonce/effect-machine";

const foodCategoryLabels = {
  "bread-like": "Bread-like",
  "dairy-egg": "Dairy & egg",
  "fish-seafood": "Fish & seafood",
  fruit: "Fruit",
  grain: "Grain",
  legume: "Legume",
  meat: "Meat",
  nut: "Nut",
  "oil-fat": "Oil & fat",
  "plant-protein": "Plant protein",
  seed: "Seed",
  sweetener: "Sweetener",
  tuber: "Tuber",
  vegetable: "Vegetable",
} satisfies Record<Domain.FoodCategory, string>;

export type FoodNameGroupLabel = "Newest" | "Older";

export type FoodSearchBaseOrder = "catalog" | "provided";

export type FoodSearchMacroOrder =
  | "carbs"
  | "calorieDensityHigh"
  | "calorieDensityLow"
  | "energy"
  | "fat"
  | "fiber"
  | "priceCoverage"
  | "priceHigh"
  | "priceLow"
  | "protein"
  | "salt"
  | "saturatedFat"
  | "sugar";

const FoodSearchMacroOrderSchema = Schema.Literals([
  "carbs",
  "calorieDensityHigh",
  "calorieDensityLow",
  "energy",
  "fat",
  "fiber",
  "priceCoverage",
  "priceHigh",
  "priceLow",
  "protein",
  "salt",
  "saturatedFat",
  "sugar",
]);

const FoodSearchBaseOrderSchema = Schema.Literals(["catalog", "provided"]);

const FoodSearchContextSchema = Schema.Struct({
  baseOrder: FoodSearchBaseOrderSchema,
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema),
  matchingFoods: Schema.Array(Domain.Food),
  query: Schema.String,
  selectedFoodId: Schema.NullOr(Domain.FoodId),
  usedFoodIds: Schema.Array(Domain.FoodId),
});

const FoodSearchInputSchema = Schema.Struct({
  baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.optionalKey(Schema.NullOr(FoodSearchMacroOrderSchema)),
  query: Schema.optionalKey(Schema.String),
  selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
  usedFoodIds: Schema.optionalKey(Schema.Array(Domain.FoodId)),
});

export const foodUserOriginOrder = Order.mapInput(
  Order.Number,
  (food: Domain.Food) => (food.origin === "user" ? 0 : 1)
);
export const foodLowercaseNameOrder = Order.mapInput(
  Order.String,
  (food: Domain.Food) => food.name.toLocaleLowerCase()
);
const foodOriginThenNameOrder = Order.combineAll([
  foodUserOriginOrder,
  foodLowercaseNameOrder,
]);
const foodMacroOrderValueKey = {
  carbs: "carbsGrams",
  calorieDensityHigh: "energyKcal",
  calorieDensityLow: "energyKcal",
  energy: "energyKcal",
  fat: "fatGrams",
  fiber: "fiberGrams",
  protein: "proteinGrams",
  salt: "saltGrams",
  saturatedFat: "saturatedFatGrams",
  sugar: "sugarGrams",
} satisfies Record<
  Exclude<FoodSearchMacroOrder, "priceCoverage" | "priceHigh" | "priceLow">,
  | "carbsGrams"
  | "energyKcal"
  | "fatGrams"
  | "fiberGrams"
  | "proteinGrams"
  | "saltGrams"
  | "saturatedFatGrams"
  | "sugarGrams"
>;

const foodMacroOrderValueDirection = {
  carbs: "descending",
  calorieDensityHigh: "descending",
  calorieDensityLow: "ascending",
  energy: "descending",
  fat: "descending",
  fiber: "descending",
  priceHigh: "descending",
  priceLow: "ascending",
  protein: "descending",
  salt: "descending",
  saturatedFat: "descending",
  sugar: "descending",
} satisfies Record<
  Exclude<FoodSearchMacroOrder, "priceCoverage">,
  "ascending" | "descending"
>;

export function getFoodCategoryLabel({
  category,
}: {
  readonly category: Domain.FoodCategory;
}) {
  return foodCategoryLabels[category];
}

export function filterFoodsByQuery({
  foods,
  query,
}: {
  readonly foods: readonly Domain.Food[];
  readonly query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryTokens =
    normalizedQuery === "" ? [] : normalizedQuery.split(/\s+/);

  return Array.isReadonlyArrayNonEmpty(queryTokens)
    ? foods.filter((food) => {
        const searchableFood = [
          food.name,
          food.brand,
          food.category,
          food.category === undefined
            ? undefined
            : getFoodCategoryLabel({ category: food.category }),
          food.origin === "app-default" ? "pre-installed default" : undefined,
        ]
          .filter((value): value is string => value !== undefined)
          .join(" ")
          .toLocaleLowerCase();

        return queryTokens.every((queryToken) =>
          searchableFood.includes(queryToken)
        );
      })
    : foods;
}

export function sortFoodsByOriginAndName({
  foods,
}: {
  readonly foods: readonly Domain.Food[];
}) {
  return [...foods].sort((left, right) => {
    if (_foodsShareNameGroup({ left, right })) {
      return _compareFoodsNewestFirst({ left, right });
    }

    return foodOriginThenNameOrder(left, right);
  });
}

export function getFoodNameGroupLabel({
  food,
  foods,
}: {
  readonly food: Domain.Food;
  readonly foods: readonly Domain.Food[];
}): FoodNameGroupLabel | null {
  const group = foods.filter((candidate) =>
    _foodsShareNameGroup({ left: candidate, right: food })
  );

  if (group.length <= 1) {
    return null;
  }

  const newestFood = [...group].sort((left, right) =>
    _compareFoodsNewestFirst({ left, right })
  )[0];

  return newestFood?.id === food.id ? "Newest" : "Older";
}

export function sortFoodsByMacroOrder({
  baseOrder,
  foods,
  macroOrder,
  usedFoodIds = [],
}: {
  readonly baseOrder: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
  readonly usedFoodIds?: readonly Domain.FoodId[];
}) {
  if (macroOrder === "priceCoverage") {
    const usedFoodIdSet = HashSet.fromIterable(usedFoodIds);

    return [...foods].sort((left, right) => {
      const groupDifference =
        _foodPriceCoverageGroup({ food: left, usedFoodIdSet }) -
        _foodPriceCoverageGroup({ food: right, usedFoodIdSet });

      if (groupDifference !== 0) {
        return groupDifference;
      }

      const nameDifference = foodLowercaseNameOrder(left, right);

      return nameDifference === 0
        ? left.id.localeCompare(right.id)
        : nameDifference;
    });
  }

  const valueOrder =
    macroOrder !== null &&
    foodMacroOrderValueDirection[macroOrder] === "ascending"
      ? Order.Number
      : Order.flip(Order.Number);

  return macroOrder === null
    ? baseOrder === "provided"
      ? foods
      : sortFoodsByOriginAndName({ foods })
    : Array.sort(
        foods,
        Order.combineAll([
          foodUserOriginOrder,
          Order.mapInput(valueOrder, (food: Domain.Food) => {
            if (macroOrder === "priceHigh" || macroOrder === "priceLow") {
              const currentEuroPrice = food.prices.find(
                (price) => price.isCurrent && price.currency === "EUR"
              );

              if (currentEuroPrice === undefined) {
                return macroOrder === "priceLow"
                  ? Number.POSITIVE_INFINITY
                  : Number.NEGATIVE_INFINITY;
              }

              return (
                currentEuroPrice.priceMinor /
                Measurements.baseMeasurementAmount({
                  quantity: currentEuroPrice.referenceQuantity,
                })
              );
            }

            const valueKey = foodMacroOrderValueKey[macroOrder];
            const referenceBaseAmount = Measurements.baseMeasurementAmount({
              quantity: food.nutritionReference,
            });

            return (food[valueKey] ?? 0) / referenceBaseAmount;
          }),
          foodLowercaseNameOrder,
        ])
      );
}

function _foodsShareNameGroup({
  left,
  right,
}: {
  readonly left: Domain.Food;
  readonly right: Domain.Food;
}) {
  return (
    _normalizeFoodNameGroupValue(left.name) ===
      _normalizeFoodNameGroupValue(right.name) &&
    _normalizeFoodNameGroupValue(left.brand ?? "") ===
      _normalizeFoodNameGroupValue(right.brand ?? "")
  );
}

function _foodPriceCoverageGroup({
  food,
  usedFoodIdSet,
}: {
  readonly food: Domain.Food;
  readonly usedFoodIdSet: HashSet.HashSet<Domain.FoodId>;
}) {
  const hasCurrentPrice = food.prices.some((price) => price.isCurrent);
  const wasUsed = HashSet.has(usedFoodIdSet, food.id);

  if (!hasCurrentPrice) {
    return wasUsed ? 0 : 1;
  }

  return wasUsed ? 2 : 3;
}

function _normalizeFoodNameGroupValue(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

function _compareFoodsNewestFirst({
  left,
  right,
}: {
  readonly left: Domain.Food;
  readonly right: Domain.Food;
}) {
  const createdAtDifference =
    right.createdAt.epochMilliseconds - left.createdAt.epochMilliseconds;

  return createdAtDifference === 0
    ? right.id.localeCompare(left.id)
    : createdAtDifference;
}

const _foodSearchContextFromInput = ({
  baseOrder = "catalog",
  foods,
  macroOrder = null,
  query = "",
  selectedFoodId = null,
  usedFoodIds = [],
}: {
  readonly baseOrder?: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder?: FoodSearchMacroOrder | null;
  readonly query?: string;
  readonly selectedFoodId?: Domain.Food["id"] | null;
  readonly usedFoodIds?: readonly Domain.FoodId[];
}): {
  readonly baseOrder: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
  readonly matchingFoods: readonly Domain.Food[];
  readonly query: string;
  readonly selectedFoodId: Domain.Food["id"] | null;
  readonly usedFoodIds: readonly Domain.FoodId[];
} => ({
  baseOrder,
  foods,
  macroOrder,
  matchingFoods: sortFoodsByMacroOrder({
    baseOrder,
    foods: filterFoodsByQuery({ foods, query }),
    macroOrder,
    usedFoodIds,
  }),
  query,
  selectedFoodId:
    selectedFoodId === null
      ? null
      : foods.some((food) => food.id === selectedFoodId)
        ? selectedFoodId
        : null,
  usedFoodIds,
});

export const FoodSearchParentEvents = Machine.events({
  FoodSearchSelected: {
    food: Schema.NullOr(Domain.Food),
    selection: Schema.Literals(["explicit", "firstMatching"]),
  },
});

export const FoodSearchEvents = Machine.events({
  Reset: {
    baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
    foods: Schema.Array(Domain.Food),
    query: Schema.optionalKey(Schema.String),
    selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
    usedFoodIds: Schema.optionalKey(Schema.Array(Domain.FoodId)),
  },
  ChangeFoods: { foods: Schema.Array(Domain.Food) },
  ChangeQuery: { query: Schema.String },
  ChangeMacroOrder: { macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema) },
  SelectFirstMatchingFood: {},
  SelectFood: { foodId: Domain.FoodId },
  ClearSelectedFood: {},
});

export const FoodSearchStates = Machine.state({
  fields: FoodSearchContextSchema.fields,
});

export const FoodSearchMachine = Machine.make({
  id: "FoodSearch",
  root: FoodSearchStates,
  events: FoodSearchEvents,
  input: FoodSearchInputSchema,
  parent: Machine.optionalParent(FoodSearchParentEvents),
  branches: {
    selectFood: { selected: { update: "root" } },
  },
}).handle({
  root: ({ input }) => _foodSearchContextFromInput(input),
  on: {
    ChangeFoods: {
      update: "root",
      data: ({ root, event }) =>
        _foodSearchContextFromInput({ ...root, foods: event.foods }),
    },
    ChangeMacroOrder: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        macroOrder: event.macroOrder,
        matchingFoods: sortFoodsByMacroOrder({
          baseOrder: root.baseOrder,
          foods: filterFoodsByQuery({ foods: root.foods, query: root.query }),
          macroOrder: event.macroOrder,
          usedFoodIds: root.usedFoodIds,
        }),
      }),
    },
    ChangeQuery: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        matchingFoods: sortFoodsByMacroOrder({
          baseOrder: root.baseOrder,
          foods: filterFoodsByQuery({ foods: root.foods, query: event.query }),
          macroOrder: root.macroOrder,
          usedFoodIds: root.usedFoodIds,
        }),
        query: event.query,
      }),
    },
    ClearSelectedFood: {
      update: "root",
      data: ({ root }) => ({ ...root, selectedFoodId: null }),
    },
    Reset: {
      update: "root",
      data: ({ root, event }) =>
        _foodSearchContextFromInput({
          ...event,
          baseOrder: event.baseOrder ?? root.baseOrder,
          usedFoodIds: event.usedFoodIds ?? root.usedFoodIds,
        }),
    },
    SelectFirstMatchingFood: {
      branches: "selectFood",
      resolve: ({ root, parent, select }, enqueue) => {
        const food = root.matchingFoods[0] ?? null;

        if (parent !== undefined) {
          enqueue.sendTo(
            parent,
            FoodSearchParentEvents.FoodSearchSelected({
              food,
              selection: "firstMatching",
            })
          );
        }

        return select.selected({
          data: { ...root, selectedFoodId: food?.id ?? null },
        });
      },
    },
    SelectFood: {
      branches: "selectFood",
      resolve: ({ root, event, parent, select }, enqueue) => {
        const food =
          root.foods.find((candidate) => candidate.id === event.foodId) ?? null;

        if (parent !== undefined) {
          enqueue.sendTo(
            parent,
            FoodSearchParentEvents.FoodSearchSelected({
              food,
              selection: "explicit",
            })
          );
        }

        return select.selected({
          data: { ...root, selectedFoodId: food?.id ?? null },
        });
      },
    },
  },
});

export const FoodSearchChild = Machine.child("foodSearch", FoodSearchMachine);
