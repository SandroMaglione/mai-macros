import {
  Link,
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { fromPromise, setup } from "xstate";

import { RuntimeClient } from "../lib/runtime-client.ts";
import { Foods } from "../lib/services/foods.ts";
import { createFoodInputFromFormData, dateKeyFromDate } from "../lib/utils.ts";

export const Route = createFileRoute("/foods/new")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  component: Component,
});

const submitFoodMachine = setup({
  types: {
    events: {} as {
      readonly type: "submit";
      readonly formData: FormData;
      readonly dateKey: string | undefined;
      readonly navigate: UseNavigateResult<string>;
    },
  },
  actors: {
    submitFood: fromPromise<
      void,
      {
        readonly formData: FormData;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods;
          const foodInput = yield* Effect.sync(() =>
            createFoodInputFromFormData({
              formData: input.formData,
            })
          );
          yield* foods.create({ input: foodInput });

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
        src: "submitFood",
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
            globalThis.alert("Could not create the food.");
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
  const [snapshot, send] = useMachine(submitFoodMachine);
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Created");

  return (
    <main className="app-shell">
      <section className="food-create">
        <div className="page-heading">
          <p className="eyebrow">Foods</p>
          <h1>Create a food</h1>
          <p className="lede">
            Add nutrition values per 100g so the food can be used in daily logs.
          </p>
        </div>

        <form
          className="food-form"
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
          <div className="form-section">
            <label>
              Name
              <input
                autoComplete="off"
                name="name"
                placeholder="Greek yogurt"
                required
              />
            </label>

            <label>
              Brand
              <input autoComplete="off" name="brand" placeholder="Mai" />
            </label>
          </div>

          <fieldset>
            <legend>Nutrition per 100g</legend>

            <div className="macro-grid">
              <label>
                Calories
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="energyKcalPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>kcal</span>
                </span>
              </label>

              <label>
                Protein
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="proteinGramsPer100g"
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
                    name="carbsGramsPer100g"
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
                    name="fatGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>g</span>
                </span>
              </label>

              <label>
                Fiber
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="fiberGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>g</span>
                </span>
              </label>

              <label>
                Sugar
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="sugarGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>g</span>
                </span>
              </label>

              <label>
                Saturated fat
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="saturatedFatGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span>g</span>
                </span>
              </label>

              <label>
                Salt
                <span className="input-with-unit">
                  <input
                    inputMode="decimal"
                    min="0"
                    name="saltGramsPer100g"
                    required
                    step="0.01"
                    type="number"
                  />
                  <span>g</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {snapshot.matches("Failure") ? "Try again" : "Create food"}
            </button>
            <BackToDayLink dateKey={search.dateKey} />
          </div>
        </form>
      </section>
    </main>
  );
}

function BackToDayLink({ dateKey }: { readonly dateKey: string | undefined }) {
  if (dateKey === undefined) {
    return (
      <Link className="secondary-link" to="/">
        Cancel
      </Link>
    );
  }

  return (
    <Link className="secondary-link" params={{ dateKey }} to="/days/$dateKey">
      Cancel
    </Link>
  );
}
