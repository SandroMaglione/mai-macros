import {
  calculateEntryNutrients,
  DateKey,
  type Food,
  Meal,
  QuantityGrams,
} from "@mai/nutrition";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Order, Schema } from "effect";
import { ChevronLeft, Pencil } from "lucide-react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

import { FoodNutrientOverview } from "../lib/components/food-nutrient-overview.tsx";
import {
  FoodDefaultOriginDot,
  FoodSearchField,
  FoodSearchResults,
} from "../lib/components/food-search.tsx";
import {
  AppHeader,
  appHeaderActionClassName,
} from "../lib/components/app-header.tsx";
import {
  foodLowercaseNameOrder,
  foodSearchMachine,
  foodUserOriginOrder,
  type FoodSearchEvent,
  type FoodSearchSelectedEvent,
} from "../lib/machines/food-search-machine.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import {
  MealEntries,
  type CreateMealEntryInput,
  type MealFoodUsage,
} from "@mai/nutrition/services/meal-entries";
import { dateKeyFromDate } from "../lib/utils.ts";

type AddMealFoodPageData = {
  readonly dateKey: DateKey;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly meal: Meal;
};

type AddMealFoodPageEvent =
  | FoodSearchSelectedEvent
  | {
      readonly type: "changeQuantity";
      readonly quantityGrams: string;
    }
  | {
      readonly type: "clearSelectedFood";
    }
  | {
      readonly type: "submit";
    };

type AddMealFoodPageContext = {
  readonly dateKey: DateKey;
  readonly foodSearchActor: ActorRefFrom<typeof foodSearchMachine>;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly meal: Meal;
  readonly navigate: UseNavigateResult<string>;
  readonly quantityGrams: string;
  readonly selectedFood: Food | null;
};

type AddMealFoodPageInput = AddMealFoodPageData & {
  readonly navigate: UseNavigateResult<string>;
};

const mealLabels = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
} satisfies Record<Meal, string>;

const darkFieldClassName =
  "min-h-10 w-full border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

export const Route = createFileRoute("/days/$dateKey_/meals/$meal/add")({
  loader: async ({ params }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dateKey = yield* Schema.decodeEffect(DateKey)(params.dateKey);
        const meal = yield* Schema.decodeUnknownEffect(Meal)(params.meal);
        const dailyLogs = yield* DailyLogs;
        const foodsService = yield* Foods;
        const mealEntriesService = yield* MealEntries;
        const day = yield* dailyLogs.open({
          input: {
            dateKey,
          },
        });
        const foods = yield* foodsService.list();
        const foodUsage = yield* mealEntriesService.listFoodUsage();

        return {
          _tag: "Ready" as const,
          data: {
            dateKey: day.dailyLog.dateKey,
            foodUsage,
            foods,
            meal,
          },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", ({ dateKey }) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            dateKey,
          })
        ),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({
            _tag: "InvalidRoute" as const,
          })
        )
      )
    );

    if (result._tag === "InvalidRoute") {
      throw redirect({ to: "/" });
    }

    if (result._tag === "NoMealPlans") {
      throw redirect({
        to: "/plans/new",
        search: {
          dateKey: result.dateKey,
        },
      });
    }

    return result.data;
  },
  component: Component,
});

