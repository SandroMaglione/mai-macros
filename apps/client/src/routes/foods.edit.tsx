import { FoodSearchMachine } from "@mai/machines";
import { Foods, MealEntries, type Domain } from "@mai/nutrition";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Effect } from "effect";
import { ChevronLeft, Pencil, Save } from "lucide-react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

import {
  AppHeader,
  appHeaderActionClassName,
} from "../lib/components/app-header.tsx";
import { FoodFormFields } from "../lib/components/food-form.tsx";
import { formatFoodNutrientNumber } from "../lib/components/food-nutrient-overview.tsx";
import {
  FoodSearchField,
  FoodSearchResults,
} from "../lib/components/food-search.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { createFoodInputFromFormData } from "../lib/utils.ts";

export const Route = createFileRoute("/foods/edit")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  loader: async () =>
    RuntimeClient.runPromise(
      Effect.gen(function* () {
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const foods = FoodSearchMachine.sortFoodsByOriginAndName({
          foods: yield* foodsService.list(),
        });
        const foodUsage = yield* mealEntriesService.listFoodUsage();

        return {
          foods,
          foodUsage,
        };
      })
    ),
  component: Component,
});

type ReviseFoodOutput =
  | "foodNotFound"
  | {
      readonly food: Domain.Food;
      readonly previousFood: Domain.Food;
    };

type EditFoodsEvent =
  | FoodSearchMachine.FoodSearchSelectedEvent
  | {
      readonly type: "clearSelectedFood";
    }
  | {
      readonly type: "reviseFood";
      readonly input: Foods.ReviseFoodInput;
    };

const editFoodsMachine = setup({
  types: {
    context: {} as {
      readonly foodUsage: readonly MealEntries.MealFoodUsage[];
      readonly foodSearchActor: ActorRefFrom<
        typeof FoodSearchMachine.foodSearchMachine
      >;
      readonly invalidate: () => Promise<void>;
      readonly selectedFood: Domain.Food | null;
    },
    events: {} as EditFoodsEvent,
    input: {} as {
      readonly foods: readonly Domain.Food[];
      readonly foodUsage: readonly MealEntries.MealFoodUsage[];
      readonly invalidate: () => Promise<void>;
    },
  },
  actors: {
    foodSearch: FoodSearchMachine.foodSearchMachine,
    reviseFood: fromPromise<
      ReviseFoodOutput,
      {
        readonly input: Foods.ReviseFoodInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const revisedFood = yield* foods.revise({
            input: input.input,
          });

          return {
            food: revisedFood.food,
            previousFood: revisedFood.previousFood,
          } satisfies ReviseFoodOutput;
        }).pipe(
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("FoodNotFound", () =>
            Effect.promise(() => input.invalidate()).pipe(
              Effect.as("foodNotFound" as const)
            )
          )
        )
      )
    ),
  },
}).createMachine({
  context: ({ input, spawn }) => ({
    foodUsage: input.foodUsage,
    foodSearchActor: spawn("foodSearch", {
      id: "foodSearch",
      input: {
        foods: input.foods,
      },
    }),
    invalidate: input.invalidate,
    selectedFood: null,
  }),
  initial: "Idle",
  on: {
    clearSelectedFood: {
      actions: [
        assign({
          selectedFood: null,
        }),
        sendTo(({ context }) => context.foodSearchActor, {
          type: "clearSelectedFood",
        } satisfies FoodSearchMachine.FoodSearchEvent),
      ],
    },
    foodSearchSelected: {
      actions: assign(({ event }) => ({
        selectedFood: event.food,
      })),
    },
  },
  states: {
    Idle: {
      on: {
        reviseFood: {
          target: "RevisingFood",
        },
      },
    },
    RevisingFood: {
      invoke: {
        src: "reviseFood",
        input: ({ context, event }) => {
          assertEvent(event, "reviseFood");

          return {
            input: event.input,
            invalidate: context.invalidate,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "foodNotFound",
            target: "Idle",
            actions: [
              () => {
                globalThis.alert("Could not find that food.");
              },
              assign({
                selectedFood: null,
              }),
              sendTo(({ context }) => context.foodSearchActor, {
                type: "clearSelectedFood",
              } satisfies FoodSearchMachine.FoodSearchEvent),
            ],
          },
          {
            target: "Idle",
            actions: [
              sendTo(
                ({ context }) => context.foodSearchActor,
                ({ context, event }) => {
                  const output = event.output;
                  const foodSearchSnapshot =
                    context.foodSearchActor.getSnapshot();
                  const currentFoods = foodSearchSnapshot.context.foods;

                  if (output === "foodNotFound") {
                    return {
                      type: "reset",
                      foods: currentFoods,
                      query: foodSearchSnapshot.context.query,
                      selectedFoodId: null,
                    } satisfies FoodSearchMachine.FoodSearchEvent;
                  }

                  const foodsWithRevision =
                    output.food.id === output.previousFood.id
                      ? currentFoods.map((food) =>
                          food.id === output.previousFood.id
                            ? output.food
                            : food
                        )
                      : currentFoods.some((food) => food.id === output.food.id)
                        ? currentFoods.map((food) =>
                            food.id === output.food.id ? output.food : food
                          )
                        : [...currentFoods, output.food];
                  const foods = FoodSearchMachine.sortFoodsByOriginAndName({
                    foods: foodsWithRevision,
                  });

                  return {
                    type: "reset",
                    foods,
                    query: foodSearchSnapshot.context.query,
                    selectedFoodId: null,
                  } satisfies FoodSearchMachine.FoodSearchEvent;
                }
              ),
              assign({
                selectedFood: null,
              }),
            ],
          },
        ],
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert("Could not update the food.");
          },
        },
      },
    },
    Failure: {
      on: {
        reviseFood: {
          target: "RevisingFood",
        },
      },
    },
  },
});

