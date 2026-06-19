import {
  calculateEntryNutrients,
  calculatePlanEnergyKcal,
  type DateKey,
  type Food,
  type Meal,
  type MealEntry,
  QuantityGrams,
} from "@mai/nutrition";
import { Link, useRouter } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array, Effect, Option, Schema } from "effect";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRef } from "react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendParent,
  sendTo,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";

import { RuntimeClient } from "../runtime-client.ts";
import type { ChangeDayPlanInput, OpenedDay } from "../services/daily-logs.ts";
import { DailyLogs } from "../services/daily-logs.ts";
import type {
  CreateMealEntryInput,
  DeleteMealEntryInput,
  MealFoodUsage,
  ReviseMealEntryInput,
} from "../services/meal-entries.ts";
import { MealEntries } from "../services/meal-entries.ts";
import { shiftDateKey } from "../utils.ts";

export type DailyLogViewData = {
  readonly day: OpenedDay;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
};

type NutrientTotals = ReturnType<typeof calculateEntryNutrients>;
type MacroTone = "protein" | "carbs" | "fat";
type DailyNutrientTone = "carbs" | "fat" | "salt";
type AddMealFoodDialogMode = "create" | "revise";

const macroToneClassNames: Record<
  MacroTone,
  {
    readonly bar: string;
    readonly text: string;
    readonly track: string;
  }
> = {
  carbs: {
    bar: "bg-[#ff4f8b]",
    text: "text-[#ff4f8b]",
    track: "bg-[#4a2031]",
  },
  fat: {
    bar: "bg-[#ffbd35]",
    text: "text-[#ffbd35]",
    track: "bg-[#443719]",
  },
  protein: {
    bar: "bg-[#4c7dff]",
    text: "text-[#4c7dff]",
    track: "bg-[#233059]",
  },
};
const dailyNutrientToneClassNames: Record<
  DailyNutrientTone,
  {
    readonly bar: string;
    readonly text: string;
    readonly track: string;
  }
> = {
  carbs: macroToneClassNames.carbs,
  fat: macroToneClassNames.fat,
  salt: {
    bar: "bg-[#aaaab1]",
    text: "text-[#aaaab1]",
    track: "bg-[#303034]",
  },
};
const dailyNutrientNoTargetClassNames = {
  bar: "bg-[#4a4a50]",
  text: "text-[#8d8d95]",
  track: "bg-[#2b2b30]",
};
const actionColorClassName = "text-[#ff5a51]";
const headerActionClassName =
  "inline-flex size-12 items-center justify-center rounded-full text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const planActionClassName = `${actionColorClassName} inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-[#3d2827] bg-[#241918] no-underline transition-colors hover:bg-[#2c1d1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45`;
const darkFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

