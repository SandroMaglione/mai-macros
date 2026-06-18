import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { calculateMacronutrientEnergyKcal } from "@mai/nutrition";
import { DateTime, Effect } from "effect";
import { assertEvent, assign, fromPromise, setup } from "xstate";

import { RuntimeClient } from "../lib/runtime-client.ts";
import { MealPlans } from "../lib/services/meal-plans.ts";
import {
  createMealPlanInputFromFormData,
  dateKeyFromDate,
} from "../lib/utils.ts";

export const Route = createFileRoute("/plans/new")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  component: Component,
});

const submitMealPlanMachine = setup({
  types: {
    context: {} as {
      readonly energyKcal: number;
    },
    events: {} as
      | {
          readonly type: "submit";
          readonly formData: FormData;
          readonly dateKey: string | undefined;
          readonly navigate: UseNavigateResult<string>;
        }
      | {
          readonly type: "changeTargets";
          readonly formData: FormData;
        },
  },
  actors: {
    submitMealPlan: fromPromise<
      void,
      {
        readonly formData: FormData;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans;

          const mealPlanInput = yield* Effect.sync(() =>
            createMealPlanInputFromFormData({
              formData: input.formData,
            })
          );
          yield* mealPlans.create({ input: mealPlanInput });

          const today = dateKeyFromDate({
            date: yield* DateTime.nowAsDate,
          });
          const targetDateKey = input.dateKey ?? today;

          if (targetDateKey === today) {
            return yield* Effect.promise(() => input.navigate({ to: "/" }));
          }

          return yield* Effect.promise(() =>
            input.navigate({
              to: "/days/$dateKey",
              params: { dateKey: targetDateKey },
            })
          );
        })
      )
    ),
  },
}).createMachine({
  context: {
    energyKcal: 0,
  },
  initial: "Idle",
  on: {
    changeTargets: {
      actions: assign({
        energyKcal: ({ event }) => {
          assertEvent(event, "changeTargets");

          return calculateMacronutrientEnergyKcal({
            proteinGrams: _formNonNegativeNumber({
              formData: event.formData,
              name: "proteinTargetGrams",
            }),
            carbsGrams: _formNonNegativeNumber({
              formData: event.formData,
              name: "carbsTargetGrams",
            }),
            fatGrams: _formNonNegativeNumber({
              formData: event.formData,
              name: "fatTargetGrams",
            }),
          });
        },
      }),
    },
  },
  states: {
    Idle: {
      on: {
        submit: {
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "submitMealPlan",
        input: ({ event }) => {
          assertEvent(event, "submit");

          return {
            formData: event.formData,
            dateKey: event.dateKey,
            navigate: event.navigate,
          };
        },
        onDone: {
          target: "Created",
        },
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert("Could not create the meal plan.");
          },
        },
      },
    },
    Failure: {
      on: {
        submit: {
          target: "Submitting",
        },
      },
    },
    Created: {},
  },
});

function Component() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [snapshot, send] = useMachine(submitMealPlanMachine);
  const formattedEnergyKcal = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(snapshot.context.energyKcal);
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Created");

  return (
    <main className="app-shell">
      <section className="plan-create">
        <div className="page-heading">
          <p className="eyebrow">Meal plans</p>
          <h1>Create a meal plan</h1>
          <p className="lede">
            Set the default macro target used when opening a new day.
          </p>
        </div>

        <form
          className="plan-form"
          onInput={(event) => {
            send({
              type: "changeTargets",
              formData: new FormData(event.currentTarget),
            });
          }}
          onSubmit={(event) => {
            event.preventDefault();
            send({
              type: "submit",
              formData: new FormData(event.currentTarget),
              dateKey: search.dateKey,
              navigate,
            });
          }}
        >
          <label>
            Name
            <input
              autoComplete="off"
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <div className="macro-grid">
            <label>
              Protein
              <span className="input-with-unit">
                <input
                  inputMode="decimal"
                  min="0"
                  name="proteinTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span>g</span>
              </span>
            </label>

            <label>
              Carbs
              <span className="input-with-unit">
                <input
                  inputMode="decimal"
                  min="0"
                  name="carbsTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span>g</span>
              </span>
            </label>

            <label>
              Fat
              <span className="input-with-unit">
                <input
                  inputMode="decimal"
                  min="0"
                  name="fatTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span>g</span>
              </span>
            </label>
          </div>

          <output
            aria-live="polite"
            className="plan-calorie-preview"
            name="energyKcal"
          >
            <span>Calories</span>
            <strong>{formattedEnergyKcal}</strong>
            <span>kcal from macros</span>
          </output>

          <button disabled={isSubmitting} type="submit">
            {snapshot.matches("Failure") ? "Try again" : "Create plan"}
          </button>
        </form>
      </section>
    </main>
  );
}

function _formNonNegativeNumber({
  formData,
  name,
}: {
  readonly formData: FormData;
  readonly name: string;
}) {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}
