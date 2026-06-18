import {
  Link,
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { Apple, Plus, X } from "lucide-react";
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
    <main className="flex min-h-screen items-start justify-center px-4 py-5 sm:items-center sm:px-6 sm:py-8 lg:px-8">
      <section className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="mb-7 mt-6 grid justify-items-center text-center sm:mt-8">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/25">
            <Apple aria-hidden="true" size={30} strokeWidth={2.4} />
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-normal text-rose-700">
            Foods
          </p>
          <h1 className="text-3xl font-black leading-tight text-stone-950 sm:text-4xl">
            Create a food
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium leading-7 text-stone-700">
            Add nutrition values per 100g so the food can be used in daily logs.
          </p>
        </div>

        <form
          className="grid gap-5 rounded-lg border border-stone-200 bg-white/90 p-5 shadow-[0_18px_45px_rgb(15_23_42_/_0.08)] backdrop-blur sm:p-6"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Name
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                name="name"
                placeholder="Greek yogurt"
                required
              />
            </label>

            <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
              Brand
              <input
                autoComplete="off"
                className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                name="brand"
                placeholder="Mai"
              />
            </label>
          </div>

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-3 text-sm font-extrabold text-stone-800">
              Nutrition per 100g
            </legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Calories
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="energyKcalPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">kcal</span>
                </span>
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Protein
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="proteinGramsPer100g"
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
                    name="carbsGramsPer100g"
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
                    name="fatGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">g</span>
                </span>
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Fiber
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="fiberGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">g</span>
                </span>
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Sugar
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="sugarGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">g</span>
                </span>
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Saturated fat
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="saturatedFatGramsPer100g"
                    required
                    step="0.1"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">g</span>
                </span>
              </label>

              <label className="grid min-w-0 gap-2 text-sm font-bold text-stone-700">
                Salt
                <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    className="min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-70"
                    inputMode="decimal"
                    min="0"
                    name="saltGramsPer100g"
                    required
                    step="0.01"
                    type="number"
                  />
                  <span className="font-bold text-emerald-700">g</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-emerald-950 bg-emerald-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
              disabled={isSubmitting}
              type="submit"
            >
              <Plus aria-hidden="true" className="mr-2" size={18} />
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
      <Link
        className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
        to="/"
      >
        <X aria-hidden="true" className="mr-2" size={17} />
        Cancel
      </Link>
    );
  }

  return (
    <Link
      className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 no-underline shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
      params={{ dateKey }}
      to="/days/$dateKey"
    >
      <X aria-hidden="true" className="mr-2" size={17} />
      Cancel
    </Link>
  );
}
