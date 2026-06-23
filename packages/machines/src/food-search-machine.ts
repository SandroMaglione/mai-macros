import type { Domain } from "@mai/nutrition";
import { Array, Order } from "effect";
import {
  assertEvent,
  assign,
  sendParent,
  setup,
  type ActorRefFrom,
} from "xstate";

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

type FoodSearchContext = {
  readonly foods: readonly Domain.Food[];
  readonly matchingFoods: readonly Domain.Food[];
  readonly query: string;
  readonly selectedFoodId: Domain.Food["id"] | null;
};

type FoodSearchInput = {
  readonly foods: readonly Domain.Food[];
  readonly query?: string;
  readonly selectedFoodId?: Domain.Food["id"] | null;
};

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

const _foodSearchContextFromInput = ({
  foods,
  query = "",
  selectedFoodId = null,
}: FoodSearchInput): FoodSearchContext => ({
  foods,
  matchingFoods: filterFoodsByQuery({ foods, query }),
  query,
  selectedFoodId:
    selectedFoodId === null
      ? null
      : foods.some((food) => food.id === selectedFoodId)
        ? selectedFoodId
        : null,
});

export const foodSearchMachine = setup({
  types: {
    context: {} as FoodSearchContext,
    events: {} as FoodSearchEvent,
    input: {} as FoodSearchInput,
  },
}).createMachine({
  context: ({ input }) => _foodSearchContextFromInput(input),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        changeFoods: {
          actions: assign(({ context, event }) => {
            assertEvent(event, "changeFoods");

            return _foodSearchContextFromInput({
              foods: event.foods,
              query: context.query,
              selectedFoodId: context.selectedFoodId,
            });
          }),
        },
        changeQuery: {
          actions: assign(({ context, event }) => {
            assertEvent(event, "changeQuery");

            return {
              matchingFoods: filterFoodsByQuery({
                foods: context.foods,
                query: event.query,
              }),
              query: event.query,
            };
          }),
        },
        clearSelectedFood: {
          actions: assign({
            selectedFoodId: null,
          }),
        },
        reset: {
          actions: assign(({ event }) => {
            assertEvent(event, "reset");

            return _foodSearchContextFromInput(event);
          }),
        },
        selectFirstMatchingFood: {
          actions: [
            assign(({ context }) => ({
              selectedFoodId: context.matchingFoods[0]?.id ?? null,
            })),
            sendParent(
              ({ context }) =>
                ({
                  type: "foodSearchSelected",
                  food: context.matchingFoods[0] ?? null,
                  selection: "firstMatching",
                }) satisfies FoodSearchSelectedEvent
            ),
          ],
        },
        selectFood: {
          actions: [
            assign(({ context, event }) => {
              assertEvent(event, "selectFood");
              const food =
                context.foods.find((food) => food.id === event.foodId) ?? null;

              return {
                selectedFoodId: food?.id ?? null,
              };
            }),
            sendParent(({ context, event }) => {
              assertEvent(event, "selectFood");

              return {
                type: "foodSearchSelected",
                food:
                  context.foods.find((food) => food.id === event.foodId) ??
                  null,
                selection: "explicit",
              } satisfies FoodSearchSelectedEvent;
            }),
          ],
        },
      },
    },
  },
});

export type FoodSearchActorRef = ActorRefFrom<typeof foodSearchMachine>;
