import { Link, useRouter } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import {
  calculateEntryNutrients,
  calculatePlanEnergyKcal,
  type DateKey,
  type Food,
  type Meal,
  type MealEntry,
  type Plan,
} from "@mai/nutrition";
import { Array, Effect } from "effect";
import {
  Apple,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Dumbbell,
  Flame,
  Home,
  MoreHorizontal,
  Plus,
  Target,
  Utensils,
  Wheat,
} from "lucide-react";
import { assign, assertEvent, fromPromise, setup } from "xstate";

import { RuntimeClient } from "../runtime-client.ts";
import type { ChangeDayPlanInput, OpenedDay } from "../services/daily-logs.ts";
import { DailyLogs } from "../services/daily-logs.ts";
import type { CreateMealEntryInput } from "../services/meal-entries.ts";
import { MealEntries } from "../services/meal-entries.ts";
import { createMealEntryInputFromFormData, shiftDateKey } from "../utils.ts";

export type DailyLogViewData = {
  readonly day: OpenedDay;
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
};

type NutrientTotals = ReturnType<typeof calculateEntryNutrients>;
type ProgressTone = "energy" | "protein" | "carbs" | "fat";

const statTermClassName =
  "text-xs font-black uppercase tracking-normal text-current opacity-75";
const mealEntryStatClassName =
  "min-w-0 rounded-md border-2 px-2 py-1.5 text-right";
const progressToneClassNames: Record<
  ProgressTone,
  {
    readonly card: string;
    readonly fill: string;
    readonly Icon: typeof Flame;
    readonly text: string;
  }
> = {
  carbs: {
    card: "border-sky-300 bg-sky-100 shadow-sky-900/5",
    fill: "bg-sky-600",
    Icon: Wheat,
    text: "text-sky-800",
  },
  energy: {
    card: "border-orange-300 bg-orange-100 shadow-orange-900/5",
    fill: "bg-orange-600",
    Icon: Flame,
    text: "text-orange-800",
  },
  fat: {
    card: "border-rose-300 bg-rose-100 shadow-rose-900/5",
    fill: "bg-rose-600",
    Icon: Droplet,
    text: "text-rose-800",
  },
  protein: {
    card: "border-emerald-300 bg-emerald-100 shadow-emerald-900/5",
    fill: "bg-emerald-600",
    Icon: Dumbbell,
    text: "text-emerald-800",
  },
};
const overTargetProgressClassNames = {
  card: "border-red-300 bg-red-100 shadow-red-900/5",
  fill: "bg-red-600",
  text: "text-red-800",
};

const mealOptions: readonly {
  readonly value: Meal;
  readonly label: string;
}[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const foodSearchMachine = setup({
  types: {
    context: {} as {
      readonly query: string;
      readonly selectedFoodId: Food["id"] | null;
    },
    events: {} as
      | {
          readonly type: "changeQuery";
          readonly query: string;
        }
      | {
          readonly type: "selectFood";
          readonly foodId: Food["id"];
          readonly query: string;
        }
      | {
          readonly type: "reset";
        },
  },
}).createMachine({
  context: {
    query: "",
    selectedFoodId: null,
  },
  initial: "Ready",
  states: {
    Ready: {
      on: {
        changeQuery: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeQuery");

            return {
              query: event.query,
              selectedFoodId: null,
            };
          }),
        },
        reset: {
          actions: assign(() => ({
            query: "",
            selectedFoodId: null,
          })),
        },
        selectFood: {
          actions: assign(({ event }) => {
            assertEvent(event, "selectFood");

            return {
              query: event.query,
              selectedFoodId: event.foodId,
            };
          }),
        },
      },
    },
  },
});