const addMealFoodPageMachine = setup({
  types: {
    context: {} as AddMealFoodPageContext,
    events: {} as AddMealFoodPageEvent,
    input: {} as AddMealFoodPageInput,
  },
  actors: {
    addMealEntry: fromPromise<
      "added" | "foodNotFound",
      {
        readonly input: CreateMealEntryInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries;
          yield* mealEntries.create({
            input: input.input,
          });
          return "added" as const;
        }).pipe(
          Effect.catchTag("FoodNotFound", () =>
            Effect.succeed("foodNotFound" as const)
          )
        )
      )
    ),
    foodSearch: foodSearchMachine,
  },
}).createMachine({
  context: ({ input, spawn }) => {
    const mealFoodRecencyOrder = Order.mapInput(
      Order.flip(Order.Number),
      (food: Food) =>
        _findFoodUsage({
          foodId: food.id,
          foodUsage: input.foodUsage,
        })?.meals.find((usage) => usage.meal === input.meal)?.latestUsedAt
          .epochMilliseconds ?? Number.NEGATIVE_INFINITY
    );

    return {
      dateKey: input.dateKey,
      foodSearchActor: spawn("foodSearch", {
        id: "addMealFoodPageFoodSearch",
        input: {
          foods: Array.sortBy(
            mealFoodRecencyOrder,
            foodUserOriginOrder,
            foodLowercaseNameOrder
          )(input.foods),
        },
      }),
      foodUsage: input.foodUsage,
      meal: input.meal,
      navigate: input.navigate,
      quantityGrams: "",
      selectedFood: null,
    };
  },
  initial: "SelectingFood",
  states: {
    SelectingFood: {
      on: {
        foodSearchSelected: {
          target: "EnteringQuantity",
          actions: assign(({ context, event }) => {
            const selectedFood =
              event.selection === "firstMatching"
                ? (event.food ?? context.selectedFood)
                : event.food;
            const foodUsage =
              event.food === null
                ? undefined
                : _findFoodUsage({
                    foodId: event.food.id,
                    foodUsage: context.foodUsage,
                  });
            const previousQuantityGrams = context.quantityGrams.trim();
            const recentQuantityGrams =
              event.food === null
                ? context.quantityGrams
                : foodUsage === undefined
                  ? ""
                  : Number.isInteger(foodUsage.latestQuantityGrams)
                    ? `${foodUsage.latestQuantityGrams}`
                    : `${_formatPreciseNumber({
                        value: foodUsage.latestQuantityGrams,
                      })}`;
            const quantityGrams =
              event.selection === "firstMatching" &&
              (event.food === null || previousQuantityGrams !== "")
                ? context.quantityGrams
                : recentQuantityGrams;

            return {
              quantityGrams,
              selectedFood,
            };
          }),
        },
      },
    },
    EnteringQuantity: {
      on: {
        changeQuantity: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeQuantity");

            return {
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        clearSelectedFood: {
          target: "SelectingFood",
          actions: [
            assign({
              selectedFood: null,
            }),
            sendTo(({ context }) => context.foodSearchActor, {
              type: "clearSelectedFood",
            } satisfies FoodSearchEvent),
          ],
        },
        submit: {
          guard: ({ context }) =>
            context.selectedFood !== null &&
            context.quantityGrams.trim() !== "",
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "addMealEntry",
        input: ({ context }) => {
          if (context.selectedFood === null) {
            throw new Error("Add food page cannot submit incomplete input.");
          }

          return {
            input: {
              dateKey: context.dateKey,
              foodId: context.selectedFood.id,
              meal: context.meal,
              quantityGrams: context.quantityGrams,
            },
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "foodNotFound",
            target: "EnteringQuantity",
            actions: () => {
              globalThis.alert("Could not find that food.");
            },
          },
          {
            target: "Submitted",
            actions: ({ context }) => {
              const today = dateKeyFromDate({ date: new Date() });

              void (context.dateKey === today
                ? context.navigate({ to: "/" })
                : context.navigate({
                    params: {
                      dateKey: context.dateKey,
                    },
                    to: "/days/$dateKey",
                  }));
            },
          },
        ],
        onError: {
          target: "EnteringQuantity",
          actions: () => {
            globalThis.alert("Could not add the meal entry.");
          },
        },
      },
    },
    Submitted: {},
  },
});

type AddMealFoodPageActorRef = ActorRefFrom<typeof addMealFoodPageMachine>;

function Component() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [snapshot, send, addMealFoodPageActor] = useMachine(
    addMealFoodPageMachine,
    {
      input: {
        ...data,
        navigate,
      },
    }
  );
  const { dateKey, foodSearchActor, foodUsage, meal, quantityGrams } =
    snapshot.context;
  const selectedFood = snapshot.context.selectedFood;
  const disabled =
    snapshot.matches("Submitting") || snapshot.matches("Submitted");
  const submitEvent = { type: "submit" } satisfies AddMealFoodPageEvent;
  const mealLabel = mealLabels[meal];
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        });
  const selectedFoodQuantityLabel =
    selectedFoodUsage === undefined
      ? "No previous"
      : `${_formatPreciseNumber({
          value: selectedFoodUsage.latestQuantityGrams,
        })} g previous`;
  const selectedFoodNutrients =
    selectedFood === null
      ? undefined
      : Schema.decodeOption(QuantityGrams)(Number(quantityGrams)).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (validatedQuantityGrams) =>
              calculateEntryNutrients({
                food: selectedFood,
                quantityGrams: validatedQuantityGrams,
              }),
          })
        );

  return (
    <main className="h-dvh overflow-hidden bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto grid h-dvh min-h-0 w-full max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] bg-[#090909]">
        <AppHeader
          leading={
            <Link
              aria-label={`Back to ${dateKey}`}
              className={appHeaderActionClassName}
              params={{ dateKey }}
              title={`Back to ${dateKey}`}
              to="/days/$dateKey"
            >
              <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
          }
          shadow={true}
          title={mealLabel}
        >
          {selectedFood === null ? (
            <FoodSearchField
              actor={foodSearchActor}
              ariaControls="add-food-page-results"
              ariaLabel={`${mealLabel} food search`}
              autoFocus={true}
              disabled={disabled}
              id="add-food-page-search"
              label="Search"
              placeholder="Search food or brand"
              showLabel={false}
            />
          ) : null}
        </AppHeader>

        {selectedFood === null ? (
          <FoodSearchResults
            actor={foodSearchActor}
            emptyFoodsText="Create a food before logging this meal."
            emptySearchText="No foods found."
            getPrimaryLabel={(food) => {
              const foodHistory = _findFoodUsage({
                foodId: food.id,
                foodUsage,
              });
              const nutrients =
                foodHistory === undefined
                  ? undefined
                  : calculateEntryNutrients({
                      food,
                      quantityGrams: foodHistory.latestQuantityGrams,
                    });

              return nutrients === undefined
                ? "New"
                : `${_formatPreciseNumber({
                    value: nutrients.energyKcal,
                  })} kcal`;
            }}
            getSecondaryLabel={(food) => {
              const foodHistory = _findFoodUsage({
                foodId: food.id,
                foodUsage,
              });

              return foodHistory === undefined
                ? "No previous"
                : `${_formatPreciseNumber({
                    value: foodHistory.latestQuantityGrams,
                  })} g`;
            }}
            id="add-food-page-results"
            shape="square"
          />
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();

              if (disabled || !snapshot.can(submitEvent)) {
                return;
              }

              send(submitEvent);
            }}
          >
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
              <div className="grid gap-4">
                <QuantityGramsField
                  actor={addMealFoodPageActor}
                  autoFocus={true}
                  disabled={disabled}
                  mealLabel={mealLabel}
                  quantityGrams={quantityGrams}
                />
                <FoodNutrientOverview
                  brand={selectedFood.brand}
                  name={selectedFood.name}
                  namePrefix={<FoodDefaultOriginDot food={selectedFood} />}
                  nutrients={selectedFoodNutrients}
                  secondaryLabel={selectedFoodQuantityLabel}
                />
              </div>
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button
                className="btn-secondary"
                disabled={disabled}
                onClick={() => {
                  send({
                    type: "clearSelectedFood",
                  });
                }}
                type="button"
              >
                <Pencil aria-hidden="true" size={16} strokeWidth={3} />
                Change food
              </button>
              <button
                aria-label={`Add food to ${mealLabel}`}
                className="btn-primary"
                disabled={disabled || !snapshot.can(submitEvent)}
                type="submit"
              >
                Add
              </button>
            </footer>
          </form>
        )}
      </section>
    </main>
  );
}

function QuantityGramsField({
  actor,
  autoFocus,
  disabled,
  mealLabel,
  quantityGrams,
}: {
  readonly actor: AddMealFoodPageActorRef;
  readonly autoFocus: boolean;
  readonly disabled: boolean;
  readonly mealLabel: string;
  readonly quantityGrams: string;
}) {
  return (
    <label className={darkFieldLabelClassName}>
      Grams
      <span className="relative">
        <input
          aria-label={`${mealLabel} quantity in grams`}
          autoFocus={autoFocus}
          className={`${darkFieldClassName} pr-9`}
          disabled={disabled}
          min="0.1"
          onChange={(event) => {
            actor.send({
              type: "changeQuantity",
              quantityGrams: event.currentTarget.value,
            });
          }}
          placeholder="150"
          required
          step="0.01"
          type="number"
          value={quantityGrams}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
          g
        </span>
      </span>
    </label>
  );
}

function _findFoodUsage({
  foodId,
  foodUsage,
}: {
  readonly foodId: Food["id"];
  readonly foodUsage: readonly MealFoodUsage[];
}) {
  return foodUsage.find((usage) => usage.foodId === foodId);
}

function _formatPreciseNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}
