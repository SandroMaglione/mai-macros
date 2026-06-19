import type { Food } from "@mai/nutrition";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Effect } from "effect";
import { Apple, Save, X } from "lucide-react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendParent,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

import { FoodFormFields } from "../lib/components/food-form.tsx";
import {
  filterFoodsByQuery,
  FoodSearchField,
  FoodSearchResults,
  sortFoodsByName,
} from "../lib/components/food-search.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { Foods, type ReviseFoodInput } from "../lib/services/foods.ts";
import type { MealFoodUsage } from "../lib/services/meal-entries.ts";
import { MealEntries } from "../lib/services/meal-entries.ts";
import { createFoodInputFromFormData } from "../lib/utils.ts";

export const Route = createFileRoute("/foods/edit")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  loader: async () =>
    RuntimeClient.runPromise(
      Effect.gen(function* () {
        const foodsService = yield* Foods;
        const mealEntriesService = yield* MealEntries;
        const foods = sortFoodsByName({
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
      readonly food: Food;
      readonly previousFood: Food;
    };

type EditFoodDialogEvent =
  | {
      readonly type: "open";
      readonly food: Food;
      readonly foodUsage: readonly MealFoodUsage[];
    }
  | {
      readonly type: "close";
    }
  | {
      readonly type: "submit";
      readonly formData: FormData;
    }
  | {
      readonly type: "submissionSucceeded";
    }
  | {
      readonly type: "submissionFailed";
    };

type EditFoodDialogContext = {
  readonly foodUsage: readonly MealFoodUsage[];
  readonly selectedFood: Food | null;
};

type EditFoodsEvent =
  | {
      readonly type: "changeQuery";
      readonly query: string;
    }
  | {
      readonly type: "openFood";
      readonly foodId: Food["id"];
    }
  | {
      readonly type: "openFirstMatchingFood";
    }
  | {
      readonly type: "reviseFood";
      readonly input: ReviseFoodInput;
    };

const editFoodDialogClosedContext = {
  foodUsage: [],
  selectedFood: null,
} satisfies EditFoodDialogContext;

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const editFoodDialogMachine = setup({
  types: {
    context: {} as EditFoodDialogContext,
    events: {} as EditFoodDialogEvent,
  },
}).createMachine({
  context: editFoodDialogClosedContext,
  initial: "Closed",
  on: {
    close: {
      target: ".Closed",
      actions: assign(editFoodDialogClosedContext),
    },
    open: {
      target: ".Open",
      actions: assign(({ event }) => {
        assertEvent(event, "open");

        return {
          foodUsage: event.foodUsage,
          selectedFood: event.food,
        };
      }),
    },
  },
  states: {
    Closed: {},
    Open: {
      on: {
        submit: {
          target: "Submitting",
          actions: sendParent(({ context, event }) => {
            assertEvent(event, "submit");

            if (context.selectedFood === null) {
              throw new Error("Edit food dialog cannot submit without a food.");
            }

            return {
              type: "reviseFood",
              input: {
                ...createFoodInputFromFormData({
                  formData: event.formData,
                }),
                foodId: context.selectedFood.id,
              },
            } satisfies EditFoodsEvent;
          }),
        },
      },
    },
    Submitting: {
      on: {
        submissionFailed: {
          target: "Open",
        },
        submissionSucceeded: {
          target: "Closed",
          actions: assign(editFoodDialogClosedContext),
        },
      },
    },
  },
});

const editFoodsMachine = setup({
  types: {
    context: {} as {
      readonly editFoodDialogActor: ActorRefFrom<typeof editFoodDialogMachine>;
      readonly foods: readonly Food[];
      readonly foodUsage: readonly MealFoodUsage[];
      readonly invalidate: () => Promise<void>;
      readonly matchingFoods: readonly Food[];
      readonly query: string;
    },
    events: {} as EditFoodsEvent,
    input: {} as {
      readonly foods: readonly Food[];
      readonly foodUsage: readonly MealFoodUsage[];
      readonly invalidate: () => Promise<void>;
    },
  },
  actors: {
    editFoodDialog: editFoodDialogMachine,
    reviseFood: fromPromise<
      ReviseFoodOutput,
      {
        readonly input: ReviseFoodInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods;
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
    editFoodDialogActor: spawn("editFoodDialog", {
      id: "editFoodDialog",
    }),
    foods: input.foods,
    foodUsage: input.foodUsage,
    invalidate: input.invalidate,
    matchingFoods: input.foods,
    query: "",
  }),
  initial: "Idle",
  on: {
    changeQuery: {
      actions: assign(({ context, event }) => {
        assertEvent(event, "changeQuery");
        const matchingFoods = filterFoodsByQuery({
          foods: context.foods,
          query: event.query,
        });

        return {
          matchingFoods,
          query: event.query,
        };
      }),
    },
    openFirstMatchingFood: {
      actions: sendTo(
        ({ context }) => context.editFoodDialogActor,
        ({ context }) => {
          const food = context.matchingFoods[0];

          return food === undefined
            ? {
                type: "close",
              }
            : {
                type: "open",
                food,
                foodUsage: context.foodUsage,
              };
        }
      ),
    },
    openFood: {
      actions: sendTo(
        ({ context }) => context.editFoodDialogActor,
        ({ context, event }) => {
          assertEvent(event, "openFood");
          const food = context.foods.find((food) => food.id === event.foodId);

          return food === undefined
            ? {
                type: "close",
              }
            : {
                type: "open",
                food,
                foodUsage: context.foodUsage,
              };
        }
      ),
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
            target: "FoodNotFound",
            actions: [
              () => {
                globalThis.alert("Could not find that food.");
              },
              sendTo(({ context }) => context.editFoodDialogActor, {
                type: "submissionSucceeded",
              } satisfies EditFoodDialogEvent),
            ],
          },
          {
            target: "Idle",
            actions: [
              assign(({ context, event }) => {
                const output = event.output;

                if (output === "foodNotFound") {
                  return {};
                }

                const foodsWithRevision =
                  output.food.id === output.previousFood.id
                    ? context.foods.map((food) =>
                        food.id === output.previousFood.id ? output.food : food
                      )
                    : context.foods.some((food) => food.id === output.food.id)
                      ? context.foods.map((food) =>
                          food.id === output.food.id ? output.food : food
                        )
                      : [...context.foods, output.food];
                const foods = sortFoodsByName({
                  foods: foodsWithRevision,
                });

                return {
                  foods,
                  matchingFoods: filterFoodsByQuery({
                    foods,
                    query: context.query,
                  }),
                };
              }),
              sendTo(({ context }) => context.editFoodDialogActor, {
                type: "submissionSucceeded",
              } satisfies EditFoodDialogEvent),
            ],
          },
        ],
        onError: {
          target: "Failure",
          actions: [
            () => {
              globalThis.alert("Could not update the food.");
            },
            sendTo(({ context }) => context.editFoodDialogActor, {
              type: "submissionFailed",
            } satisfies EditFoodDialogEvent),
          ],
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
    FoodNotFound: {
      on: {
        reviseFood: {
          target: "RevisingFood",
        },
      },
    },
  },
});

type EditFoodDialogActorRef = ActorRefFrom<typeof editFoodDialogMachine>;

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

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto grid min-h-screen w-full max-w-[520px] grid-rows-[auto_auto_minmax(0,1fr)] bg-[#090909]">
        <header className="sticky top-0 z-30 grid h-[calc(env(safe-area-inset-top)+4.65rem)] grid-cols-[minmax(0,1fr)_auto] items-end gap-3 bg-[#ff5a51] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <div className="flex min-w-0 items-center gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <Apple aria-hidden="true" size={24} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                Foods
              </p>
              <h1 className="truncate text-2xl font-black leading-tight text-white">
                Edit foods
              </h1>
            </div>
          </div>
          <BackToDayLink dateKey={search.dateKey} />
        </header>

        <div className="border-b border-[#29292d] bg-[#161618] p-4">
          <FoodSearchField
            ariaControls="edit-food-results"
            ariaLabel="Edit food search"
            autoFocus
            disabled={disabled}
            id="edit-food-search"
            label="Search"
            onChange={(query) => {
              send({
                type: "changeQuery",
                query,
              });
            }}
            onEnter={() => {
              send({
                type: "openFirstMatchingFood",
              });
            }}
            placeholder="Search food or brand"
            value={snapshot.context.query}
          />
        </div>

        <FoodSearchResults
          emptyFoodsText="Create a food before editing it."
          emptySearchText="No foods found."
          foods={snapshot.context.foods}
          getPrimaryLabel={(food) =>
            `${numberFormatter.format(food.energyKcalPer100g)} kcal`
          }
          getSecondaryLabel={(food) =>
            _findFoodUsage({
              foodId: food.id,
              foodUsage: snapshot.context.foodUsage,
            }) === undefined
              ? "Unused"
              : "Used"
          }
          id="edit-food-results"
          matchingFoods={snapshot.context.matchingFoods}
          onSelectFood={(foodId) => {
            send({
              type: "openFood",
              foodId,
            });
          }}
          selectedFoodId={null}
        />

        <EditFoodDialog actor={snapshot.context.editFoodDialogActor} />
      </section>
    </main>
  );
}

function EditFoodDialog({ actor }: { readonly actor: EditFoodDialogActorRef }) {
  const snapshot = useSelector(actor, (state) => state);
  const { foodUsage, selectedFood } = snapshot.context;

  if (selectedFood === null) {
    return null;
  }

  const disabled = snapshot.matches("Submitting");
  const foodHasEntries =
    _findFoodUsage({
      foodId: selectedFood.id,
      foodUsage,
    }) !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          actor.send({ type: "close" });
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          actor.send({ type: "close" });
        }
      }}
    >
      <section
        aria-labelledby="edit-food-dialog-title"
        aria-modal="true"
        className="mx-auto grid max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#343438] bg-[#161618] text-[#e9e9ed] shadow-2xl shadow-black/60"
        role="dialog"
      >
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#29292d] px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              {foodHasEntries ? "Used food" : "Unused food"}
            </p>
            <h2
              className="truncate text-xl font-black leading-tight text-[#efeff2]"
              id="edit-food-dialog-title"
            >
              Edit food
            </h2>
          </div>
          <button
            aria-label="Close edit food"
            className="inline-flex size-10 items-center justify-center rounded-md border border-[#343438] bg-[#202024] text-[#dedee3] transition-colors hover:bg-[#29292d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45"
            onClick={() => {
              actor.send({ type: "close" });
            }}
            type="button"
          >
            <X aria-hidden="true" size={19} strokeWidth={3} />
          </button>
        </header>

        <form
          className="contents"
          key={selectedFood.id}
          onSubmit={(event) => {
            event.preventDefault();
            actor.send({
              type: "submit",
              formData: new FormData(event.currentTarget),
            });
          }}
        >
          <div className="min-h-0 overflow-y-auto p-4">
            <FoodFormFields
              autoFocusName
              disabled={disabled}
              initialFood={selectedFood}
            />
          </div>

          <footer className="grid border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              aria-label="Save food"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-5 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60"
              disabled={disabled}
              type="submit"
            >
              <Save aria-hidden="true" size={16} strokeWidth={3} />
              Save food
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function BackToDayLink({ dateKey }: { readonly dateKey: string | undefined }) {
  const className =
    "inline-flex size-10 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white no-underline transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  if (dateKey === undefined) {
    return (
      <Link aria-label="Back to today" className={className} to="/">
        <X aria-hidden="true" size={18} strokeWidth={3} />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Back to day"
      className={className}
      params={{ dateKey }}
      to="/days/$dateKey"
    >
      <X aria-hidden="true" size={18} strokeWidth={3} />
    </Link>
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