const dailyLogMachine = setup({
  types: {
    events: {} as
      | {
          readonly type: "addMealEntry";
          readonly input: CreateMealEntryInput;
          readonly invalidate: () => Promise<void>;
          readonly reset: () => void;
        }
      | {
          readonly type: "changePlan";
          readonly input: ChangeDayPlanInput;
          readonly invalidate: () => Promise<void>;
        },
  },
  actors: {
    addMealEntry: fromPromise<
      "added" | "foodNotFound",
      {
        readonly input: CreateMealEntryInput;
        readonly invalidate: () => Promise<void>;
        readonly reset: () => void;
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
          Effect.tap(() => Effect.sync(() => input.reset())),
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("FoodNotFound", () =>
            Effect.succeed("foodNotFound" as const)
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
  initial: "Idle",
  states: {
    Idle: {
      on: {
        addMealEntry: {
          target: "AddingMealEntry",
        },
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
    AddingMealEntry: {
      invoke: {
        src: "addMealEntry",
        input: ({ event }) => {
          assertEvent(event, "addMealEntry");

          return {
            input: event.input,
            invalidate: event.invalidate,
            reset: event.reset,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "foodNotFound",
            target: "FoodNotFound",
            actions: () => {
              globalThis.alert("Could not find that food.");
            },
          },
          {
            target: "Idle",
          },
        ],
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert("Could not add the meal entry.");
          },
        },
      },
    },
    ChangingPlan: {
      invoke: {
        src: "changeDayPlan",
        input: ({ event }) => {
          assertEvent(event, "changePlan");

          return {
            input: event.input,
            invalidate: event.invalidate,
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
        changePlan: {
          target: "ChangingPlan",
        },
      },
    },
  },
});

export function DailyLogView({ data }: { readonly data: DailyLogViewData }) {
  const { day, foods, mealEntries } = data;
  const router = useRouter();
  const [snapshot, send] = useMachine(dailyLogMachine);
  const isAddingMealEntry = snapshot.matches("AddingMealEntry");
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
  const dailyNutrients = _calculateEntriesNutrients({
    foods,
    mealEntries,
  });

  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-5 sm:items-center sm:px-6 sm:py-8 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col">
        <div className="mb-7 mt-6 grid justify-items-center text-center sm:mt-8">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/25">
            <CalendarDays aria-hidden="true" size={30} strokeWidth={2.4} />
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-normal text-sky-700">
            Daily log
          </p>
          <h1 className="text-3xl font-black leading-tight text-stone-950 sm:text-4xl">
            {day.dailyLog.dateKey}
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium leading-7 text-stone-700">
            Opening this date creates a daily log from the active meal plan.
          </p>
        </div>

        <nav
          className="flex flex-wrap justify-center gap-2"
          aria-label="Day navigation"
        >
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            params={{ dateKey: previousDateKey }}
            to="/days/$dateKey"
          >
            <ChevronLeft aria-hidden="true" className="mr-2" size={17} />
            Previous
          </Link>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-950 bg-emerald-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            to="/"
          >
            <Home aria-hidden="true" className="mr-2" size={17} />
            Today
          </Link>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            params={{ dateKey: nextDateKey }}
            to="/days/$dateKey"
          >
            Next
            <ChevronRight aria-hidden="true" className="ml-2" size={17} />
          </Link>
        </nav>

        <div className="mt-6 flex flex-col gap-4 rounded-lg border-2 border-emerald-200 bg-white/95 p-5 shadow-[0_18px_45px_rgb(15_23_42_/_0.09)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
          <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
            <span className="inline-flex items-center gap-2">
              <Target aria-hidden="true" size={17} strokeWidth={2.5} />
              Meal plan
            </span>
            <select
              className="min-h-11 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70 sm:min-w-80"
              disabled={isChangingPlan}
              value={day.selectedPlan.id}
              onChange={(event) => {
                send({
                  type: "changePlan",
                  input: {
                    dateKey: day.dailyLog.dateKey,
                    planId: event.currentTarget.value,
                  },
                  invalidate: () => router.invalidate(),
                });
              }}
            >
              {day.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              search={{ dateKey: day.dailyLog.dateKey }}
              to="/plans/new"
            >
              <Plus aria-hidden="true" className="mr-2" size={17} />
              New plan
            </Link>

            <details className="relative">
              <summary className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 list-none [&::-webkit-details-marker]:hidden">
                <MoreHorizontal aria-hidden="true" className="mr-2" size={18} />
                Actions
              </summary>
              <div className="absolute inset-x-0 z-10 mt-2 grid rounded-lg border border-stone-200 bg-white p-1.5 shadow-xl sm:left-auto sm:right-0 sm:w-48">
                <Link
                  className="flex min-h-10 items-center rounded-md px-3 text-sm font-bold text-stone-900 no-underline transition-colors hover:bg-emerald-50"
                  search={{ dateKey: day.dailyLog.dateKey }}
                  to="/foods/new"
                >
                  <Apple aria-hidden="true" className="mr-2" size={17} />
                  Create food
                </Link>
              </div>
            </details>
          </div>
        </div>

        <DailyProgress nutrients={dailyNutrients} plan={day.selectedPlan} />

        <div className="mt-5 grid gap-4">
          {mealOptions.map((mealOption) => (
            <MealSection
              dateKey={day.dailyLog.dateKey}
              disabled={isAddingMealEntry || !hasFoods}
              foods={foods}
              key={mealOption.value}
              mealEntries={mealEntries.filter(
                (mealEntry) => mealEntry.meal === mealOption.value
              )}
              mealLabel={mealOption.label}
              mealValue={mealOption.value}
              onAddMealEntry={(input, reset) => {
                send({
                  type: "addMealEntry",
                  input,
                  invalidate: () => router.invalidate(),
                  reset,
                });
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function MealSection({
  dateKey,
  disabled,
  foods,
  mealEntries,
  mealLabel,
  mealValue,
  onAddMealEntry,
}: {
  readonly dateKey: DateKey;
  readonly disabled: boolean;
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
  readonly mealLabel: string;
  readonly mealValue: Meal;
  readonly onAddMealEntry: (
    input: CreateMealEntryInput,
    reset: () => void
  ) => void;
}) {
  const mealNutrients = _calculateEntriesNutrients({
    foods,
    mealEntries,
  });
  const [foodSearchSnapshot, sendFoodSearch] = useMachine(foodSearchMachine);
  const foodSearch = foodSearchSnapshot.context;
  const selectedFood = _findFoodById({
    foods,
    foodId: foodSearch.selectedFoodId,
  });
  const normalizedFoodSearchQuery = foodSearch.query.trim().toLocaleLowerCase();
  const foodSearchTokens =
    normalizedFoodSearchQuery === ""
      ? []
      : normalizedFoodSearchQuery.split(/\s+/);
  const matchingFoods = Array.isReadonlyArrayNonEmpty(foodSearchTokens)
    ? foods
        .filter((food) => {
          const searchableFood = _formatFoodName({
            food,
          }).toLocaleLowerCase();

          return foodSearchTokens.every((foodSearchToken) =>
            searchableFood.includes(foodSearchToken)
          );
        })
        .slice(0, 8)
    : [];
  const hasFoodSearchQuery = normalizedFoodSearchQuery !== "";
  const shouldShowFoodResults =
    !disabled && selectedFood === undefined && hasFoodSearchQuery;

  return (
    <section className="rounded-lg border-2 border-stone-200 bg-white/95 p-4 shadow-[0_12px_32px_rgb(15_23_42_/_0.07)] sm:p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-lg font-black leading-tight text-stone-950">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Utensils aria-hidden="true" size={19} strokeWidth={2.5} />
          </span>
          {mealLabel}
        </h2>
        <span className="rounded-full border-2 border-emerald-300 bg-emerald-100 px-3 py-1 text-center text-xs font-black uppercase tracking-normal text-emerald-900">
          {mealEntries.length} logged
        </span>
      </header>

      <MealTotalList nutrients={mealNutrients} />

      <form
        className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(140px,180px)_auto]"
        onSubmit={(event) => {
          event.preventDefault();

          if (selectedFood === undefined) {
            return;
          }

          const form = event.currentTarget;
          const input = createMealEntryInputFromFormData({
            dateKey,
            formData: new FormData(form),
          });

          onAddMealEntry(input, () => {
            form.reset();
            sendFoodSearch({ type: "reset" });
          });
        }}
      >
        <input name="meal" type="hidden" value={mealValue} />
        <input
          name="foodId"
          type="hidden"
          value={foodSearch.selectedFoodId ?? ""}
        />
        <div className="grid min-w-0 gap-2">
          <label
            className="text-sm font-bold text-stone-700"
            htmlFor={`${mealValue}-food-search`}
          >
            Food
          </label>
          <div className="relative">
            <input
              aria-controls={`${mealValue}-food-results`}
              aria-expanded={shouldShowFoodResults}
              aria-haspopup="listbox"
              aria-label={`${mealLabel} food search`}
              autoComplete="off"
              className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
              disabled={disabled}
              id={`${mealValue}-food-search`}
              onChange={(event) => {
                sendFoodSearch({
                  type: "changeQuery",
                  query: event.currentTarget.value,
                });
              }}
              placeholder="Search food or brand"
              required
              role="combobox"
              type="search"
              value={foodSearch.query}
            />
            {shouldShowFoodResults ? (
              <div
                className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 grid max-h-64 gap-1 overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-xl"
                id={`${mealValue}-food-results`}
                role="listbox"
              >
                {Array.isReadonlyArrayNonEmpty(matchingFoods) ? (
                  matchingFoods.map((food) => {
                    const foodName = _formatFoodName({ food });

                    return (
                      <button
                        aria-selected="false"
                        className="grid min-h-11 w-full justify-items-start gap-0.5 rounded border-0 bg-white px-3 py-2 text-left text-stone-900 transition-colors hover:bg-emerald-50"
                        key={food.id}
                        onClick={() => {
                          sendFoodSearch({
                            type: "selectFood",
                            foodId: food.id,
                            query: foodName,
                          });
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="font-extrabold">{food.name}</span>
                        {food.brand === undefined ? null : (
                          <small className="text-sm text-stone-500">
                            {food.brand}
                          </small>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="m-2 text-sm text-stone-500">No foods found.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
          Quantity
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <input
              className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
              disabled={disabled || selectedFood === undefined}
              min="0.1"
              name="quantityGrams"
              placeholder="150"
              required
              step="0.1"
              type="number"
            />
            <span className="font-bold text-emerald-700">g</span>
          </div>
        </label>
        <button
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-emerald-950 bg-emerald-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          disabled={disabled || selectedFood === undefined}
          type="submit"
        >
          <Plus aria-hidden="true" className="mr-2" size={17} />
          Add
        </button>
      </form>

      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <p className="mt-4 text-sm text-stone-500">
          Create a food to start logging this meal.
        </p>
      ) : !Array.isReadonlyArrayNonEmpty(mealEntries) ? (
        <p className="mt-4 text-sm text-stone-500">
          No foods logged for this meal.
        </p>
      ) : (
        <ul className="mt-4 grid list-none gap-3 p-0">
          {mealEntries.map((mealEntry) => (
            <MealEntryItem
              foods={foods}
              key={mealEntry.id}
              mealEntry={mealEntry}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DailyProgress({
  nutrients,
  plan,
}: {
  readonly nutrients: NutrientTotals;
  readonly plan: Plan;
}) {
  const targetEnergyKcal = calculatePlanEnergyKcal({ plan });

  return (
    <section className="mt-5" aria-label="Daily progress">
      <div className="mb-3 flex flex-col items-center gap-1 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <h2 className="inline-flex items-center gap-2 text-xl font-black leading-tight text-stone-950">
          <Target aria-hidden="true" size={22} strokeWidth={2.5} />
          Daily progress
        </h2>
        <p className="text-sm font-black text-emerald-800">{plan.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressMetric
          label="Calories"
          target={targetEnergyKcal}
          tone="energy"
          unit="kcal"
          value={nutrients.energyKcal}
        />
        <ProgressMetric
          label="Protein"
          target={plan.proteinTargetGrams}
          tone="protein"
          unit="g"
          value={nutrients.proteinGrams}
        />
        <ProgressMetric
          label="Carbs"
          target={plan.carbsTargetGrams}
          tone="carbs"
          unit="g"
          value={nutrients.carbsGrams}
        />
        <ProgressMetric
          label="Fat"
          target={plan.fatTargetGrams}
          tone="fat"
          unit="g"
          value={nutrients.fatGrams}
        />
      </div>
    </section>
  );
}

function ProgressMetric({
  label,
  target,
  tone,
  unit,
  value,
}: {
  readonly label: string;
  readonly target: number;
  readonly tone: "energy" | "protein" | "carbs" | "fat";
  readonly unit: "kcal" | "g";
  readonly value: number;
}) {
  const progressPercent =
    target <= 0 ? (value > 0 ? 100 : 0) : (value / target) * 100;
  const cappedProgressPercent = Math.min(progressPercent, 100);
  const difference = target - value;
  const balanceLabel = difference >= 0 ? "left" : "over";
  const balanceValue = _formatValueWithUnit({
    unit,
    value: Math.abs(difference),
  });
  const isOverTarget = target - value < 0;
  const ProgressIcon = progressToneClassNames[tone].Icon;
  const progressClassNames = isOverTarget
    ? overTargetProgressClassNames
    : progressToneClassNames[tone];

  return (
    <article
      className={`min-w-0 rounded-lg border-2 p-4 shadow-sm ${progressClassNames.card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-black leading-tight text-stone-950">
          <span
            className={`inline-flex size-8 items-center justify-center rounded-lg bg-white/75 ${progressClassNames.text}`}
          >
            <ProgressIcon aria-hidden="true" size={18} strokeWidth={2.5} />
          </span>
          {label}
        </h3>
        <strong
          className={`text-xs font-black leading-tight ${progressClassNames.text}`}
        >
          {_formatNumber({ value: progressPercent })}%
        </strong>
      </div>
      <p className="my-4 text-sm font-bold text-stone-700">
        <strong className="mr-1 text-2xl font-black text-stone-950">
          {_formatValueWithUnit({ unit, value })}
        </strong>
        <span className="text-stone-700">
          / {_formatValueWithUnit({ unit, value: target })}
        </span>
      </p>
      <div
        aria-label={`${label} progress`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(cappedProgressPercent)}
        aria-valuetext={`${_formatValueWithUnit({
          unit,
          value,
        })} of ${_formatValueWithUnit({ unit, value: target })}`}
        className="h-3 overflow-hidden rounded-full bg-white/80"
        role="progressbar"
      >
        <span
          className={`block h-full rounded-full transition-[inline-size] duration-200 ${progressClassNames.fill}`}
          style={{ inlineSize: `${cappedProgressPercent}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-black uppercase tracking-normal text-stone-700">
        {balanceValue} {balanceLabel}
      </p>
    </article>
  );
}

function MealTotalList({ nutrients }: { readonly nutrients: NutrientTotals }) {
  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MealTotalCard
        Icon={Flame}
        className="border-orange-300 bg-orange-100 text-orange-950"
        label="Calories"
        value={_formatValueWithUnit({
          unit: "kcal",
          value: nutrients.energyKcal,
        })}
      />
      <MealTotalCard
        Icon={Dumbbell}
        className="border-emerald-300 bg-emerald-100 text-emerald-950"
        label="Protein"
        value={_formatValueWithUnit({
          unit: "g",
          value: nutrients.proteinGrams,
        })}
      />
      <MealTotalCard
        Icon={Wheat}
        className="border-sky-300 bg-sky-100 text-sky-950"
        label="Carbs"
        value={_formatValueWithUnit({ unit: "g", value: nutrients.carbsGrams })}
      />
      <MealTotalCard
        Icon={Droplet}
        className="border-rose-300 bg-rose-100 text-rose-950"
        label="Fat"
        value={_formatValueWithUnit({ unit: "g", value: nutrients.fatGrams })}
      />
    </dl>
  );
}

function MealTotalCard({
  className,
  Icon,
  label,
  value,
}: {
  readonly className: string;
  readonly Icon: typeof Flame;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={`min-w-0 rounded-lg border-2 p-3 ${className}`}>
      <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-normal">
        <Icon aria-hidden="true" size={16} strokeWidth={2.6} />
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-black leading-none">{value}</dd>
    </div>
  );
}

function MealEntryItem({
  foods,
  mealEntry,
}: {
  readonly foods: readonly Food[];
  readonly mealEntry: MealEntry;
}) {
  const food = _findFoodById({
    foods,
    foodId: mealEntry.foodId,
  });

  if (food === undefined) {
    return (
      <li className="grid grid-cols-1 gap-3 border-t border-stone-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="grid min-w-0 gap-1">
          <strong className="[overflow-wrap:anywhere]">Unknown food</strong>
          <span className="text-sm font-bold text-stone-500">
            {mealEntry.quantityGrams}g
          </span>
        </div>
      </li>
    );
  }

  const nutrients = calculateEntryNutrients({
    food,
    quantityGrams: mealEntry.quantityGrams,
  });

  return (
    <li className="grid grid-cols-1 gap-3 border-t border-stone-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <strong className="[overflow-wrap:anywhere]">
          {_formatFoodName({ food })}
        </strong>
        <span className="text-sm font-bold text-stone-500">
          {mealEntry.quantityGrams}g
        </span>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        <div
          className={`${mealEntryStatClassName} border-orange-200 bg-orange-50 text-orange-950`}
        >
          <dt className={statTermClassName}>Kcal</dt>
          <dd className="mt-1 text-sm font-black leading-tight">
            {_formatNumber({ value: nutrients.energyKcal })}
          </dd>
        </div>
        <div
          className={`${mealEntryStatClassName} border-emerald-200 bg-emerald-50 text-emerald-950`}
        >
          <dt className={statTermClassName}>P</dt>
          <dd className="mt-1 text-sm font-black leading-tight">
            {_formatNumber({ value: nutrients.proteinGrams })}g
          </dd>
        </div>
        <div
          className={`${mealEntryStatClassName} border-sky-200 bg-sky-50 text-sky-950`}
        >
          <dt className={statTermClassName}>C</dt>
          <dd className="mt-1 text-sm font-black leading-tight">
            {_formatNumber({ value: nutrients.carbsGrams })}g
          </dd>
        </div>
        <div
          className={`${mealEntryStatClassName} border-rose-200 bg-rose-50 text-rose-950`}
        >
          <dt className={statTermClassName}>F</dt>
          <dd className="mt-1 text-sm font-black leading-tight">
            {_formatNumber({ value: nutrients.fatGrams })}g
          </dd>
        </div>
      </dl>
    </li>
  );
}

function _formatFoodName({ food }: { readonly food: Food }) {
  return food.brand === undefined ? food.name : `${food.name} (${food.brand})`;
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
    maximumFractionDigits: 1,
  }).format(value);
}