const mealOptions: readonly {
  readonly value: Meal;
  readonly label: string;
}[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

type AddMealFoodDialogEvent =
  | {
      readonly type: "open";
      readonly dateKey: DateKey;
      readonly foodUsage: readonly MealFoodUsage[];
      readonly foods: readonly Food[];
      readonly meal: Meal;
    }
  | {
      readonly type: "openMealEntry";
      readonly foodUsage: readonly MealFoodUsage[];
      readonly foods: readonly Food[];
      readonly mealEntry: MealEntry;
    }
  | {
      readonly type: "close";
    }
  | {
      readonly type: "changeQuery";
      readonly query: string;
    }
  | {
      readonly type: "selectFood";
      readonly foodId: Food["id"];
    }
  | {
      readonly type: "selectFirstMatchingFood";
    }
  | {
      readonly type: "changeQuantity";
      readonly quantityGrams: string;
    }
  | {
      readonly type: "submit";
    }
  | {
      readonly type: "deleteEntry";
    }
  | {
      readonly type: "submissionSucceeded";
    }
  | {
      readonly type: "submissionFailed";
    };

type AddMealFoodDialogContext = {
  readonly canSubmit: boolean;
  readonly dateKey: DateKey | null;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly matchingFoods: readonly Food[];
  readonly meal: Meal | null;
  readonly mealEntry: MealEntry | null;
  readonly mode: AddMealFoodDialogMode;
  readonly query: string;
  readonly quantityGrams: string;
  readonly selectedFood: Food | null;
};

type DailyLogEvent =
  | {
      readonly type: "addMealEntry";
      readonly input: CreateMealEntryInput;
    }
  | {
      readonly type: "reviseMealEntry";
      readonly input: ReviseMealEntryInput;
    }
  | {
      readonly type: "deleteMealEntry";
      readonly input: DeleteMealEntryInput;
    }
  | {
      readonly type: "changePlan";
      readonly input: ChangeDayPlanInput;
    };

const addMealFoodDialogClosedContext = {
  canSubmit: false,
  dateKey: null,
  foodUsage: [],
  foods: [],
  matchingFoods: [],
  meal: null,
  mealEntry: null,
  mode: "create",
  query: "",
  quantityGrams: "",
  selectedFood: null,
} satisfies AddMealFoodDialogContext;

const addMealFoodDialogMachine = setup({
  types: {
    context: {} as AddMealFoodDialogContext,
    events: {} as AddMealFoodDialogEvent,
  },
}).createMachine({
  context: addMealFoodDialogClosedContext,
  initial: "Closed",
  on: {
    close: {
      target: ".Closed",
      actions: assign(addMealFoodDialogClosedContext),
    },
    open: {
      target: ".Open",
      actions: assign(({ event }) => {
        assertEvent(event, "open");
        const foods = [...event.foods].sort((leftFood, rightFood) => {
          const leftMealUsage = _findFoodMealUsage({
            foodId: leftFood.id,
            foodUsage: event.foodUsage,
            meal: event.meal,
          });
          const rightMealUsage = _findFoodMealUsage({
            foodId: rightFood.id,
            foodUsage: event.foodUsage,
            meal: event.meal,
          });

          if (leftMealUsage === undefined && rightMealUsage === undefined) {
            return 0;
          }

          if (leftMealUsage === undefined) {
            return 1;
          }

          if (rightMealUsage === undefined) {
            return -1;
          }

          return (
            rightMealUsage.latestUsedAt.epochMilliseconds -
            leftMealUsage.latestUsedAt.epochMilliseconds
          );
        });

        return {
          canSubmit: false,
          dateKey: event.dateKey,
          foodUsage: event.foodUsage,
          foods,
          matchingFoods: foods,
          meal: event.meal,
          mealEntry: null,
          mode: "create",
          query: "",
          quantityGrams: "",
          selectedFood: null,
        };
      }),
    },
    openMealEntry: {
      target: ".Open",
      actions: assign(({ event }) => {
        assertEvent(event, "openMealEntry");
        const selectedFood =
          _findFoodById({
            foods: event.foods,
            foodId: event.mealEntry.foodId,
          }) ?? null;
        const quantityGrams = _formatQuantityGramsInputValue({
          quantityGrams: event.mealEntry.quantityGrams,
        });

        return {
          canSubmit: selectedFood !== null && quantityGrams.trim() !== "",
          dateKey: event.mealEntry.dateKey,
          foodUsage: event.foodUsage,
          foods: event.foods,
          matchingFoods: event.foods,
          meal: event.mealEntry.meal,
          mealEntry: event.mealEntry,
          mode: "revise",
          query: selectedFood?.name ?? "",
          quantityGrams,
          selectedFood,
        };
      }),
    },
  },
  states: {
    Closed: {},
    Open: {
      on: {
        changeQuery: {
          actions: assign(({ context, event }) => {
            assertEvent(event, "changeQuery");
            const normalizedQuery = event.query.trim().toLocaleLowerCase();
            const queryTokens =
              normalizedQuery === "" ? [] : normalizedQuery.split(/\s+/);
            const matchingFoods = Array.isReadonlyArrayNonEmpty(queryTokens)
              ? context.foods.filter((food) => {
                  const searchableFood =
                    food.brand === undefined
                      ? food.name.toLocaleLowerCase()
                      : `${food.name} ${food.brand}`.toLocaleLowerCase();

                  return queryTokens.every((queryToken) =>
                    searchableFood.includes(queryToken)
                  );
                })
              : context.foods;

            return {
              matchingFoods,
              query: event.query,
            };
          }),
        },
        changeQuantity: {
          actions: assign(({ context, event }) => {
            assertEvent(event, "changeQuantity");

            return {
              canSubmit:
                context.selectedFood !== null &&
                event.quantityGrams.trim() !== "",
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        selectFood: {
          actions: assign(({ context, event }) => {
            assertEvent(event, "selectFood");
            const selectedFood =
              _findFoodById({
                foods: context.foods,
                foodId: event.foodId,
              }) ?? null;
            const foodUsage =
              selectedFood === null
                ? undefined
                : _findFoodUsage({
                    foodId: selectedFood.id,
                    foodUsage: context.foodUsage,
                  });
            const quantityGrams =
              foodUsage === undefined
                ? ""
                : _formatQuantityGramsInputValue({
                    quantityGrams: foodUsage.latestQuantityGrams,
                  });

            return {
              canSubmit: selectedFood !== null && quantityGrams.trim() !== "",
              quantityGrams,
              selectedFood,
            };
          }),
        },
        selectFirstMatchingFood: {
          actions: assign(({ context }) => {
            const firstMatchingFood = context.matchingFoods[0];
            const selectedFood = firstMatchingFood ?? context.selectedFood;
            const foodUsage =
              firstMatchingFood === undefined
                ? undefined
                : _findFoodUsage({
                    foodId: firstMatchingFood.id,
                    foodUsage: context.foodUsage,
                  });
            const quantityGrams =
              firstMatchingFood === undefined
                ? context.quantityGrams
                : foodUsage === undefined
                  ? ""
                  : _formatQuantityGramsInputValue({
                      quantityGrams: foodUsage.latestQuantityGrams,
                    });

            return {
              canSubmit: selectedFood !== null && quantityGrams.trim() !== "",
              quantityGrams,
              selectedFood,
            };
          }),
        },
        submit: {
          guard: ({ context }) => context.canSubmit,
          target: "Submitting",
          actions: sendParent(({ context }) => {
            if (
              context.dateKey === null ||
              context.meal === null ||
              context.selectedFood === null
            ) {
              throw new Error(
                "Add food dialog cannot submit incomplete input."
              );
            }

            if (context.mode === "create") {
              return {
                type: "addMealEntry",
                input: {
                  dateKey: context.dateKey,
                  foodId: context.selectedFood.id,
                  meal: context.meal,
                  quantityGrams: context.quantityGrams,
                },
              } satisfies DailyLogEvent;
            }

            if (context.mealEntry === null) {
              throw new Error(
                "Edit food dialog cannot submit incomplete input."
              );
            }

            return {
              type: "reviseMealEntry",
              input: {
                mealEntryId: context.mealEntry.id,
                quantityGrams: context.quantityGrams,
              },
            } satisfies DailyLogEvent;
          }),
        },
        deleteEntry: {
          guard: ({ context }) => context.mealEntry !== null,
          target: "Submitting",
          actions: sendParent(({ context }) => {
            if (context.mealEntry === null) {
              throw new Error("Edit food dialog cannot delete missing input.");
            }

            return {
              type: "deleteMealEntry",
              input: {
                mealEntryId: context.mealEntry.id,
              },
            } satisfies DailyLogEvent;
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
          actions: assign(addMealFoodDialogClosedContext),
        },
      },
    },
  },
});

const dailyLogMachine = setup({
  types: {
    context: {} as {
      readonly addMealFoodDialogActor: ActorRefFrom<
        typeof addMealFoodDialogMachine
      >;
      readonly invalidate: () => Promise<void>;
    },
    events: {} as DailyLogEvent,
    input: {} as {
      readonly invalidate: () => Promise<void>;
    },
  },
  actors: {
    addMealFoodDialog: addMealFoodDialogMachine,
    addMealEntry: fromPromise<
      "added" | "foodNotFound",
      {
        readonly input: CreateMealEntryInput;
        readonly invalidate: () => Promise<void>;
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
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("FoodNotFound", () =>
            Effect.succeed("foodNotFound" as const)
          )
        )
      )
    ),
    reviseMealEntry: fromPromise<
      "revised" | "mealEntryNotFound",
      {
        readonly input: ReviseMealEntryInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries;
          yield* mealEntries.revise({
            input: input.input,
          });
          return "revised" as const;
        }).pipe(
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("MealEntryNotFound", () =>
            Effect.promise(() => input.invalidate()).pipe(
              Effect.as("mealEntryNotFound" as const)
            )
          )
        )
      )
    ),
    deleteMealEntry: fromPromise<
      "deleted" | "mealEntryNotFound",
      {
        readonly input: DeleteMealEntryInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries;
          yield* mealEntries.delete({
            input: input.input,
          });
          return "deleted" as const;
        }).pipe(
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("MealEntryNotFound", () =>
            Effect.promise(() => input.invalidate()).pipe(
              Effect.as("mealEntryNotFound" as const)
            )
          )
        )
      )
    ),
    changeDayPlan: fromPromise<
      "changed" | "planNotFound",
      {
        readonly input: ChangeDayPlanInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs;
          yield* dailyLogs.changePlan({
            input: input.input,
          });
          return "changed" as const;
        }).pipe(
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("PlanNotFound", () =>
            Effect.succeed("planNotFound" as const)
          )
        )
      )
    ),
  },
}).createMachine({
  context: ({ input, spawn }) => ({
    addMealFoodDialogActor: spawn("addMealFoodDialog", {
      id: "addMealFoodDialog",
    }),
    invalidate: input.invalidate,
  }),
  initial: "Idle",
  states: {
    Idle: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
    AddingMealEntry: {
      invoke: {
        src: "addMealEntry",
        input: ({ context, event }) => {
          assertEvent(event, "addMealEntry");

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
              sendTo(({ context }) => context.addMealFoodDialogActor, {
                type: "submissionFailed",
              } satisfies AddMealFoodDialogEvent),
            ],
          },
          {
            target: "Idle",
            actions: sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionSucceeded",
            } satisfies AddMealFoodDialogEvent),
          },
        ],
        onError: {
          target: "Failure",
          actions: [
            () => {
              globalThis.alert("Could not add the meal entry.");
            },
            sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionFailed",
            } satisfies AddMealFoodDialogEvent),
          ],
        },
      },
    },
    RevisingMealEntry: {
      invoke: {
        src: "reviseMealEntry",
        input: ({ context, event }) => {
          assertEvent(event, "reviseMealEntry");

          return {
            input: event.input,
            invalidate: context.invalidate,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "mealEntryNotFound",
            target: "MealEntryNotFound",
            actions: [
              () => {
                globalThis.alert("Could not find that meal entry.");
              },
              sendTo(({ context }) => context.addMealFoodDialogActor, {
                type: "submissionSucceeded",
              } satisfies AddMealFoodDialogEvent),
            ],
          },
          {
            target: "Idle",
            actions: sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionSucceeded",
            } satisfies AddMealFoodDialogEvent),
          },
        ],
        onError: {
          target: "Failure",
          actions: [
            () => {
              globalThis.alert("Could not update the meal entry.");
            },
            sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionFailed",
            } satisfies AddMealFoodDialogEvent),
          ],
        },
      },
    },
    DeletingMealEntry: {
      invoke: {
        src: "deleteMealEntry",
        input: ({ context, event }) => {
          assertEvent(event, "deleteMealEntry");

          return {
            input: event.input,
            invalidate: context.invalidate,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "mealEntryNotFound",
            target: "MealEntryNotFound",
            actions: [
              () => {
                globalThis.alert("Could not find that meal entry.");
              },
              sendTo(({ context }) => context.addMealFoodDialogActor, {
                type: "submissionSucceeded",
              } satisfies AddMealFoodDialogEvent),
            ],
          },
          {
            target: "Idle",
            actions: sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionSucceeded",
            } satisfies AddMealFoodDialogEvent),
          },
        ],
        onError: {
          target: "Failure",
          actions: [
            () => {
              globalThis.alert("Could not delete the meal entry.");
            },
            sendTo(({ context }) => context.addMealFoodDialogActor, {
              type: "submissionFailed",
            } satisfies AddMealFoodDialogEvent),
          ],
        },
      },
    },
    ChangingPlan: {
      invoke: {
        src: "changeDayPlan",
        input: ({ context, event }) => {
          assertEvent(event, "changePlan");

          return {
            input: event.input,
            invalidate: context.invalidate,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "planNotFound",
            target: "PlanNotFound",
            actions: () => {
              globalThis.alert("Could not find that meal plan.");
            },
          },
          {
            target: "Idle",
          },
        ],
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert("Could not change the meal plan.");
          },
        },
      },
    },
    Failure: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
    FoodNotFound: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
    MealEntryNotFound: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
    PlanNotFound: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
  },
});

