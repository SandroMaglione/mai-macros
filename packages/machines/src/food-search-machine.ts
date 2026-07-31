import { Domain, Measurements } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Order, Schema } from "effect";

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
  "priceHigh",
  "priceLow",
  "protein",
  "salt",
  "saturatedFat",
  "sugar",
]);

const FoodSearchBaseOrderSchema = Schema.Literals(["catalog", "provided"]);

const FoodSearchInputSchema = Schema.Struct({
  baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.optionalKey(Schema.NullOr(FoodSearchMacroOrderSchema)),
  query: Schema.optionalKey(Schema.String),
  selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
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
  Exclude<FoodSearchMacroOrder, "priceHigh" | "priceLow">,
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

export class FoodSearchReady extends Schema.TaggedClass<FoodSearchReady>(
  "FoodSearchReady"
)("FoodSearchReady", {
  baseOrder: FoodSearchBaseOrderSchema,
  foods: Schema.Array(Domain.Food),
  macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema),
  matchingFoods: Schema.Array(Domain.Food),
  query: Schema.String,
  selectedFoodId: Schema.NullOr(Domain.FoodId),
}) {}

export class ResetFoodSearch extends Schema.TaggedClass<ResetFoodSearch>(
  "ResetFoodSearch"
)("ResetFoodSearch", {
  baseOrder: Schema.optionalKey(FoodSearchBaseOrderSchema),
  foods: Schema.Array(Domain.Food),
  query: Schema.optionalKey(Schema.String),
  selectedFoodId: Schema.optionalKey(Schema.NullOr(Domain.FoodId)),
}) {}

export class ChangeFoods extends Schema.TaggedClass<ChangeFoods>("ChangeFoods")(
  "ChangeFoods",
  { foods: Schema.Array(Domain.Food) }
) {}

export class ChangeFoodSearchQuery extends Schema.TaggedClass<ChangeFoodSearchQuery>(
  "ChangeFoodSearchQuery"
)("ChangeFoodSearchQuery", { query: Schema.String }) {}

export class ChangeFoodSearchMacroOrder extends Schema.TaggedClass<ChangeFoodSearchMacroOrder>(
  "ChangeFoodSearchMacroOrder"
)("ChangeFoodSearchMacroOrder", {
  macroOrder: Schema.NullOr(FoodSearchMacroOrderSchema),
}) {}

export class SelectFirstMatchingFood extends Schema.TaggedClass<SelectFirstMatchingFood>(
  "SelectFirstMatchingFood"
)("SelectFirstMatchingFood", {}) {}

export class SelectFood extends Schema.TaggedClass<SelectFood>("SelectFood")(
  "SelectFood",
  { foodId: Domain.FoodId }
) {}

export class ClearSelectedFood extends Schema.TaggedClass<ClearSelectedFood>(
  "ClearSelectedFood"
)("ClearSelectedFood", {}) {}

export class FoodSearchSelected extends Schema.TaggedClass<FoodSearchSelected>(
  "FoodSearchSelected"
)("FoodSearchSelected", {
  food: Schema.NullOr(Domain.Food),
  selection: Schema.Literals(["explicit", "firstMatching"]),
}) {}

export type FoodSearchSelectedEvent = typeof FoodSearchSelected.Type;
export type FoodSearchEvent =
  | typeof ResetFoodSearch.Type
  | typeof ChangeFoods.Type
  | typeof ChangeFoodSearchQuery.Type
  | typeof ChangeFoodSearchMacroOrder.Type
  | typeof SelectFirstMatchingFood.Type
  | typeof SelectFood.Type
  | typeof ClearSelectedFood.Type;

export const FoodSearchStates = Machine.defineStates({
  Ready: FoodSearchReady,
});

const foodSearchEvents = [
  ResetFoodSearch,
  ChangeFoods,
  ChangeFoodSearchQuery,
  ChangeFoodSearchMacroOrder,
  SelectFirstMatchingFood,
  SelectFood,
  ClearSelectedFood,
] as const;

export const foodSearchMachine = Machine.make({
  id: "foodSearch",
  states: FoodSearchStates.states,
  events: foodSearchEvents,
  emits: [FoodSearchSelected],
  input: FoodSearchInputSchema,
  initial: (input) =>
    FoodSearchStates.initial.Ready(
      new FoodSearchReady(_foodSearchContextFromInput(input))
    ),
}).handle({
  Ready: {
    on: {
      ChangeFoods: ({ event, state, target }) =>
        target.full.Ready(
          new FoodSearchReady(
            _foodSearchContextFromInput({
              baseOrder: state.baseOrder,
              foods: event.foods,
              macroOrder: state.macroOrder,
              query: state.query,
              selectedFoodId: state.selectedFoodId,
            })
          )
        ),
      ChangeFoodSearchMacroOrder: ({ event, state, target }) =>
        target.full.Ready(
          new FoodSearchReady({
            ...state,
            macroOrder: event.macroOrder,
            matchingFoods: sortFoodsByMacroOrder({
              baseOrder: state.baseOrder,
              foods: filterFoodsByQuery({
                foods: state.foods,
                query: state.query,
              }),
              macroOrder: event.macroOrder,
            }),
          })
        ),
      ChangeFoodSearchQuery: ({ event, state, target }) =>
        target.full.Ready(
          new FoodSearchReady({
            ...state,
            matchingFoods: sortFoodsByMacroOrder({
              baseOrder: state.baseOrder,
              foods: filterFoodsByQuery({
                foods: state.foods,
                query: event.query,
              }),
              macroOrder: state.macroOrder,
            }),
            query: event.query,
          })
        ),
      ClearSelectedFood: ({ state, target }) =>
        target.full.Ready(
          new FoodSearchReady({ ...state, selectedFoodId: null })
        ),
      ResetFoodSearch: ({ event, state, target }) =>
        target.full.Ready(
          new FoodSearchReady(
            _foodSearchContextFromInput({
              ...event,
              baseOrder: event.baseOrder ?? state.baseOrder,
            })
          )
        ),
      SelectFirstMatchingFood: ({ emit, state, target }) => {
        const food = state.matchingFoods[0] ?? null;
        return emit(
          new FoodSearchSelected({
            food,
            selection: "firstMatching",
          })
        ).pipe(
          Effect.as(
            target.full.Ready(
              new FoodSearchReady({
                ...state,
                selectedFoodId: food?.id ?? null,
              })
            )
          )
        );
      },
      SelectFood: ({ emit, event, state, target }) => {
        const food =
          state.foods.find((food) => food.id === event.foodId) ?? null;
        return emit(
          new FoodSearchSelected({
            food,
            selection: "explicit",
          })
        ).pipe(
          Effect.as(
            target.full.Ready(
              new FoodSearchReady({
                ...state,
                selectedFoodId: food?.id ?? null,
              })
            )
          )
        );
      },
    },
  },
});

export const FoodSearchChild = Machine.child("foodSearch", foodSearchMachine);
export type FoodSearchActorRef = Machine.ChildMachine.Ref<
  typeof FoodSearchChild
>;
export type FoodSearchSnapshot = Machine.Machine.Snapshot<
  typeof FoodSearchStates.states
>;
