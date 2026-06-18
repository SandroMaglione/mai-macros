import { Link, useRouter } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import {
  calculateEntryNutrients,
  type DateKey,
  type Food,
  type Meal,
  type MealEntry,
} from "@mai/nutrition";
import { Array, Effect } from "effect";
import { assertEvent, fromPromise, setup } from "xstate";

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

const mealOptions: readonly {
  readonly value: Meal;
  readonly label: string;
}[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

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

  return (
    <main className="app-shell">
      <section className="day-view">
        <div className="day-toolbar" aria-label="Day navigation">
          <Link
            className="nav-button"
            params={{ dateKey: previousDateKey }}
            to="/days/$dateKey"
          >
            Previous
          </Link>
          <Link className="nav-button" to="/">
            Today
          </Link>
          <Link
            className="nav-button"
            params={{ dateKey: nextDateKey }}
            to="/days/$dateKey"
          >
            Next
          </Link>
        </div>

        <div className="page-heading">
          <p className="eyebrow">Daily log</p>
          <h1>{day.dailyLog.dateKey}</h1>
          <p className="lede">
            Opening this date creates a daily log from the active meal plan.
          </p>
        </div>

        <div className="plan-row">
          <label>
            Meal plan
            <select
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

          <div className="plan-actions">
            <Link
              className="secondary-link"
              search={{ dateKey: day.dailyLog.dateKey }}
              to="/plans/new"
            >
              New plan
            </Link>

            <details className="day-actions">
              <summary>Actions</summary>
              <div className="day-actions-menu">
                <Link
                  className="day-action-link"
                  search={{ dateKey: day.dailyLog.dateKey }}
                  to="/foods/new"
                >
                  Create food
                </Link>
              </div>
            </details>
          </div>
        </div>

        <dl className="target-grid">
          <div>
            <dt>Protein</dt>
            <dd>{day.selectedPlan.proteinTargetGrams}g</dd>
          </div>
          <div>
            <dt>Carbs</dt>
            <dd>{day.selectedPlan.carbsTargetGrams}g</dd>
          </div>
          <div>
            <dt>Fat</dt>
            <dd>{day.selectedPlan.fatTargetGrams}g</dd>
          </div>
        </dl>

        <div className="meal-grid">
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
  return (
    <section className="meal-panel">
      <header className="meal-panel-header">
        <h2>{mealLabel}</h2>
        <span>{mealEntries.length}</span>
      </header>

      <form
        className="meal-entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = createMealEntryInputFromFormData({
            dateKey,
            formData: new FormData(form),
          });

          onAddMealEntry(input, () => {
            form.reset();
          });
        }}
      >
        <input name="meal" type="hidden" value={mealValue} />
        <label>
          Food
          <select disabled={disabled} name="foodId" required>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {_formatFoodName({ food })}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <div className="input-with-unit">
            <input
              disabled={disabled}
              min="0.1"
              name="quantityGrams"
              placeholder="150"
              required
              step="0.1"
              type="number"
            />
            <span>g</span>
          </div>
        </label>
        <button disabled={disabled} type="submit">
          Add
        </button>
      </form>

      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <p className="meal-empty">Create a food to start logging this meal.</p>
      ) : !Array.isReadonlyArrayNonEmpty(mealEntries) ? (
        <p className="meal-empty">No foods logged for this meal.</p>
      ) : (
        <ul className="meal-entry-list">
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

function MealEntryItem({
  foods,
  mealEntry,
}: {
  readonly foods: readonly Food[];
  readonly mealEntry: MealEntry;
}) {
  const food = foods.find((food) => food.id === mealEntry.foodId);

  if (food === undefined) {
    return (
      <li className="meal-entry">
        <div>
          <strong>Unknown food</strong>
          <span>{mealEntry.quantityGrams}g</span>
        </div>
      </li>
    );
  }

  const nutrients = calculateEntryNutrients({
    food,
    quantityGrams: mealEntry.quantityGrams,
  });

  return (
    <li className="meal-entry">
      <div>
        <strong>{_formatFoodName({ food })}</strong>
        <span>{mealEntry.quantityGrams}g</span>
      </div>
      <dl>
        <div>
          <dt>Kcal</dt>
          <dd>{_formatNumber({ value: nutrients.energyKcal })}</dd>
        </div>
        <div>
          <dt>P</dt>
          <dd>{_formatNumber({ value: nutrients.proteinGrams })}g</dd>
        </div>
        <div>
          <dt>C</dt>
          <dd>{_formatNumber({ value: nutrients.carbsGrams })}g</dd>
        </div>
        <div>
          <dt>F</dt>
          <dd>{_formatNumber({ value: nutrients.fatGrams })}g</dd>
        </div>
      </dl>
    </li>
  );
}

function _formatFoodName({ food }: { readonly food: Food }) {
  return food.brand === undefined ? food.name : `${food.name} (${food.brand})`;
}

function _formatNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}
