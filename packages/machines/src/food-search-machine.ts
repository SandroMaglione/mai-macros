import { Domain, Measurements } from "@mai/nutrition";
import { Array, Order, Schema } from "effect";
import { setup, type ActorRefFrom } from "xstate";
import { EmptyEvent } from "./schemas";

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

export type FoodSearchSelectedEvent = {
  readonly type: "foodSearchSelected";
  readonly food: Domain.Food | null;
  readonly selection: "explicit" | "firstMatching";
};

export type FoodNameGroupLabel = "Newest" | "Older";

export type FoodSearchBaseOrder = "catalog" | "provided";

export type FoodSearchMacroOrder =
  | "carbs"
  | "calorieDensityHigh"
  | "calorieDensityLow"
  | "energy"
  | "fat"
  | "fiber"
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
});

const FoodSearchInputSchema = Schema.Struct({
  baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.optionalKey(Schema.NullOr(FoodSearchMacroOrderSchema)),
  query: Schema.optionalKey(Schema.String),
  selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
});

export type FoodSearchEvent =
  | {
      readonly type: "reset";
      readonly baseOrder?: FoodSearchBaseOrder;
      readonly foods: readonly Domain.Food[];
      readonly query?: string;
      readonly selectedFoodId?: Domain.Food["id"] | null;
    }
  | {
      readonly type: "changeFoods";
      readonly foods: readonly Domain.Food[];
    }
  | {
      readonly type: "changeQuery";
      readonly query: string;
    }
  | {
      readonly type: "changeMacroOrder";
      readonly macroOrder: FoodSearchMacroOrder | null;
    }
  | {
      readonly type: "selectFirstMatchingFood";
    }
  | {
      readonly type: "selectFood";
      readonly foodId: Domain.Food["id"];
    }
  | {
      readonly type: "clearSelectedFood";
    };

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
  FoodSearchMacroOrder,
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
  protein: "descending",
  salt: "descending",
  saturatedFat: "descending",
  sugar: "descending",
} satisfies Record<FoodSearchMacroOrder, "ascending" | "descending">;

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
}: {
  readonly baseOrder: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
}) {
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
}: {
  readonly baseOrder?: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder?: FoodSearchMacroOrder | null;
  readonly query?: string;
  readonly selectedFoodId?: Domain.Food["id"] | null;
}): {
  readonly baseOrder: FoodSearchBaseOrder;
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
  readonly matchingFoods: readonly Domain.Food[];
  readonly query: string;
  readonly selectedFoodId: Domain.Food["id"] | null;
} => ({
  baseOrder,
  foods,
  macroOrder,
  matchingFoods: sortFoodsByMacroOrder({
    baseOrder,
    foods: filterFoodsByQuery({ foods, query }),
    macroOrder,
  }),
  query,
  selectedFoodId:
    selectedFoodId === null
      ? null
      : foods.some((food) => food.id === selectedFoodId)
        ? selectedFoodId
        : null,
});

export const foodSearchMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(FoodSearchContextSchema),
    events: {
      reset: Schema.toStandardSchemaV1(
        Schema.Struct({
          baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
          foods: Schema.Array(Domain.Food),
          query: Schema.optionalKey(Schema.String),
          selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
        })
      ),
      changeFoods: Schema.toStandardSchemaV1(
        Schema.Struct({
          foods: Schema.Array(Domain.Food),
        })
      ),
      changeQuery: Schema.toStandardSchemaV1(
        Schema.Struct({
          query: Schema.String,
        })
      ),
      changeMacroOrder: Schema.toStandardSchemaV1(
        Schema.Struct({
          macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema),
        })
      ),
      selectFirstMatchingFood: Schema.toStandardSchemaV1(EmptyEvent),
      selectFood: Schema.toStandardSchemaV1(
        Schema.Struct({
          foodId: Domain.FoodId,
        })
      ),
      clearSelectedFood: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(FoodSearchInputSchema),
  },
  states: {
    Ready: {},
  },
}).createMachine({
  context: ({ input }) => _foodSearchContextFromInput(input),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        changeFoods: ({ context, event }) => ({
          context: _foodSearchContextFromInput({
            baseOrder: context.baseOrder,
            foods: event.foods,
            macroOrder: context.macroOrder,
            query: context.query,
            selectedFoodId: context.selectedFoodId,
          }),
        }),
        changeMacroOrder: ({ context, event }) => ({
          context: {
            macroOrder: event.macroOrder,
            matchingFoods: sortFoodsByMacroOrder({
              baseOrder: context.baseOrder,
              foods: filterFoodsByQuery({
                foods: context.foods,
                query: context.query,
              }),
              macroOrder: event.macroOrder,
            }),
          },
        }),
        changeQuery: ({ context, event }) => ({
          context: {
            matchingFoods: sortFoodsByMacroOrder({
              baseOrder: context.baseOrder,
              foods: filterFoodsByQuery({
                foods: context.foods,
                query: event.query,
              }),
              macroOrder: context.macroOrder,
            }),
            query: event.query,
          },
        }),
        clearSelectedFood: () => ({
          context: {
            selectedFoodId: null,
          },
        }),
        reset: ({ context, event }) => ({
          context: _foodSearchContextFromInput({
            ...event,
            baseOrder: event.baseOrder ?? context.baseOrder,
          }),
        }),
        selectFirstMatchingFood: ({ context, parent }, enq) => {
          const food = context.matchingFoods[0] ?? null;

          if (parent !== undefined) {
            enq.sendTo(parent, {
              type: "foodSearchSelected",
              food,
              selection: "firstMatching",
            } satisfies FoodSearchSelectedEvent);
          }

          return {
            context: {
              selectedFoodId: context.matchingFoods[0]?.id ?? null,
            },
          };
        },
        selectFood: ({ context, event, parent }, enq) => {
          const food =
            context.foods.find((food) => food.id === event.foodId) ?? null;

          if (parent !== undefined) {
            enq.sendTo(parent, {
              type: "foodSearchSelected",
              food,
              selection: "explicit",
            } satisfies FoodSearchSelectedEvent);
          }

          return {
            context: {
              selectedFoodId: food?.id ?? null,
            },
          };
        },
      },
    },
  },
});

export type FoodSearchActorRef = ActorRefFrom<typeof foodSearchMachine>;