type AddMealFoodDialogActorRef = SnapshotFrom<
  typeof dailyLogMachine
>["context"]["addMealFoodDialogActor"];

export function DailyLogView({ data }: { readonly data: DailyLogViewData }) {
  const { day, foodUsage, foods, mealEntries } = data;
  const router = useRouter();
  const [snapshot, send] = useMachine(dailyLogMachine, {
    input: {
      invalidate: () => router.invalidate(),
    },
  });
  const addMealFoodDialogActor = snapshot.context.addMealFoodDialogActor;
  const isAddingMealEntry = snapshot.matches("AddingMealEntry");
  const isDeletingMealEntry = snapshot.matches("DeletingMealEntry");
  const isRevisingMealEntry = snapshot.matches("RevisingMealEntry");
  const isChangingPlan = snapshot.matches("ChangingPlan");
  const previousDateKey = shiftDateKey({
    dateKey: day.dailyLog.dateKey,
    days: -1,
  });
  const nextDateKey = shiftDateKey({
    dateKey: day.dailyLog.dateKey,
    days: 1,
  });
  const hasFoods = Array.isReadonlyArrayNonEmpty(foods);
  const isMealEntryMutationPending =
    isAddingMealEntry || isDeletingMealEntry || isRevisingMealEntry;
  const dailyNutrients = _calculateEntriesNutrients({
    foods,
    mealEntries,
  });
  const displayedDate = new Date(`${day.dailyLog.dateKey}T00:00:00`);
  const displayedDateWeekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(displayedDate);
  const displayedDateDay = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(displayedDate);

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <header className="sticky top-0 z-30 bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <nav
            className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-4"
            aria-label="Day navigation"
          >
            <Link
              aria-label="Previous day"
              className={`${headerActionClassName} justify-self-start`}
              params={{ dateKey: previousDateKey }}
              title="Previous day"
              to="/days/$dateKey"
            >
              <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
            <Link
              aria-label="Go to today"
              className="grid rounded-full px-6 py-1.5 text-center text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              title={`Go to today from ${day.dailyLog.dateKey}`}
              to="/"
            >
              <span className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                {displayedDateWeekday}
              </span>
              <span className="text-xl font-black leading-tight">
                {displayedDateDay}
              </span>
            </Link>
            <Link
              aria-label="Next day"
              className={`${headerActionClassName} justify-self-end`}
              params={{ dateKey: nextDateKey }}
              title="Next day"
              to="/days/$dateKey"
            >
              <ChevronRight aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
          </nav>
        </header>

        <DailyProgress
          day={day}
          disabled={isChangingPlan}
          nutrients={dailyNutrients}
          onChangePlan={(planId) => {
            send({
              type: "changePlan",
              input: {
                dateKey: day.dailyLog.dateKey,
                planId,
              },
            });
          }}
        />

        <div className="grid gap-5 px-4 py-5">
          {mealOptions.map((mealOption) => (
            <MealSection
              addMealFoodDialogActor={addMealFoodDialogActor}
              dateKey={day.dailyLog.dateKey}
              disabled={isMealEntryMutationPending || !hasFoods}
              foodUsage={foodUsage}
              foods={foods}
              key={mealOption.value}
              mealEntries={mealEntries.filter(
                (mealEntry) => mealEntry.meal === mealOption.value
              )}
              mealLabel={mealOption.label}
              mealValue={mealOption.value}
            />
          ))}
        </div>

        <AddMealFoodDialog actor={addMealFoodDialogActor} />
      </section>
    </main>
  );
}

