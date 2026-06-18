import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { fromPromise, setup } from "xstate";

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
    events: {} as {
      readonly type: "submit";
      readonly formData: FormData;
      readonly dateKey: string | undefined;
      readonly navigate: UseNavigateResult<string>;
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
  initial: "Idle",
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
        input: ({ event }) => ({
          formData: event.formData,
          dateKey: event.dateKey,
          navigate: event.navigate,
        }),
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

          <button disabled={isSubmitting} type="submit">
            {snapshot.matches("Failure") ? "Try again" : "Create plan"}
          </button>
        </form>
      </section>
    </main>
  );
}
