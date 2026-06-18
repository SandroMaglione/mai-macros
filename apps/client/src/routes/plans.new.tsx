import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { calculateMacronutrientEnergyKcal } from "@mai/nutrition";
import { DateTime, Effect } from "effect";
import { ClipboardList, Flame, Plus } from "lucide-react";
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
    <main className="flex min-h-screen items-start justify-center px-4 py-5 sm:items-center sm:px-6 sm:py-8 lg:px-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="mb-7 mt-6 grid justify-items-center text-center sm:mt-8">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
            <ClipboardList aria-hidden="true" size={30} strokeWidth={2.4} />
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-normal text-emerald-700">
            Meal plans
          </p>
          <h1 className="text-3xl font-black leading-tight text-stone-950 sm:text-4xl">
            Create a meal plan
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium leading-7 text-stone-700">
            Set the default macro target used when opening a new day.
          </p>
        </div>

        <form
          className="grid gap-5 rounded-lg border border-stone-200 bg-white/90 p-5 shadow-[0_18px_45px_rgb(15_23_42_/_0.08)] backdrop-blur sm:p-6"
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
          <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
            Name
            <input
              autoComplete="off"
              className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Protein
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="proteinTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-emerald-700">g</span>
              </span>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Carbs
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="carbsTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-emerald-700">g</span>
              </span>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Fat
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="fatTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-emerald-700">g</span>
              </span>
            </label>
          </div>

          <output
            aria-live="polite"
            className="flex flex-col gap-3 rounded-lg border-2 border-orange-300 bg-orange-100 p-5 text-orange-950 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            name="energyKcal"
          >
            <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-normal">
              <Flame aria-hidden="true" size={20} strokeWidth={2.6} />
              Calories
            </span>
            <span className="flex items-baseline gap-2">
              <strong className="text-4xl font-black leading-none">
                {formattedEnergyKcal}
              </strong>
              <span className="text-sm font-black uppercase tracking-normal">
                kcal from macros
              </span>
            </span>
          </output>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-emerald-950 bg-emerald-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
            disabled={isSubmitting}
            type="submit"
          >
            <Plus aria-hidden="true" className="mr-2" size={18} />
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