function MealSection({
  addMealFoodDialogActor,
  dateKey,
  disabled,
  foodUsage,
  foods,
  mealEntries,
  mealLabel,
  mealValue,
}: {
  readonly addMealFoodDialogActor: AddMealFoodDialogActorRef;
  readonly dateKey: DateKey;
  readonly disabled: boolean;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
  readonly mealLabel: string;
  readonly mealValue: Meal;
}) {
  const mealNutrients = _calculateEntriesNutrients({
    foods,
    mealEntries,
  });

  return (
    <section className="overflow-hidden rounded-[10px] bg-[#1b1b1e] shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <header className="flex min-w-0 items-center px-3 py-4">
        <h2 className="truncate text-xl font-black leading-tight text-[#efeff2]">
          {mealLabel}
        </h2>
      </header>

      <MealMacroStripe nutrients={mealNutrients} />

      {Array.isReadonlyArrayNonEmpty(mealEntries) ? (
        <ul className="divide-y divide-[#29292d]">
          {mealEntries.map((mealEntry) => (
            <MealEntryItem
              addMealFoodDialogActor={addMealFoodDialogActor}
              disabled={disabled}
              foodUsage={foodUsage}
              foods={foods}
              key={mealEntry.id}
              mealEntry={mealEntry}
              mealLabel={mealLabel}
            />
          ))}
        </ul>
      ) : null}

      <MealTotalColumns nutrients={mealNutrients} />
      <MealNutrientColumns nutrients={mealNutrients} />

      <div className="border-t border-[#29292d]">
        <button
          aria-label={`Add food to ${mealLabel}`}
          className={`flex min-h-14 w-full items-center justify-center gap-2 border-0 bg-transparent px-4 py-4 text-base font-black ${actionColorClassName} transition-colors hover:bg-[#202024] disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={disabled}
          onClick={() => {
            addMealFoodDialogActor.send({
              type: "open",
              dateKey,
              foodUsage,
              foods,
              meal: mealValue,
            });
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={19} strokeWidth={3} />
          Add food
        </button>
      </div>
    </section>
  );
}

function AddMealFoodDialog({
  actor,
}: {
  readonly actor: AddMealFoodDialogActorRef;
}) {
  const snapshot = useSelector(actor, (state) => state);
  const {
    canSubmit,
    dateKey,
    foodUsage,
    foods,
    matchingFoods,
    meal,
    mealEntry,
    mode,
    query,
    quantityGrams,
    selectedFood,
  } = snapshot.context;
  const quantityInputRef = useRef<HTMLInputElement | null>(null);

  if (dateKey === null || meal === null) {
    return null;
  }

  const disabled = snapshot.matches("Submitting");
  const mealLabel =
    mealOptions.find((mealOption) => mealOption.value === meal)?.label ??
    "Meal";
  const isEditingMealEntry = mode === "revise" && mealEntry !== null;
  const hasSelectedFood = selectedFood !== null;
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        });
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
  const dialogTitle = isEditingMealEntry ? "Edit food" : "Add food";
  const closeLabel = isEditingMealEntry ? "Close edit food" : "Close add food";
  const submitLabel = isEditingMealEntry ? "Save" : "Add";
  const submitAriaLabel = isEditingMealEntry
    ? `Save ${mealLabel} meal entry`
    : `Add food to ${mealLabel}`;
  const selectedFoodQuantityLabel = isEditingMealEntry
    ? mealEntry === null
      ? undefined
      : `${_formatNumber({ value: mealEntry.quantityGrams })} g logged`
    : selectedFoodUsage === undefined
      ? "No previous"
      : `${_formatNumber({
          value: selectedFoodUsage.latestQuantityGrams,
        })} g previous`;

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
        aria-labelledby="add-food-dialog-title"
        aria-modal="true"
        className="mx-auto grid max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-[520px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#343438] bg-[#161618] text-[#e9e9ed] shadow-2xl shadow-black/60"
        role="dialog"
      >
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#29292d] px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              {mealLabel}
            </p>
            <h2
              className="truncate text-xl font-black leading-tight text-[#efeff2]"
              id="add-food-dialog-title"
            >
              {dialogTitle}
            </h2>
          </div>
          <button
            aria-label={closeLabel}
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
          onSubmit={(event) => {
            event.preventDefault();

            actor.send({
              type: "submit",
            });
          }}
        >
          {isEditingMealEntry ? (
            <div className="min-h-0 overflow-y-auto p-4">
              {selectedFood === null ? (
                <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
                  Could not find this food.
                </p>
              ) : (
                <SelectedFoodDetails
                  food={selectedFood}
                  nutrients={selectedFoodNutrients}
                  quantityLabel={selectedFoodQuantityLabel}
                />
              )}
            </div>
          ) : (
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
              <div className="border-b border-[#29292d] bg-[#161618] p-4">
                <label
                  className={darkFieldLabelClassName}
                  htmlFor="add-food-search"
                >
                  Search
                  <span className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#77777e]"
                      size={17}
                      strokeWidth={3}
                    />
                    <input
                      aria-controls="add-food-results"
                      aria-label={`${mealLabel} food search`}
                      autoComplete="off"
                      autoFocus
                      className={`${darkFieldClassName} pl-9`}
                      disabled={disabled}
                      id="add-food-search"
                      onChange={(event) => {
                        actor.send({
                          type: "changeQuery",
                          query: event.currentTarget.value,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") {
                          return;
                        }

                        event.preventDefault();

                        actor.send({
                          type: "selectFirstMatchingFood",
                        });
                        globalThis.requestAnimationFrame(() => {
                          quantityInputRef.current?.focus();
                        });
                      }}
                      placeholder="Search food or brand"
                      role="combobox"
                      type="search"
                      value={query}
                    />
                  </span>
                </label>
              </div>

              <div
                className="min-h-0 overflow-y-auto p-2"
                id="add-food-results"
                role="listbox"
              >
                {!Array.isReadonlyArrayNonEmpty(foods) ? (
                  <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
                    Create a food before logging this meal.
                  </p>
                ) : Array.isReadonlyArrayNonEmpty(matchingFoods) ? (
                  matchingFoods.map((food) => {
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

                    return (
                      <button
                        aria-selected="false"
                        className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-[#f0f0f2] transition-colors hover:bg-[#202024]"
                        key={food.id}
                        onClick={() => {
                          actor.send({
                            type: "selectFood",
                            foodId: food.id,
                          });
                          globalThis.requestAnimationFrame(() => {
                            quantityInputRef.current?.focus();
                          });
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="min-w-0 font-extrabold leading-tight wrap-anywhere">
                          {food.name}
                        </span>
                        <span className="text-right text-sm font-black leading-tight text-[#4c7dff]">
                          {nutrients === undefined
                            ? "New"
                            : `${_formatNumber({
                                value: nutrients.energyKcal,
                              })} kcal`}
                        </span>
                        <span className="min-w-0 text-sm font-bold leading-tight text-[#aaaab1] wrap-anywhere">
                          {food.brand ?? "No brand"}
                        </span>
                        <span className="text-right text-sm font-medium leading-tight text-[#aaaab1]">
                          {foodHistory === undefined
                            ? "No previous"
                            : `${_formatNumber({
                                value: foodHistory.latestQuantityGrams,
                              })} g`}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
                    No foods found.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 border-t border-[#29292d] bg-[#161618] p-4">
            {selectedFood === null || isEditingMealEntry ? null : (
              <SelectedFoodDetails
                food={selectedFood}
                nutrients={selectedFoodNutrients}
                quantityLabel={selectedFoodQuantityLabel}
              />
            )}

            <label className={darkFieldLabelClassName}>
              Grams
              <span className="relative">
                <input
                  aria-label={`${mealLabel} quantity in grams`}
                  autoFocus={isEditingMealEntry}
                  className={`${darkFieldClassName} pr-9`}
                  disabled={disabled || !hasSelectedFood}
                  min="0.1"
                  onChange={(event) => {
                    actor.send({
                      type: "changeQuantity",
                      quantityGrams: event.currentTarget.value,
                    });
                  }}
                  placeholder="150"
                  ref={quantityInputRef}
                  required
                  step="0.1"
                  type="number"
                  value={quantityGrams}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
                  g
                </span>
              </span>
            </label>
          </div>

          <footer
            className={
              isEditingMealEntry
                ? "grid grid-cols-2 gap-2 border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
                : "grid border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            }
          >
            {isEditingMealEntry ? (
              <button
                aria-label={`Delete ${mealLabel} meal entry`}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-[#74322f] bg-[#201717] px-3 text-sm font-black text-[#ff5a51] transition-colors hover:bg-[#2a1c1a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                onClick={() => {
                  actor.send({
                    type: "deleteEntry",
                  });
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={3} />
                Delete
              </button>
            ) : null}
            <button
              aria-label={submitAriaLabel}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-[#ff5a51] bg-[#ff5a51] px-5 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60"
              disabled={disabled || !canSubmit}
              type="submit"
            >
              {submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SelectedFoodDetails({
  food,
  nutrients,
  quantityLabel,
}: {
  readonly food: Food;
  readonly nutrients: NutrientTotals | undefined;
  readonly quantityLabel: string | undefined;
}) {
  return (
    <div className="grid w-full gap-3 text-left text-[#f5f5f7]">
      <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <span className="min-w-0 font-extrabold leading-tight wrap-anywhere">
          {food.name}
        </span>
        <span className="text-right text-sm font-black leading-tight text-[#4c7dff]">
          {nutrients === undefined
            ? "New"
            : `${_formatNumber({
                value: nutrients.energyKcal,
              })} kcal`}
        </span>
        <span className="min-w-0 text-sm font-bold leading-tight text-[#aaaab1] wrap-anywhere">
          {food.brand ?? "No brand"}
        </span>
        {quantityLabel === undefined ? null : (
          <span className="text-right text-sm font-medium leading-tight text-[#aaaab1]">
            {quantityLabel}
          </span>
        )}
      </div>

      {nutrients === undefined ? null : (
        <dl className="divide-y divide-[#29292d]">
          <SelectedFoodNutrientRow
            label="Carbs"
            textClassName={macroToneClassNames.carbs.text}
            value={nutrients.carbsGrams}
          />
          <SelectedFoodNutrientRow
            label="Protein"
            textClassName={macroToneClassNames.protein.text}
            value={nutrients.proteinGrams}
          />
          <SelectedFoodNutrientRow
            label="Fat"
            textClassName={macroToneClassNames.fat.text}
            value={nutrients.fatGrams}
          />
          <SelectedFoodNutrientRow
            label="Fiber"
            textClassName={macroToneClassNames.carbs.text}
            value={nutrients.fiberGrams}
          />
          <SelectedFoodNutrientRow
            label="Sugar"
            textClassName={macroToneClassNames.carbs.text}
            value={nutrients.sugarGrams}
          />
          <SelectedFoodNutrientRow
            label="Sat fat"
            textClassName={macroToneClassNames.fat.text}
            value={nutrients.saturatedFatGrams}
          />
          <SelectedFoodNutrientRow
            label="Salt"
            textClassName="text-[#aaaab1]"
            value={nutrients.saltGrams}
          />
          <SelectedFoodNutrientRow
            label="Calories"
            textClassName="text-[#4c7dff]"
            unit="kcal"
            value={nutrients.energyKcal}
          />
        </dl>
      )}
    </div>
  );
}

function SelectedFoodNutrientRow({
  label,
  textClassName,
  unit = "g",
  value,
}: {
  readonly label: string;
  readonly textClassName: string;
  readonly unit?: "g" | "kcal";
  readonly value: number;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2">
      <dt
        className={`truncate text-sm font-medium leading-tight ${textClassName}`}
      >
        {label}
      </dt>
      <dd
        className={`truncate text-right text-sm font-black leading-tight ${textClassName}`}
      >
        {unit === "kcal"
          ? _formatNumber({ value })
          : `${_formatNumber({ value })}g`}
      </dd>
    </div>
  );
}

function MealMacroStripe({
  nutrients,
}: {
  readonly nutrients: NutrientTotals;
}) {
  const totalMacros =
    nutrients.carbsGrams + nutrients.proteinGrams + nutrients.fatGrams;

  if (totalMacros <= 0) {
    return <div className="h-px bg-[#29292d]" />;
  }

  return (
    <div aria-hidden="true" className="flex h-1 overflow-hidden bg-[#29292d]">
      <span
        className={macroToneClassNames.carbs.bar}
        style={{
          flexBasis: `${(nutrients.carbsGrams / totalMacros) * 100}%`,
        }}
      />
      <span
        className={macroToneClassNames.protein.bar}
        style={{
          flexBasis: `${(nutrients.proteinGrams / totalMacros) * 100}%`,
        }}
      />
      <span
        className={macroToneClassNames.fat.bar}
        style={{
          flexBasis: `${(nutrients.fatGrams / totalMacros) * 100}%`,
        }}
      />
    </div>
  );
}
function MealTotalColumns({
  nutrients,
}: {
  readonly nutrients: NutrientTotals;
}) {
  return (
    <dl className="grid grid-cols-4 border-t border-[#29292d]">
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2.5 text-center">
        <dt
          className={`truncate text-sm font-medium leading-tight ${macroToneClassNames.carbs.text}`}
        >
          Carbs
        </dt>
        <dd
          className={`order-first text-xl font-black leading-none ${macroToneClassNames.carbs.text}`}
        >
          {_formatNumber({ value: nutrients.carbsGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2.5 text-center">
        <dt
          className={`truncate text-sm font-medium leading-tight ${macroToneClassNames.protein.text}`}
        >
          Protein
        </dt>
        <dd
          className={`order-first text-xl font-black leading-none ${macroToneClassNames.protein.text}`}
        >
          {_formatNumber({ value: nutrients.proteinGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2.5 text-center">
        <dt
          className={`truncate text-sm font-medium leading-tight ${macroToneClassNames.fat.text}`}
        >
          Fat
        </dt>
        <dd
          className={`order-first text-xl font-black leading-none ${macroToneClassNames.fat.text}`}
        >
          {_formatNumber({ value: nutrients.fatGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2.5 text-center">
        <dt className="truncate text-sm font-medium leading-tight text-[#4c7dff]">
          Calories
        </dt>
        <dd className="order-first text-xl font-black leading-none text-[#4c7dff]">
          {_formatNumber({ value: nutrients.energyKcal })}
        </dd>
      </div>
    </dl>
  );
}

function MealNutrientColumns({
  nutrients,
}: {
  readonly nutrients: NutrientTotals;
}) {
  return (
    <dl className="grid grid-cols-3 border-t border-[#29292d] bg-[#18181b]">
      <MealNutrientColumn
        label="Fiber"
        textClassName={macroToneClassNames.carbs.text}
        value={nutrients.fiberGrams}
      />
      <MealNutrientColumn
        label="Salt"
        textClassName="text-[#aaaab1]"
        value={nutrients.saltGrams}
      />
      <MealNutrientColumn
        label="Sat fat"
        textClassName={macroToneClassNames.fat.text}
        value={nutrients.saturatedFatGrams}
      />
    </dl>
  );
}

function MealNutrientColumn({
  label,
  textClassName,
  value,
}: {
  readonly label: string;
  readonly textClassName: string;
  readonly value: number;
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2 text-center">
      <dt
        className={`truncate text-xs font-medium leading-tight ${textClassName}`}
      >
        {label}
      </dt>
      <dd
        className={`order-first text-base font-black leading-none ${textClassName}`}
      >
        {_formatNumber({ value })}g
      </dd>
    </div>
  );
}

function DailyProgress({
  day,
  disabled,
  nutrients,
  onChangePlan,
}: {
  readonly day: OpenedDay;
  readonly disabled: boolean;
  readonly nutrients: NutrientTotals;
  readonly onChangePlan: (planId: string) => void;
}) {
  const plan = day.selectedPlan;
  const targetEnergyKcal = calculatePlanEnergyKcal({ plan });

  return (
    <section
      className="border-b border-[#222226] bg-[#161618] px-4 pb-4 pt-3"
      aria-label="Daily progress"
    >
      <dl className="grid grid-cols-3 gap-4">
        <MacroProgressLine
          label="Carbs"
          target={plan.carbsTargetGrams}
          tone="carbs"
          unit="g"
          value={nutrients.carbsGrams}
        />
        <MacroProgressLine
          label="Protein"
          target={plan.proteinTargetGrams}
          tone="protein"
          unit="g"
          value={nutrients.proteinGrams}
        />
        <MacroProgressLine
          label="Fat"
          target={plan.fatTargetGrams}
          tone="fat"
          unit="g"
          value={nutrients.fatGrams}
        />
      </dl>

      <EnergyProgressMetric
        target={targetEnergyKcal}
        value={nutrients.energyKcal}
      />

      <DailyNutrientDetails
        fiberTargetGrams={plan.fiberTargetGrams}
        nutrients={nutrients}
        saltTargetGrams={plan.saltTargetGrams}
        saturatedFatTargetGrams={plan.saturatedFatTargetGrams}
        sugarTargetGrams={plan.sugarTargetGrams}
      />

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-2 px-2">
        <label className="relative flex min-h-11 min-w-0 items-center rounded-md border border-[#343438] bg-[#202024] px-3 text-[#ffbd35] transition-colors focus-within:border-[#ff5a51]/70 focus-within:ring-2 focus-within:ring-[#ff5a51]/25">
          <span className="sr-only">Meal plan</span>
          <select
            className="min-h-11 min-w-0 flex-1 appearance-none truncate border-0 bg-transparent py-0 pl-0 pr-7 text-base font-black text-[#ffbd35] outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            value={plan.id}
            onChange={(event) => {
              onChangePlan(event.currentTarget.value);
            }}
          >
            {day.plans.map((planOption) => (
              <option
                className="bg-[#161618] text-[#f0f0f2]"
                key={planOption.id}
                value={planOption.id}
              >
                {planOption.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            size={18}
            strokeWidth={3}
          />
        </label>
        <Link
          aria-label="Edit selected plan"
          className={planActionClassName}
          params={{ planId: plan.id }}
          search={{ dateKey: day.dailyLog.dateKey }}
          title="Edit selected plan"
          to="/plans/$planId/edit"
        >
          <Pencil aria-hidden="true" size={18} strokeWidth={3} />
        </Link>
        <Link
          aria-label="Create a new plan"
          className={planActionClassName}
          search={{ dateKey: day.dailyLog.dateKey }}
          title="Create a new plan"
          to="/plans/new"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={3} />
        </Link>
      </div>

      <div className="mt-2 px-2">
        <Link
          aria-label="Create food"
          className={`${actionColorClassName} inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-4 text-sm font-black no-underline transition-colors hover:bg-[#2a1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45`}
          search={{ dateKey: day.dailyLog.dateKey }}
          title="Create food"
          to="/foods/new"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={3} />
          New food
        </Link>
      </div>
    </section>
  );
}

function DailyNutrientDetails({
  fiberTargetGrams,
  nutrients,
  saltTargetGrams,
  saturatedFatTargetGrams,
  sugarTargetGrams,
}: {
  readonly fiberTargetGrams: number | undefined;
  readonly nutrients: NutrientTotals;
  readonly saltTargetGrams: number | undefined;
  readonly saturatedFatTargetGrams: number | undefined;
  readonly sugarTargetGrams: number | undefined;
}) {
  return (
    <dl className="mt-3 grid grid-cols-4 gap-2">
      <DailyNutrientProgressLine
        label="Fiber"
        target={fiberTargetGrams}
        tone="carbs"
        value={nutrients.fiberGrams}
      />
      <DailyNutrientProgressLine
        label="Sugar"
        target={sugarTargetGrams}
        tone="carbs"
        value={nutrients.sugarGrams}
      />
      <DailyNutrientProgressLine
        label="Sat fat"
        target={saturatedFatTargetGrams}
        tone="fat"
        value={nutrients.saturatedFatGrams}
      />
      <DailyNutrientProgressLine
        label="Salt"
        target={saltTargetGrams}
        tone="salt"
        value={nutrients.saltGrams}
      />
    </dl>
  );
}

function DailyNutrientProgressLine({
  label,
  target,
  tone,
  value,
}: {
  readonly label: string;
  readonly target: number | undefined;
  readonly tone: DailyNutrientTone;
  readonly value: number;
}) {
  const hasTarget = target !== undefined;
  const progressPercent = hasTarget
    ? target <= 0
      ? value > 0
        ? 100
        : 0
      : (value / target) * 100
    : 0;
  const cappedProgressPercent = Math.min(progressPercent, 100);
  const toneClassNames = hasTarget
    ? dailyNutrientToneClassNames[tone]
    : dailyNutrientNoTargetClassNames;
  const valueText = _formatValueWithUnit({ unit: "g", value });
  const targetText = hasTarget
    ? _formatValueWithUnit({ unit: "g", value: target })
    : undefined;

  return (
    <div className="grid min-w-0 gap-1 text-center">
      <dt
        className={`truncate text-[0.68rem] font-medium leading-tight ${toneClassNames.text}`}
      >
        {label}
      </dt>
      <div
        aria-label={`${label} progress`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(cappedProgressPercent)}
        aria-valuetext={
          targetText === undefined ? valueText : `${valueText} of ${targetText}`
        }
        className={`h-1.5 overflow-hidden rounded-full ${toneClassNames.track}`}
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${toneClassNames.bar}`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <dd
        className={`truncate text-[0.72rem] font-black leading-tight ${toneClassNames.text}`}
      >
        {_formatNumber({ value })}g
        {target === undefined
          ? null
          : ` / ${_formatNumber({ value: target })}g`}
      </dd>
    </div>
  );
}

function EnergyProgressMetric({
  target,
  value,
}: {
  readonly target: number;
  readonly value: number;
}) {
  const progressPercent =
    target <= 0 ? (value > 0 ? 100 : 0) : (value / target) * 100;
  const cappedProgressPercent = Math.min(progressPercent, 100);

  return (
    <div className="mt-3">
      <div
        aria-label="Calories progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(cappedProgressPercent)}
        aria-valuetext={`${_formatValueWithUnit({
          unit: "kcal",
          value,
        })} of ${_formatValueWithUnit({ unit: "kcal", value: target })}`}
        className="h-2.5 overflow-hidden rounded-full bg-[#233059]"
        role="progressbar"
      >
        <span
          className="block h-full rounded-full bg-[#4c7dff] transition-[inline-size] duration-200"
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <p className="mt-1.5 text-center text-base font-medium leading-tight text-[#4c7dff]">
        {_formatNumber({ value })} / {_formatNumber({ value: target })} kcal
      </p>
    </div>
  );
}

function MacroProgressLine({
  label,
  target,
  tone,
  unit,
  value,
}: {
  readonly label: string;
  readonly target: number;
  readonly tone: MacroTone;
  readonly unit: "g";
  readonly value: number;
}) {
  const progressPercent =
    target <= 0 ? (value > 0 ? 100 : 0) : (value / target) * 100;
  const cappedProgressPercent = Math.min(progressPercent, 100);
  const toneClassNames = macroToneClassNames[tone];

  return (
    <div className="grid min-w-0 gap-1.5 text-center">
      <dt
        className={`truncate text-sm font-medium leading-tight ${toneClassNames.text}`}
      >
        {label}
      </dt>
      <div
        aria-label={`${label} progress`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(cappedProgressPercent)}
        aria-valuetext={`${_formatValueWithUnit({
          unit,
          value,
        })} of ${_formatValueWithUnit({ unit, value: target })}`}
        className={`h-2.5 overflow-hidden rounded-full ${toneClassNames.track}`}
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${toneClassNames.bar}`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <dd
        className={`truncate text-lg font-black leading-tight ${toneClassNames.text}`}
      >
        {_formatNumber({ value })} / {_formatNumber({ value: target })} {unit}
      </dd>
    </div>
  );
}

function MealEntryItem({
  addMealFoodDialogActor,
  disabled,
  foodUsage,
  foods,
  mealEntry,
  mealLabel,
}: {
  readonly addMealFoodDialogActor: AddMealFoodDialogActorRef;
  readonly disabled: boolean;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly mealEntry: MealEntry;
  readonly mealLabel: string;
}) {
  const food = _findFoodById({
    foods,
    foodId: mealEntry.foodId,
  });

  if (food === undefined) {
    return (
      <li>
        <button
          aria-label={`Edit unknown food in ${mealLabel}`}
          className="grid w-full gap-1 border-0 bg-transparent px-4 py-3 text-left text-[#dedee3] transition-colors hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={() => {
            addMealFoodDialogActor.send({
              type: "openMealEntry",
              foodUsage,
              foods,
              mealEntry,
            });
          }}
          type="button"
        >
          <strong className="text-lg font-medium leading-tight text-[#dedee3] wrap-anywhere">
            Unknown food
          </strong>
          <span className="text-base font-black leading-tight text-[#aaaab1]">
            {_formatNumber({ value: mealEntry.quantityGrams })} g
          </span>
        </button>
      </li>
    );
  }

  const nutrients = calculateEntryNutrients({
    food,
    quantityGrams: mealEntry.quantityGrams,
  });

  return (
    <li>
      <button
        aria-label={`Edit ${food.name} in ${mealLabel}`}
        className="grid w-full gap-1 border-0 bg-transparent px-4 py-3 text-left text-[#dedee3] transition-colors hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => {
          addMealFoodDialogActor.send({
            type: "openMealEntry",
            foodUsage,
            foods,
            mealEntry,
          });
        }}
        type="button"
      >
        <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
          <strong className="min-w-0 text-lg font-medium leading-tight text-[#dedee3] wrap-anywhere">
            {food.name}
          </strong>
          <strong className="text-right text-lg font-medium leading-tight text-[#4c7dff]">
            {_formatNumber({ value: nutrients.energyKcal })}
          </strong>
          <span className="text-base font-black leading-tight text-[#aaaab1]">
            {_formatNumber({ value: mealEntry.quantityGrams })} g
          </span>
          <span className="text-right text-base font-medium leading-tight text-[#dedee3]">
            C:{" "}
            <strong className={`font-medium ${macroToneClassNames.carbs.text}`}>
              {_formatNumber({ value: nutrients.carbsGrams })}
            </strong>{" "}
            P:{" "}
            <strong
              className={`font-medium ${macroToneClassNames.protein.text}`}
            >
              {_formatNumber({ value: nutrients.proteinGrams })}
            </strong>{" "}
            F:{" "}
            <strong className={`font-medium ${macroToneClassNames.fat.text}`}>
              {_formatNumber({ value: nutrients.fatGrams })}
            </strong>
          </span>
        </span>
      </button>
    </li>
  );
}

