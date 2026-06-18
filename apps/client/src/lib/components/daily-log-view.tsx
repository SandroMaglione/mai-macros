import { Link, useRouter } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import {
  calculateEntryNutrients,
  calculatePlanEnergyKcal,
  type DateKey,
  type Food,
  type Meal,
  type MealEntry,
} from "@mai/nutrition";
import { Array, Effect } from "effect";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
type MacroTone = "protein" | "carbs" | "fat";
type DailyNutrientTone = "carbs" | "fat" | "salt";

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
              invalidate: () => router.invalidate(),
            });
          }}
        />

        <div className="grid gap-5 px-4 py-5">
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
    <section className="overflow-hidden rounded-[10px] bg-[#1b1b1e] shadow-[0_12px_28px_rgb(0_0_0_/_0.26)]">
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
              foods={foods}
              key={mealEntry.id}
              mealEntry={mealEntry}
            />
          ))}
        </ul>
      ) : null}

      <MealTotalColumns nutrients={mealNutrients} />
      <MealNutrientColumns nutrients={mealNutrients} />

      <details className="group border-t border-[#29292d]">
        <summary
          className={`flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-4 text-base font-black ${actionColorClassName} transition-colors hover:bg-[#202024] [&::-webkit-details-marker]:hidden`}
        >
          Add food
          <ChevronDown
            aria-hidden="true"
            className="transition-transform duration-200 ease-out group-open:rotate-180"
            size={19}
            strokeWidth={3}
          />
        </summary>

        <form
          className="grid gap-3 px-4 pb-4 opacity-0 transition-opacity duration-200 group-open:opacity-100"
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
          {!Array.isReadonlyArrayNonEmpty(foods) ? (
            <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
              Create a food before logging this meal.
            </p>
          ) : null}

          <input name="meal" type="hidden" value={mealValue} />
          <input
            name="foodId"
            type="hidden"
            value={foodSearch.selectedFoodId ?? ""}
          />
          <label
            className={darkFieldLabelClassName}
            htmlFor={`${mealValue}-food-search`}
          >
            Food
            <div className="relative">
              <input
                aria-controls={`${mealValue}-food-results`}
                aria-expanded={shouldShowFoodResults}
                aria-haspopup="listbox"
                aria-label={`${mealLabel} food search`}
                autoComplete="off"
                className={darkFieldClassName}
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
                  className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-20 grid max-h-64 gap-1 overflow-auto rounded-md border border-[#38383d] bg-[#111113] p-1 shadow-xl shadow-black/40"
                  id={`${mealValue}-food-results`}
                  role="listbox"
                >
                  {Array.isReadonlyArrayNonEmpty(matchingFoods) ? (
                    matchingFoods.map((food) => {
                      const foodName = _formatFoodName({ food });

                      return (
                        <button
                          aria-selected="false"
                          className="grid min-h-10 w-full justify-items-start gap-0.5 rounded border-0 bg-transparent px-2.5 py-1.5 text-left text-sm text-[#f0f0f2] transition-colors hover:bg-[#242429]"
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
                            <small className="text-sm text-[#aaaab1]">
                              {food.brand}
                            </small>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <p className="m-2 text-sm font-bold text-[#aaaab1]">
                      No foods found.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className={darkFieldLabelClassName}>
              Grams
              <span className="relative">
                <input
                  aria-label={`${mealLabel} quantity in grams`}
                  className={`${darkFieldClassName} pr-9`}
                  disabled={disabled || selectedFood === undefined}
                  min="0.1"
                  name="quantityGrams"
                  placeholder="150"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
                  g
                </span>
              </span>
            </label>
            <button
              aria-label={`Add food to ${mealLabel}`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#ff5a51] bg-[#ff5a51] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60"
              disabled={disabled || selectedFood === undefined}
              type="submit"
            >
              Add
            </button>
          </div>
        </form>
      </details>
    </section>
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

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 px-2">
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
          className={`${actionColorClassName} inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[#3d2827] bg-[#241918] px-3 text-sm font-black no-underline transition-colors hover:bg-[#2c1d1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45`}
          search={{ dateKey: day.dailyLog.dateKey }}
          title="Create a new plan"
          to="/plans/new"
        >
          New plan
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
      <li className="grid gap-1 px-4 py-3">
        <strong className="text-lg font-medium leading-tight text-[#dedee3] [overflow-wrap:anywhere]">
          Unknown food
        </strong>
        <p className="text-base font-black leading-tight text-[#aaaab1]">
          {_formatNumber({ value: mealEntry.quantityGrams })} g
        </p>
      </li>
    );
  }

  const nutrients = calculateEntryNutrients({
    food,
    quantityGrams: mealEntry.quantityGrams,
  });

  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <strong className="min-w-0 text-lg font-medium leading-tight text-[#dedee3] [overflow-wrap:anywhere]">
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
          <strong className={`font-medium ${macroToneClassNames.protein.text}`}>
            {_formatNumber({ value: nutrients.proteinGrams })}
          </strong>{" "}
          F:{" "}
          <strong className={`font-medium ${macroToneClassNames.fat.text}`}>
            {_formatNumber({ value: nutrients.fatGrams })}
          </strong>
        </span>
      </div>
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
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value);
}
