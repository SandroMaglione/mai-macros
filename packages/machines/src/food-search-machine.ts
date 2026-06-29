import { Domain } from "@mai/nutrition";
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

const FoodSearchContextSchema = Schema.Struct({
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema),
  matchingFoods: Schema.Array(Domain.Food),
  query: Schema.String,
  selectedFoodId: Schema.NullOr(Domain.FoodId),
});

const FoodSearchInputSchema = Schema.Struct({
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.optionalKey(Schema.NullOr(FoodSearchMacroOrderSchema)),
  query: Schema.optionalKey(Schema.String),
  selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
});

export type FoodSearchEvent =
  | {
      readonly type: "reset";
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
  carbs: "carbsGramsPer100g",
  calorieDensityHigh: "energyKcalPer100g",
  calorieDensityLow: "energyKcalPer100g",
  energy: "energyKcalPer100g",
  fat: "fatGramsPer100g",
  fiber: "fiberGramsPer100g",
  protein: "proteinGramsPer100g",
  salt: "saltGramsPer100g",
  saturatedFat: "saturatedFatGramsPer100g",
  sugar: "sugarGramsPer100g",
} satisfies Record<
  FoodSearchMacroOrder,
  | "carbsGramsPer100g"
  | "energyKcalPer100g"
  | "fatGramsPer100g"
  | "fiberGramsPer100g"
  | "proteinGramsPer100g"
  | "saltGramsPer100g"
  | "saturatedFatGramsPer100g"
  | "sugarGramsPer100g"
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
  return Array.sort(foods, foodOriginThenNameOrder);
}

export function sortFoodsByMacroOrder({
  foods,
  macroOrder,
}: {
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
}) {
  const valueOrder =
    macroOrder !== null &&
    foodMacroOrderValueDirection[macroOrder] === "ascending"
      ? Order.Number
      : Order.flip(Order.Number);

  return macroOrder === null
    ? foods
    : Array.sort(
        foods,
        Order.combineAll([
          foodUserOriginOrder,
          Order.mapInput(valueOrder, (food: Domain.Food) => {
            const valueKey = foodMacroOrderValueKey[macroOrder];

            return food[valueKey] ?? 0;
          }),
          foodLowercaseNameOrder,
        ])
      );
}

const _foodSearchContextFromInput = ({
  foods,
  macroOrder = null,
  query = "",
  selectedFoodId = null,
}: {
  readonly foods: readonly Domain.Food[];
  readonly macroOrder?: FoodSearchMacroOrder | null;
  readonly query?: string;
  readonly selectedFoodId?: Domain.Food["id"] | null;
}): {
  readonly foods: readonly Domain.Food[];
  readonly macroOrder: FoodSearchMacroOrder | null;
  readonly matchingFoods: readonly Domain.Food[];
  readonly query: string;
  readonly selectedFoodId: Domain.Food["id"] | null;
} => ({
  foods,
  macroOrder,
  matchingFoods: sortFoodsByMacroOrder({
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
        reset: ({ event }) => ({
          context: _foodSearchContextFromInput(event),
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