function _findFoodById({
  foods,
  foodId,
}: {
  readonly foods: readonly Food[];
  readonly foodId: Food["id"] | null;
}) {
  return foodId === null ? undefined : foods.find((food) => food.id === foodId);
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

function _findFoodMealUsage({
  foodId,
  foodUsage,
  meal,
}: {
  readonly foodId: Food["id"];
  readonly foodUsage: readonly MealFoodUsage[];
  readonly meal: Meal;
}) {
  return _findFoodUsage({ foodId, foodUsage })?.meals.find(
    (usage) => usage.meal === meal
  );
}

function _formatQuantityGramsInputValue({
  quantityGrams,
}: {
  readonly quantityGrams: MealFoodUsage["latestQuantityGrams"];
}) {
  return `${quantityGrams}`;
}

function _calculateEntriesNutrients({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): NutrientTotals {
  return mealEntries.reduce(
    (totals, mealEntry) => {
      const food = foods.find((food) => food.id === mealEntry.foodId);

      if (food === undefined) {
        return totals;
      }

      const nutrients = calculateEntryNutrients({
        food,
        quantityGrams: mealEntry.quantityGrams,
      });

      return {
        energyKcal: totals.energyKcal + nutrients.energyKcal,
        proteinGrams: totals.proteinGrams + nutrients.proteinGrams,
        carbsGrams: totals.carbsGrams + nutrients.carbsGrams,
        fatGrams: totals.fatGrams + nutrients.fatGrams,
        fiberGrams: totals.fiberGrams + nutrients.fiberGrams,
        sugarGrams: totals.sugarGrams + nutrients.sugarGrams,
        saturatedFatGrams:
          totals.saturatedFatGrams + nutrients.saturatedFatGrams,
        saltGrams: totals.saltGrams + nutrients.saltGrams,
      };
    },
    {
      energyKcal: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      fiberGrams: 0,
      sugarGrams: 0,
      saturatedFatGrams: 0,
      saltGrams: 0,
    }
  );
}

function _formatValueWithUnit({
  unit,
  value,
}: {
  readonly unit: "kcal" | "g";
  readonly value: number;
}) {
  const formattedValue = _formatNumber({ value });

  return unit === "kcal" ? `${formattedValue} kcal` : `${formattedValue}g`;
}

function _formatNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value);
}