function Component() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [snapshot, send] = useMachine(editFoodsMachine, {
    input: {
      foods: data.foods,
      foodUsage: data.foodUsage,
      invalidate: () => router.invalidate(),
    },
  });
  const disabled = snapshot.matches("RevisingFood");
  const { foodUsage, selectedFood } = snapshot.context;
  const foodHasEntries =
    selectedFood === null
      ? false
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        }) !== undefined;
  const willCreateRevision =
    selectedFood === null
      ? false
      : foodHasEntries || selectedFood.origin === "app-default";
  const revisionMessage =
    selectedFood === null
      ? ""
      : willCreateRevision
        ? selectedFood.origin === "app-default"
          ? "Saving creates your copy. The pre-installed food stays unchanged."
          : "Saving creates a revised copy. Existing logs keep the original food."
        : "Saving replaces this unused food.";
  const submitLabel = willCreateRevision ? "Save revised copy" : "Save food";

  return (
    <main className="h-dvh overflow-hidden bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto grid h-dvh min-h-0 w-full max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] bg-[#090909]">
        <AppHeader
          leading={<BackToDayLink dateKey={search.dateKey} />}
          shadow={true}
          title={selectedFood === null ? "Edit foods" : "Edit food"}
        >
          {selectedFood === null ? (
            <FoodSearchField
              actor={snapshot.context.foodSearchActor}
              ariaControls="edit-food-results"
              ariaLabel="Edit food search"
              autoFocus={false}
              disabled={disabled}
              id="edit-food-search"
              label="Search"
              placeholder="Search food or brand"
              showLabel={false}
            />
          ) : null}
        </AppHeader>

        {selectedFood === null ? (
          <FoodSearchResults
            actor={snapshot.context.foodSearchActor}
            emptyFoodsText="Create a food before editing it."
            emptySearchText="No foods found."
            getPrimaryLabel={(food) =>
              `${formatFoodNutrientNumber({ value: food.energyKcalPer100g })} kcal`
            }
            getSecondaryLabel={(food) =>
              _findFoodUsage({
                foodId: food.id,
                foodUsage,
              }) === undefined
                ? "Unused"
                : "Used"
            }
            id="edit-food-results"
            shape="square"
          />
        ) : (
          <form
            className="contents"
            key={selectedFood.id}
            onSubmit={(event) => {
              event.preventDefault();
              send({
                type: "reviseFood",
                input: {
                  ...createFoodInputFromFormData({
                    formData: new FormData(event.currentTarget),
                  }),
                  foodId: selectedFood.id,
                },
              });
            }}
          >
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
              <div className="grid gap-4">
                <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-sm font-bold leading-snug text-[#aaaab1]">
                  {revisionMessage}
                </p>
                <FoodFormFields
                  autoFocusName={false}
                  disabled={disabled}
                  initialFood={selectedFood}
                />
              </div>
            </div>

            <footer className="grid gap-2 border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button
                aria-label={submitLabel}
                className="btn-primary"
                disabled={disabled}
                type="submit"
              >
                <Save aria-hidden="true" size={16} strokeWidth={3} />
                {submitLabel}
              </button>
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
            </footer>
          </form>
        )}
      </section>
    </main>
  );
}

function BackToDayLink({ dateKey }: { readonly dateKey: string | undefined }) {
  if (dateKey === undefined) {
    return (
      <Link
        aria-label="Back to today"
        className={appHeaderActionClassName}
        title="Back to today"
        to="/"
      >
        <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Back to day"
      className={appHeaderActionClassName}
      params={{ dateKey }}
      title={`Back to ${dateKey}`}
      to="/days/$dateKey"
    >
      <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
    </Link>
  );
}

function _findFoodUsage({
  foodId,
  foodUsage,
}: {
  readonly foodId: Domain.Food["id"];
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
}) {
  return foodUsage.find((usage) => usage.foodId === foodId);
}
