import { BackupTransferMachine, FoodSearchMachine } from "@mai/machines";
import { DailyLogs, Domain, MealEntries, Utils } from "@mai/nutrition";
import { Link, useRouter } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { Array, Effect, Option, Order, Schema } from "effect";
import {
  Activity,
  Apple,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendParent,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { RuntimeClient } from "../runtime-client.ts";
import { backupTransferMachine } from "../machines/backup-transfer-machine.ts";
import { AppHeader, appHeaderActionClassName } from "./app-header.tsx";
import { BackupTransferControls } from "./backup-transfer-controls.tsx";
import { FoodCatalogTransferControls } from "./food-catalog-transfer-controls.tsx";
import { FoodNutrientOverview } from "./food-nutrient-overview.tsx";
import {
  FoodDefaultOriginDot,
  FoodSearchField,
  FoodSearchResults,
} from "./food-search.tsx";
import { dateKeyFromDate, shiftDateKey } from "../utils.ts";

export type DailyLogViewData = {
  readonly day: DailyLogs.OpenedDay;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
};

type NutrientTotals = {
  readonly energyKcal: number;
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams: number;
  readonly sugarGrams: number;
  readonly saturatedFatGrams: number;
  readonly saltGrams: number;
};
type MacroTone = "protein" | "carbs" | "fat";
type DailyNutrientTone = "carbs" | "fat" | "salt";
type AddMealFoodDialogMode = "create" | "revise";
type MacroDisplayMode = "consumed" | "remaining";

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
const overTargetProgressBarClassName = "bg-[#ff5a51]";
const overTargetProgressTextClassName = "text-[#ff5a51]";
const actionSheetLinkClassName =
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border border-[#3d332a] bg-[#211914] px-2 text-sm font-black text-[#dfd2bd] no-underline transition-colors hover:bg-[#2a1d14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffbd35]/45";
const bottomActionClassName =
  "inline-flex h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border border-transparent px-1 text-center text-[0.68rem] font-black leading-tight text-[#dfd2bd] no-underline transition-colors hover:border-[#5a3b26] hover:bg-[#2a1d14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffbd35]/45 [&>svg]:shrink-0";
const sheetIconActionClassName =
  "inline-flex size-10 items-center justify-center rounded-md border border-[#3d332a] bg-[#211914] text-[#dfd2bd] no-underline transition-colors hover:bg-[#2a1d14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffbd35]/45";
const darkFieldClassName =
  "min-h-10 w-full border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

const mealOptions: readonly {
  readonly value: Domain.Meal;
  readonly label: string;
}[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

type AddMealFoodDialogEvent =
  | {
      readonly type: "open";
      readonly dateKey: Domain.DateKey;
      readonly foodUsage: readonly MealEntries.MealFoodUsage[];
      readonly foods: readonly Domain.Food[];
      readonly meal: Domain.Meal;
    }
  | {
      readonly type: "openMealEntry";
      readonly foodUsage: readonly MealEntries.MealFoodUsage[];
      readonly foods: readonly Domain.Food[];
      readonly mealEntry: Domain.MealEntry;
    }
  | {
      readonly type: "close";
    }
  | FoodSearchMachine.FoodSearchSelectedEvent
  | {
      readonly type: "clearSelectedFood";
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
  readonly dateKey: Domain.DateKey | null;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly foodSearchActor: ActorRefFrom<
    typeof FoodSearchMachine.foodSearchMachine
  >;
  readonly meal: Domain.Meal | null;
  readonly mealEntry: Domain.MealEntry | null;
  readonly mode: AddMealFoodDialogMode;
  readonly quantityGrams: string;
  readonly selectedFood: Domain.Food | null;
};

type DailyLogEvent =
  | {
      readonly type: "addMealEntry";
      readonly input: MealEntries.CreateMealEntryInput;
    }
  | {
      readonly type: "reviseMealEntry";
      readonly input: MealEntries.ReviseMealEntryInput;
    }
  | {
      readonly type: "deleteMealEntry";
      readonly input: MealEntries.DeleteMealEntryInput;
    }
  | {
      readonly type: "changePlan";
      readonly input: DailyLogs.ChangeDayPlanInput;
    }
  | BackupTransferMachine.BackupTransferImportedEvent;

const addMealFoodDialogClosedContext = {
  dateKey: null,
  foodUsage: [],
  meal: null,
  mealEntry: null,
  mode: "create",
  quantityGrams: "",
  selectedFood: null,
} satisfies Omit<AddMealFoodDialogContext, "foodSearchActor">;

const macroDisplayModeMachine = setup({
  types: {
    events: {} as {
      readonly type: "toggle";
    },
  },
}).createMachine({
  initial: "Consumed",
  states: {
    Consumed: {
      on: {
        toggle: {
          target: "Remaining",
        },
      },
    },
    Remaining: {
      on: {
        toggle: {
          target: "Consumed",
        },
      },
    },
  },
});

const addMealFoodDialogMachine = setup({
  types: {
    context: {} as AddMealFoodDialogContext,
    events: {} as AddMealFoodDialogEvent,
  },
  actors: {
    foodSearch: FoodSearchMachine.foodSearchMachine,
  },
}).createMachine({
  context: ({ spawn }) => ({
    ...addMealFoodDialogClosedContext,
    foodSearchActor: spawn("foodSearch", {
      id: "addMealFoodDialogFoodSearch",
      input: {
        foods: [],
      },
    }),
  }),
  initial: "Closed",
  on: {
    close: {
      target: ".Closed",
      actions: [
        assign(addMealFoodDialogClosedContext),
        sendTo(({ context }) => context.foodSearchActor, {
          type: "reset",
          foods: [],
        } satisfies FoodSearchMachine.FoodSearchEvent),
      ],
    },
    open: {
      target: ".Open",
      actions: [
        assign(({ event }) => {
          assertEvent(event, "open");

          return {
            dateKey: event.dateKey,
            foodUsage: event.foodUsage,
            meal: event.meal,
            mealEntry: null,
            mode: "create",
            quantityGrams: "",
            selectedFood: null,
          };
        }),
        sendTo(
          ({ context }) => context.foodSearchActor,
          ({ event }) => {
            assertEvent(event, "open");
            const mealFoodRecencyOrder = Order.mapInput(
              Order.flip(Order.Number),
              (food: Domain.Food) =>
                _findFoodUsage({
                  foodId: food.id,
                  foodUsage: event.foodUsage,
                })?.meals.find((usage) => usage.meal === event.meal)
                  ?.latestUsedAt.epochMilliseconds ?? Number.NEGATIVE_INFINITY
            );
            const foods = Array.sortBy(
              mealFoodRecencyOrder,
              FoodSearchMachine.foodUserOriginOrder,
              FoodSearchMachine.foodLowercaseNameOrder
            )(event.foods);

            return {
              type: "reset",
              foods,
            } satisfies FoodSearchMachine.FoodSearchEvent;
          }
        ),
      ],
    },
    openMealEntry: {
      target: ".Open",
      actions: [
        assign(({ event }) => {
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
            dateKey: event.mealEntry.dateKey,
            foodUsage: event.foodUsage,
            meal: event.mealEntry.meal,
            mealEntry: event.mealEntry,
            mode: "revise",
            quantityGrams,
            selectedFood,
          };
        }),
        sendTo(
          ({ context }) => context.foodSearchActor,
          ({ event }) => {
            assertEvent(event, "openMealEntry");
            const selectedFood =
              _findFoodById({
                foods: event.foods,
                foodId: event.mealEntry.foodId,
              }) ?? null;

            return {
              type: "reset",
              foods: event.foods,
              query: selectedFood?.name ?? "",
              selectedFoodId: selectedFood?.id ?? null,
            } satisfies FoodSearchMachine.FoodSearchEvent;
          }
        ),
      ],
    },
  },
  states: {
    Closed: {},
    Open: {
      on: {
        changeQuantity: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeQuantity");

            return {
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        foodSearchSelected: {
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
                  : _formatQuantityGramsInputValue({
                      quantityGrams: foodUsage.latestQuantityGrams,
                    });
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
        submit: {
          guard: ({ context }) =>
            context.dateKey !== null &&
            context.meal !== null &&
            context.selectedFood !== null &&
            context.quantityGrams.trim() !== "",
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
      readonly backupTransferActor: BackupTransferMachine.BackupTransferActorRef;
      readonly invalidate: () => Promise<void>;
    },
    events: {} as DailyLogEvent,
    input: {} as {
      readonly invalidate: () => Promise<void>;
    },
  },
  actors: {
    addMealFoodDialog: addMealFoodDialogMachine,
    backupTransfer: backupTransferMachine,
    addMealEntry: fromPromise<
      "added" | "foodNotFound",
      {
        readonly input: MealEntries.CreateMealEntryInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries.MealEntries;
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
        readonly input: MealEntries.ReviseMealEntryInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries.MealEntries;
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
        readonly input: MealEntries.DeleteMealEntryInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries.MealEntries;
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
        readonly input: DailyLogs.ChangeDayPlanInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
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
    backupTransferActor: spawn("backupTransfer", {
      id: "backupTransfer",
    }),
    invalidate: input.invalidate,
  }),
  initial: "Idle",
  on: {
    backupImported: {
      actions: ({ context }) => {
        void context.invalidate().catch(() => {
          globalThis.alert("Could not refresh the imported backup.");
        });
      },
    },
  },
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

type AddMealFoodDialogActorRef = ActorRefFrom<typeof addMealFoodDialogMachine>;
type DailyLogActorRef = ActorRefFrom<typeof dailyLogMachine>;

export function DailyLogView({ data }: { readonly data: DailyLogViewData }) {
  const { day, foodUsage, foods, mealEntries } = data;
  const router = useRouter();
  const [snapshot, , dailyLogActor] = useMachine(dailyLogMachine, {
    input: {
      invalidate: () => router.invalidate(),
    },
  });
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
  const todayDateKey = dateKeyFromDate({ date: new Date() });
  const displayedDateRelativeLabel =
    day.dailyLog.dateKey === todayDateKey
      ? "Today"
      : day.dailyLog.dateKey ===
          shiftDateKey({
            dateKey: todayDateKey,
            days: -1,
          })
        ? "Yesterday"
        : day.dailyLog.dateKey ===
            shiftDateKey({
              dateKey: todayDateKey,
              days: 1,
            })
          ? "Tomorrow"
          : null;
  const displayedDateValue = new Date(`${day.dailyLog.dateKey}T00:00:00`);
  const displayedDate =
    displayedDateRelativeLabel === null
      ? {
          eyebrow: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
          }).format(displayedDateValue),
          label: new Intl.DateTimeFormat("en-US", {
            day: "numeric",
            month: "short",
          }).format(displayedDateValue),
        }
      : {
          eyebrow: null,
          label: displayedDateRelativeLabel,
        };

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-[calc(env(safe-area-inset-bottom)+5.75rem)]">
        <AppHeader
          center={
            <Link
              aria-label="Go to today"
              className="grid min-w-0 rounded-full px-6 py-1.5 text-center text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              title={`Go to today from ${day.dailyLog.dateKey}`}
              to="/"
            >
              {displayedDate.eyebrow === null ? null : (
                <span className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                  {displayedDate.eyebrow}
                </span>
              )}
              <span className="text-xl font-black leading-tight">
                {displayedDate.label}
              </span>
            </Link>
          }
          leading={
            <Link
              aria-label="Previous day"
              className={appHeaderActionClassName}
              params={{ dateKey: previousDateKey }}
              title="Previous day"
              to="/days/$dateKey"
            >
              <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
          }
          navigationLabel="Day navigation"
          trailing={
            <Link
              aria-label="Next day"
              className={appHeaderActionClassName}
              params={{ dateKey: nextDateKey }}
              title="Next day"
              to="/days/$dateKey"
            >
              <ChevronRight aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
          }
        />

        <DailyProgress day={day} nutrients={dailyNutrients} />

        <div className="grid gap-5 px-3 py-5">
          {mealOptions.map((mealOption) => (
            <MealSection
              addMealFoodDialogActor={snapshot.context.addMealFoodDialogActor}
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

        <AddMealFoodDialog actor={snapshot.context.addMealFoodDialogActor} />
        <BottomActionNav
          backupTransferActor={snapshot.context.backupTransferActor}
          day={day}
          dailyLogActor={dailyLogActor}
          disabled={isChangingPlan}
        />
      </section>
    </main>
  );
}

function BottomActionNav({
  backupTransferActor,
  day,
  dailyLogActor,
  disabled,
}: {
  readonly backupTransferActor: BackupTransferMachine.BackupTransferActorRef;
  readonly day: DailyLogs.OpenedDay;
  readonly dailyLogActor: DailyLogActorRef;
  readonly disabled: boolean;
}) {
  return (
    <nav
      aria-label="Primary work areas"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <div className="mx-auto grid w-full max-w-[520px] grid-cols-4 gap-1.5 rounded-lg border border-[#3d332a] bg-[#15120f]/95 p-1.5 shadow-[0_-12px_32px_rgb(0_0_0/0.36)] backdrop-blur">
        <Link
          aria-label="Work with stats"
          className={bottomActionClassName}
          to="/insights"
        >
          <Activity aria-hidden="true" size={18} strokeWidth={3} />
          Stats
        </Link>
        <details className="min-w-0">
          <summary
            aria-label="Work with plans"
            className={`${bottomActionClassName} list-none [&::-webkit-details-marker]:hidden`}
          >
            <ClipboardList aria-hidden="true" size={18} strokeWidth={3} />
            Plans
          </summary>
          <PlansActionSheet
            day={day}
            dailyLogActor={dailyLogActor}
            disabled={disabled}
          />
        </details>
        <details className="min-w-0">
          <summary
            aria-label="Work with foods"
            className={`${bottomActionClassName} list-none [&::-webkit-details-marker]:hidden`}
          >
            <Apple aria-hidden="true" size={18} strokeWidth={3} />
            Foods
          </summary>
          <FoodsActionSheet dateKey={day.dailyLog.dateKey} />
        </details>
        <details className="min-w-0">
          <summary
            aria-label="Work with backup"
            className={`${bottomActionClassName} list-none [&::-webkit-details-marker]:hidden`}
          >
            <Download aria-hidden="true" size={18} strokeWidth={3} />
            Backup
          </summary>
          <BackupActionSheet backupTransferActor={backupTransferActor} />
        </details>
      </div>
    </nav>
  );
}

function ActionSheet({
  children,
  eyebrow,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label={`Close ${title}`}
        className="absolute inset-0 h-full w-full cursor-default border-0 bg-black/70 p-0 backdrop-blur-sm"
        onClick={_closeActionSheet}
        type="button"
      />
      <section
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto grid max-h-[calc(100dvh-1rem)] w-full max-w-[520px] gap-4 overflow-y-auto rounded-t-lg border border-[#3d332a] bg-[#16120f] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl shadow-black/60"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase leading-tight tracking-normal text-[#b7a997]">
              {eyebrow}
            </p>
            <h2 className="truncate text-xl font-black leading-tight text-[#fff7ed]">
              {title}
            </h2>
          </div>
          <button
            aria-label={`Close ${title}`}
            className={sheetIconActionClassName}
            onClick={_closeActionSheet}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={3} />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function _closeActionSheet(event: ReactMouseEvent<HTMLButtonElement>) {
  const details = event.currentTarget.closest("details");

  if (details instanceof HTMLDetailsElement) {
    details.open = false;
  }
}

function PlansActionSheet({
  day,
  dailyLogActor,
  disabled,
}: {
  readonly day: DailyLogs.OpenedDay;
  readonly dailyLogActor: DailyLogActorRef;
  readonly disabled: boolean;
}) {
  const plan = day.selectedPlan;

  return (
    <ActionSheet eyebrow={plan.name} title="Plans">
      <label className="relative grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#dfd2bd]">
        Active meal plan
        <span className="relative flex min-h-11 min-w-0 items-center rounded-md border border-[#3d332a] bg-[#211914] px-3 text-[#ffbd35] transition-colors focus-within:border-[#ffbd35]/70 focus-within:ring-2 focus-within:ring-[#ffbd35]/25">
          <ClipboardList
            aria-hidden="true"
            className="mr-2 shrink-0"
            size={17}
            strokeWidth={3}
          />
          <select
            className="min-h-11 min-w-0 flex-1 appearance-none truncate border-0 bg-transparent py-0 pl-0 pr-7 text-sm font-black text-[#ffbd35] outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            value={plan.id}
            onChange={(event) => {
              dailyLogActor.send({
                type: "changePlan",
                input: {
                  dateKey: day.dailyLog.dateKey,
                  planId: event.currentTarget.value,
                },
              });
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
            size={16}
            strokeWidth={3}
          />
        </span>
      </label>

      <nav aria-label="Plan actions" className="grid grid-cols-2 gap-2">
        <Link
          className={actionSheetLinkClassName}
          params={{ planId: plan.id }}
          search={{ dateKey: day.dailyLog.dateKey }}
          to="/plans/$planId/edit"
        >
          <Pencil aria-hidden="true" size={16} strokeWidth={3} />
          Edit plan
        </Link>
        <Link
          className={actionSheetLinkClassName}
          search={{ dateKey: day.dailyLog.dateKey }}
          to="/plans/new"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={3} />
          New plan
        </Link>
      </nav>
    </ActionSheet>
  );
}

function FoodsActionSheet({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  return (
    <ActionSheet eyebrow="Food library" title="Foods">
      <nav aria-label="Food actions" className="grid grid-cols-2 gap-2">
        <Link
          className={actionSheetLinkClassName}
          search={{ dateKey }}
          to="/foods/new"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={3} />
          Create food
        </Link>
        <Link
          className={actionSheetLinkClassName}
          search={{ dateKey }}
          to="/foods/edit"
        >
          <Pencil aria-hidden="true" size={16} strokeWidth={3} />
          Edit foods
        </Link>
      </nav>
    </ActionSheet>
  );
}

function BackupActionSheet({
  backupTransferActor,
}: {
  readonly backupTransferActor: BackupTransferMachine.BackupTransferActorRef;
}) {
  const router = useRouter();

  return (
    <ActionSheet eyebrow="Database" title="Backup">
      <BackupTransferControls actor={backupTransferActor} mode="full" />
      <FoodCatalogTransferControls onImported={() => router.invalidate()} />
    </ActionSheet>
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
  readonly dateKey: Domain.DateKey;
  readonly disabled: boolean;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
  readonly mealLabel: string;
  readonly mealValue: Domain.Meal;
}) {
  const mealNutrients = _calculateEntriesNutrients({
    foods,
    mealEntries,
  });

  return (
    <section className="overflow-hidden rounded-lg bg-[#1b1b1e] shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <header className="flex min-w-0 items-center px-3 py-3">
        <h2 className="truncate text-base font-black leading-tight text-[#efeff2]">
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
        {disabled ? (
          <button
            aria-label={`Add food to ${mealLabel}`}
            className={`flex min-h-12 w-full items-center justify-center gap-2 border-0 bg-transparent px-4 py-3 text-sm font-black ${actionColorClassName} transition-colors hover:bg-[#202024] disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={true}
            type="button"
          >
            <Plus aria-hidden="true" size={19} strokeWidth={3} />
            Add food
          </button>
        ) : (
          <Link
            aria-label={`Add food to ${mealLabel}`}
            className={`flex min-h-12 w-full items-center justify-center gap-2 border-0 bg-transparent px-4 py-3 text-sm font-black ${actionColorClassName} no-underline transition-colors hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45`}
            params={{
              dateKey,
              meal: mealValue,
            }}
            to="/days/$dateKey/meals/$meal/add"
          >
            <Plus aria-hidden="true" size={19} strokeWidth={3} />
            Add food
          </Link>
        )}
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
    dateKey,
    foodUsage,
    foodSearchActor,
    meal,
    mealEntry,
    mode,
    quantityGrams,
    selectedFood,
  } = snapshot.context;

  if (dateKey === null || meal === null) {
    return null;
  }

  const disabled = snapshot.matches("Submitting");
  const submitEvent = { type: "submit" } satisfies AddMealFoodDialogEvent;
  const mealLabel =
    mealOptions.find((mealOption) => mealOption.value === meal)?.label ??
    "Meal";
  const isEditingMealEntry = mode === "revise" && mealEntry !== null;
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
      : Schema.decodeOption(Domain.QuantityGrams)(Number(quantityGrams)).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (validatedQuantityGrams) =>
              Utils.calculateEntryNutrients({
                food: selectedFood,
                quantityGrams: validatedQuantityGrams,
              }),
          })
        );
  const submitLabel = isEditingMealEntry ? "Save" : "Add";
  const submitAriaLabel = isEditingMealEntry
    ? `Save ${mealLabel} meal entry`
    : `Add food to ${mealLabel}`;
  const dialogLabel = isEditingMealEntry
    ? "Edit food"
    : `Add food to ${mealLabel}`;
  const isSearchingFood = !isEditingMealEntry && selectedFood === null;
  const isAddingSelectedFood = !isEditingMealEntry && selectedFood !== null;
  const selectedFoodQuantityLabel = isEditingMealEntry
    ? mealEntry === null
      ? undefined
      : `${_formatPreciseNumber({ value: mealEntry.quantityGrams })} g logged`
    : selectedFoodUsage === undefined
      ? "No previous"
      : `${_formatPreciseNumber({
          value: selectedFoodUsage.latestQuantityGrams,
        })} g previous`;
  const quantityField = (
    <QuantityGramsField
      addMealFoodDialogActor={actor}
      autoFocus={true}
      disabled={disabled || (isEditingMealEntry && selectedFood === null)}
      mealLabel={mealLabel}
      quantityGrams={quantityGrams}
    />
  );
  const changeFoodButton = isAddingSelectedFood ? (
    <button
      className="btn-secondary"
      disabled={disabled}
      onClick={() => {
        actor.send({
          type: "clearSelectedFood",
        });
      }}
      type="button"
    >
      <Pencil aria-hidden="true" size={16} strokeWidth={3} />
      Change food
    </button>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch bg-black/75 p-0 backdrop-blur-sm"
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
        aria-label={dialogLabel}
        aria-modal="true"
        className="mx-auto grid h-dvh min-h-0 w-full max-w-[520px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-x border-[#343438] bg-[#161618] text-[#e9e9ed] shadow-2xl shadow-black/60"
        role="dialog"
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();

            if (disabled || !snapshot.can(submitEvent)) {
              return;
            }

            actor.send(submitEvent);
          }}
        >
          {isEditingMealEntry ? (
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
              <div className="grid gap-4">
                {quantityField}
                {selectedFood === null ? (
                  <p className="bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
                    Could not find this food.
                  </p>
                ) : (
                  <>
                    <FoodNutrientOverview
                      brand={selectedFood.brand}
                      name={selectedFood.name}
                      namePrefix={<FoodDefaultOriginDot food={selectedFood} />}
                      nutrients={selectedFoodNutrients}
                      secondaryLabel={selectedFoodQuantityLabel}
                    />
                  </>
                )}
              </div>
            </div>
          ) : selectedFood !== null ? (
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
              <div className="grid gap-4">
                {quantityField}
                <FoodNutrientOverview
                  brand={selectedFood.brand}
                  name={selectedFood.name}
                  namePrefix={<FoodDefaultOriginDot food={selectedFood} />}
                  nutrients={selectedFoodNutrients}
                  secondaryLabel={selectedFoodQuantityLabel}
                />
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-4">
              <FoodSearchField
                actor={foodSearchActor}
                ariaControls="add-food-results"
                ariaLabel={`${mealLabel} food search`}
                autoFocus={true}
                disabled={disabled}
                id="add-food-search"
                label="Search"
                placeholder="Search food or brand"
                shape="square"
                showLabel={false}
              />
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
                      : Utils.calculateEntryNutrients({
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
                id="add-food-results"
                shape="square"
              />
            </div>
          )}

          {isSearchingFood ? null : (
            <footer className="grid gap-2 border-t border-[#29292d] bg-[#161618] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {isEditingMealEntry ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      aria-label={`Delete ${mealLabel} meal entry`}
                      className="btn-secondary-danger"
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
                    <button
                      aria-label={submitAriaLabel}
                      className="btn-primary"
                      disabled={disabled || !snapshot.can(submitEvent)}
                      type="submit"
                    >
                      {submitLabel}
                    </button>
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={disabled}
                    onClick={() => {
                      actor.send({ type: "close" });
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={16} strokeWidth={3} />
                    Cancel
                  </button>
                </>
              ) : (
                <div
                  className={
                    changeFoodButton === null
                      ? "grid"
                      : "grid grid-cols-2 gap-2"
                  }
                >
                  {changeFoodButton}
                  <button
                    aria-label={submitAriaLabel}
                    className="btn-primary"
                    disabled={disabled || !snapshot.can(submitEvent)}
                    type="submit"
                  >
                    {submitLabel}
                  </button>
                </div>
              )}
            </footer>
          )}
        </form>
      </section>
    </div>
  );
}

function QuantityGramsField({
  addMealFoodDialogActor,
  autoFocus,
  disabled,
  mealLabel,
  quantityGrams,
}: {
  readonly addMealFoodDialogActor: AddMealFoodDialogActorRef;
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
            addMealFoodDialogActor.send({
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
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2 text-center">
        <dt
          className={`truncate text-[0.65rem] font-medium leading-tight ${macroToneClassNames.carbs.text}`}
        >
          Carbs
        </dt>
        <dd
          className={`order-first text-sm font-black leading-none ${macroToneClassNames.carbs.text}`}
        >
          {_formatSummaryNumber({ value: nutrients.carbsGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2 text-center">
        <dt
          className={`truncate text-[0.65rem] font-medium leading-tight ${macroToneClassNames.protein.text}`}
        >
          Protein
        </dt>
        <dd
          className={`order-first text-sm font-black leading-none ${macroToneClassNames.protein.text}`}
        >
          {_formatSummaryNumber({ value: nutrients.proteinGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2 text-center">
        <dt
          className={`truncate text-[0.65rem] font-medium leading-tight ${macroToneClassNames.fat.text}`}
        >
          Fat
        </dt>
        <dd
          className={`order-first text-sm font-black leading-none ${macroToneClassNames.fat.text}`}
        >
          {_formatSummaryNumber({ value: nutrients.fatGrams })}
        </dd>
      </div>
      <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-2 text-center">
        <dt className="truncate text-[0.65rem] font-medium leading-tight text-[#4c7dff]">
          Calories
        </dt>
        <dd className="order-first text-sm font-black leading-none text-[#4c7dff]">
          {_formatSummaryNumber({ value: nutrients.energyKcal })}
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
    <div className="grid min-w-0 justify-items-center gap-0.5 px-1 py-1.5 text-center">
      <dt
        className={`truncate text-[0.6rem] font-medium leading-tight ${textClassName}`}
      >
        {label}
      </dt>
      <dd
        className={`order-first text-xs font-black leading-none ${textClassName}`}
      >
        {_formatSummaryNumber({ value })}g
      </dd>
    </div>
  );
}

function DailyProgress({
  day,
  nutrients,
}: {
  readonly day: DailyLogs.OpenedDay;
  readonly nutrients: NutrientTotals;
}) {
  const plan = day.selectedPlan;
  const targetEnergyKcal = Utils.calculatePlanEnergyKcal({ plan });
  const [macroDisplayModeSnapshot, sendMacroDisplayMode] = useMachine(
    macroDisplayModeMachine
  );
  const macroDisplayMode = macroDisplayModeSnapshot.matches("Remaining")
    ? "remaining"
    : "consumed";
  const toggleMacroDisplayMode = () => {
    sendMacroDisplayMode({ type: "toggle" });
  };

  return (
    <section
      aria-label="Daily progress"
      aria-pressed={macroDisplayMode === "remaining"}
      className="cursor-pointer border-b border-[#222226] bg-[#161618] px-3 pb-3 pt-2.5 transition-colors hover:bg-[#1a1a1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45"
      onClick={toggleMacroDisplayMode}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleMacroDisplayMode();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <dl className="grid grid-cols-3 gap-3">
        <MacroProgressLine
          displayMode={macroDisplayMode}
          label="Carbs"
          target={plan.carbsTargetGrams}
          tone="carbs"
          unit="g"
          value={nutrients.carbsGrams}
        />
        <MacroProgressLine
          displayMode={macroDisplayMode}
          label="Protein"
          target={plan.proteinTargetGrams}
          tone="protein"
          unit="g"
          value={nutrients.proteinGrams}
        />
        <MacroProgressLine
          displayMode={macroDisplayMode}
          label="Fat"
          target={plan.fatTargetGrams}
          tone="fat"
          unit="g"
          value={nutrients.fatGrams}
        />
      </dl>

      <EnergyProgressMetric
        displayMode={macroDisplayMode}
        target={targetEnergyKcal}
        value={nutrients.energyKcal}
      />

      <DailyNutrientDetails
        displayMode={macroDisplayMode}
        fiberTargetGrams={plan.fiberTargetGrams}
        nutrients={nutrients}
        saltTargetGrams={plan.saltTargetGrams}
        saturatedFatTargetGrams={plan.saturatedFatTargetGrams}
        sugarTargetGrams={plan.sugarTargetGrams}
      />
    </section>
  );
}

function DailyNutrientDetails({
  displayMode,
  fiberTargetGrams,
  nutrients,
  saltTargetGrams,
  saturatedFatTargetGrams,
  sugarTargetGrams,
}: {
  readonly displayMode: MacroDisplayMode;
  readonly fiberTargetGrams: number | undefined;
  readonly nutrients: NutrientTotals;
  readonly saltTargetGrams: number | undefined;
  readonly saturatedFatTargetGrams: number | undefined;
  readonly sugarTargetGrams: number | undefined;
}) {
  return (
    <dl className="mt-2.5 grid grid-cols-4 gap-1.5">
      <DailyNutrientProgressLine
        displayMode={displayMode}
        label="Fiber"
        target={fiberTargetGrams}
        tone="carbs"
        value={nutrients.fiberGrams}
      />
      <DailyNutrientProgressLine
        displayMode={displayMode}
        label="Sugar"
        target={sugarTargetGrams}
        tone="carbs"
        value={nutrients.sugarGrams}
      />
      <DailyNutrientProgressLine
        displayMode={displayMode}
        label="Sat fat"
        target={saturatedFatTargetGrams}
        tone="fat"
        value={nutrients.saturatedFatGrams}
      />
      <DailyNutrientProgressLine
        displayMode={displayMode}
        label="Salt"
        target={saltTargetGrams}
        tone="salt"
        value={nutrients.saltGrams}
      />
    </dl>
  );
}

function DailyNutrientProgressLine({
  displayMode,
  label,
  target,
  tone,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
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
  const displayValueText =
    target === undefined || displayMode === "consumed"
      ? `${_formatSummaryNumber({ value })}g${
          target === undefined
            ? ""
            : ` / ${_formatSummaryNumber({ value: target })}g`
        }`
      : _formatMacroDisplayValue({
          displayMode,
          target,
          unit: "g",
          value,
        });
  const isAboveTarget = target !== undefined && value > target;

  return (
    <div className="grid min-w-0 gap-0.5 text-center">
      <dt
        className={`truncate text-[0.6rem] font-medium leading-tight ${toneClassNames.text}`}
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
        className={`h-1 overflow-hidden rounded-full ${toneClassNames.track}`}
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${
            isAboveTarget ? overTargetProgressBarClassName : toneClassNames.bar
          }`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <dd
        className={`truncate text-[0.64rem] font-black leading-tight ${
          isAboveTarget ? overTargetProgressTextClassName : toneClassNames.text
        }`}
      >
        {displayValueText}
      </dd>
    </div>
  );
}

function EnergyProgressMetric({
  displayMode,
  target,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
  readonly target: number;
  readonly value: number;
}) {
  const progressPercent =
    target <= 0 ? (value > 0 ? 100 : 0) : (value / target) * 100;
  const cappedProgressPercent = Math.min(progressPercent, 100);

  const valueText = _formatMacroDisplayValue({
    displayMode,
    target,
    unit: "kcal",
    value,
  });
  const isAboveTarget = value > target;

  return (
    <div className="mt-2.5">
      <div
        aria-label="Calories progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(cappedProgressPercent)}
        aria-valuetext={`${_formatValueWithUnit({
          unit: "kcal",
          value,
        })} of ${_formatValueWithUnit({ unit: "kcal", value: target })}`}
        className="h-2 overflow-hidden rounded-full bg-[#233059]"
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${
            isAboveTarget ? overTargetProgressBarClassName : "bg-[#4c7dff]"
          }`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <p className="mt-1 text-center text-xs font-medium leading-tight">
        <span
          className={`font-black ${
            isAboveTarget ? overTargetProgressTextClassName : "text-[#4c7dff]"
          }`}
        >
          {valueText}
        </span>
      </p>
    </div>
  );
}

function MacroProgressLine({
  displayMode,
  label,
  target,
  tone,
  unit,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
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
  const isAboveTarget = value > target;
  const valueText = _formatMacroDisplayValue({
    displayMode,
    target,
    unit,
    value,
  });

  return (
    <div className="grid min-w-0 gap-1 text-center">
      <dt
        className={`truncate text-xs font-medium leading-tight ${toneClassNames.text}`}
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
        className={`h-2 overflow-hidden rounded-full ${toneClassNames.track}`}
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${
            isAboveTarget ? overTargetProgressBarClassName : toneClassNames.bar
          }`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <dd
        className={`truncate text-sm font-black leading-tight ${
          isAboveTarget ? overTargetProgressTextClassName : toneClassNames.text
        }`}
      >
        {valueText}
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
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly foods: readonly Domain.Food[];
  readonly mealEntry: Domain.MealEntry;
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
          className="grid w-full gap-0.5 border-0 bg-transparent px-3 py-2 text-left text-[#dedee3] transition-colors hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45 disabled:cursor-not-allowed disabled:opacity-60"
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
          <span className="truncate text-sm font-medium leading-tight text-[#dedee3]">
            Unknown food
          </span>
          <span className="text-xs font-normal leading-tight text-[#aaaab1]">
            {_formatPreciseNumber({ value: mealEntry.quantityGrams })} g
          </span>
        </button>
      </li>
    );
  }

  const nutrients = Utils.calculateEntryNutrients({
    food,
    quantityGrams: mealEntry.quantityGrams,
  });
  const quantityLabel = `${_formatPreciseNumber({
    value: mealEntry.quantityGrams,
  })} g`;
  const detailLabel =
    food.brand === undefined
      ? quantityLabel
      : `${food.brand}, ${quantityLabel}`;

  return (
    <li>
      <button
        aria-label={`Edit ${food.name} in ${mealLabel}`}
        className="grid w-full min-w-0 gap-0.5 border-0 bg-transparent px-3 py-2 text-left text-[#dedee3] transition-colors hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a51]/45 disabled:cursor-not-allowed disabled:opacity-60"
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
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
          <span className="min-w-0 truncate text-sm font-medium leading-tight text-[#dedee3]">
            {food.name}
          </span>
          <span className="whitespace-nowrap text-right text-sm font-medium leading-tight text-[#4c7dff]">
            {_formatPreciseNumber({ value: nutrients.energyKcal })}
          </span>
          <span className="min-w-0 truncate text-xs font-normal leading-tight text-[#aaaab1]">
            {detailLabel}
          </span>
          <span className="whitespace-nowrap text-right text-[0.7rem] font-normal leading-tight text-[#dedee3]">
            C:{" "}
            <span className={macroToneClassNames.carbs.text}>
              {_formatPreciseNumber({ value: nutrients.carbsGrams })}
            </span>{" "}
            P:{" "}
            <span className={macroToneClassNames.protein.text}>
              {_formatPreciseNumber({ value: nutrients.proteinGrams })}
            </span>{" "}
            F:{" "}
            <span className={macroToneClassNames.fat.text}>
              {_formatPreciseNumber({ value: nutrients.fatGrams })}
            </span>
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
  readonly foods: readonly Domain.Food[];
  readonly foodId: Domain.Food["id"] | null;
}) {
  return foodId === null ? undefined : foods.find((food) => food.id === foodId);
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

function _formatQuantityGramsInputValue({
  quantityGrams,
}: {
  readonly quantityGrams: MealEntries.MealFoodUsage["latestQuantityGrams"];
}) {
  return `${quantityGrams}`;
}

function _calculateEntriesNutrients({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
}): NutrientTotals {
  return mealEntries.reduce(
    (totals, mealEntry) => {
      const food = foods.find((food) => food.id === mealEntry.foodId);

      if (food === undefined) {
        return totals;
      }

      const nutrients = Utils.calculateEntryNutrients({
        food,
        quantityGrams: mealEntry.quantityGrams,
      });

      return {
        energyKcal: totals.energyKcal + nutrients.energyKcal,
        proteinGrams: totals.proteinGrams + nutrients.proteinGrams,
        carbsGrams: totals.carbsGrams + nutrients.carbsGrams,
        fatGrams: totals.fatGrams + nutrients.fatGrams,
        fiberGrams: totals.fiberGrams + (nutrients.fiberGrams ?? 0),
        sugarGrams: totals.sugarGrams + (nutrients.sugarGrams ?? 0),
        saturatedFatGrams:
          totals.saturatedFatGrams + (nutrients.saturatedFatGrams ?? 0),
        saltGrams: totals.saltGrams + (nutrients.saltGrams ?? 0),
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
  const formattedValue = _formatSummaryNumber({ value });

  return unit === "kcal" ? `${formattedValue} kcal` : `${formattedValue}g`;
}

function _formatMacroDisplayValue({
  displayMode,
  target,
  unit,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
  readonly target: number;
  readonly unit: "kcal" | "g";
  readonly value: number;
}) {
  if (displayMode === "consumed") {
    return `${_formatSummaryNumber({ value })} / ${_formatSummaryNumber({
      value: target,
    })} ${unit}`;
  }

  const remainingValue = target - value;
  const formattedValue = _formatSummaryNumber({
    value: Math.abs(remainingValue),
  });

  return remainingValue < 0
    ? `-${formattedValue} ${unit}`
    : `${formattedValue} ${unit} left`;
}

function _formatSummaryNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value);
}

function _formatPreciseNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}
