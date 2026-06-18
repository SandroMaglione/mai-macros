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
    <main className="min-h-screen px-2 py-3 sm:px-4">
      <section className="mx-auto flex w-full max-w-[430px] flex-col">
        <header className="mb-3 flex items-center gap-2">
          <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-stone-950 text-white">
            <ClipboardList aria-hidden="true" size={22} strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-black uppercase leading-tight tracking-normal text-stone-500">
              Meal plans
            </p>
            <h1 className="truncate text-xl font-black leading-tight text-stone-950">
              Create plan
            </h1>
          </div>
        </header>

        <form
          className="grid gap-3 rounded-lg border border-stone-200 bg-white p-3"
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
              className="min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Protein
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="proteinTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-stone-500">g</span>
              </span>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Carbs
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="carbsTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-stone-500">g</span>
              </span>
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Fat
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <input
                  className="min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                  inputMode="decimal"
                  min="0"
                  name="fatTargetGrams"
                  required
                  step="0.1"
                  type="number"
                />
                <span className="font-bold text-stone-500">g</span>
              </span>
            </label>
          </div>

          <output
            aria-live="polite"
            className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-stone-950"
            name="energyKcal"
          >
            <span className="inline-flex items-center gap-1.5 text-sm font-black uppercase tracking-normal">
              <Flame aria-hidden="true" size={18} strokeWidth={2.6} />
              Calories
            </span>
            <span className="grid justify-items-end gap-0.5">
              <strong className="text-3xl font-black leading-none">
                {formattedEnergyKcal}
              </strong>
              <span className="text-[0.68rem] font-black uppercase tracking-normal">
                kcal
              </span>
            </span>
          </output>

          <button
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-stone-950 bg-stone-950 px-4 text-sm font-bold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
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
