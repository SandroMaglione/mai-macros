import {
  Link,
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { calculateMacronutrientEnergyKcal } from "@mai/nutrition";
import { DateTime, Effect } from "effect";
import { ClipboardList, Flame, Plus, X } from "lucide-react";
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

type PlanTargetFieldName =
  | "proteinTargetGrams"
  | "carbsTargetGrams"
  | "fatTargetGrams"
  | "fiberTargetGrams"
  | "sugarTargetGrams"
  | "saturatedFatTargetGrams"
  | "saltTargetGrams";

type PlanTargetField = {
  readonly accentClassName: string;
  readonly label: string;
  readonly name: PlanTargetFieldName;
  readonly placeholder: string;
  readonly step: "0.1" | "0.01";
  readonly unit: "g";
};

const planFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const planFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";
const secondaryActionClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-4 text-sm font-black text-[#ff5a51] no-underline transition-colors hover:bg-[#2a1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45 sm:w-fit";

const macroTargetFields: readonly PlanTargetField[] = [
  {
    accentClassName: "text-[#4c7dff]",
    label: "Protein",
    name: "proteinTargetGrams",
    placeholder: "160",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Carbs",
    name: "carbsTargetGrams",
    placeholder: "220",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Fat",
    name: "fatTargetGrams",
    placeholder: "70",
    step: "0.1",
    unit: "g",
  },
];

const nutrientTargetFields: readonly PlanTargetField[] = [
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Fiber",
    name: "fiberTargetGrams",
    placeholder: "30",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Sugar",
    name: "sugarTargetGrams",
    placeholder: "50",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Saturated fat",
    name: "saturatedFatTargetGrams",
    placeholder: "20",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#aaaab1]",
    label: "Salt",
    name: "saltTargetGrams",
    placeholder: "6",
    step: "0.01",
    unit: "g",
  },
];

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
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <header className="sticky top-0 z-30 bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <div className="flex h-16 items-center gap-3 px-4">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <ClipboardList aria-hidden="true" size={24} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                Meal plans
              </p>
              <h1 className="truncate text-2xl font-black leading-tight text-white">
                Create plan
              </h1>
            </div>
          </div>
        </header>

        <form
          className="grid gap-4 px-4 py-5"
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
          <label className={planFieldLabelClassName}>
            Name
            <input
              autoComplete="off"
              className={planFieldClassName}
              disabled={isSubmitting}
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0_/_0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Macros
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
              {macroTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={isSubmitting}
                  field={field}
                  key={field.name}
                />
              ))}
            </div>

            <output
              aria-live="polite"
              className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-[#29292d] bg-[#111113] p-3 text-[#4c7dff]"
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
          </fieldset>

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0_/_0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Nutrient limits
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              {nutrientTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={isSubmitting}
                  field={field}
                  key={field.name}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60 sm:w-fit"
              disabled={isSubmitting}
              type="submit"
            >
              <Plus aria-hidden="true" size={18} strokeWidth={3} />
              {snapshot.matches("Failure") ? "Try again" : "Create plan"}
            </button>
            <BackToDayLink dateKey={search.dateKey} />
          </div>
        </form>
      </section>
    </main>
  );
}

function PlanTargetInput({
  disabled,
  field,
}: {
  readonly disabled: boolean;
  readonly field: PlanTargetField;
}) {
  return (
    <label className={planFieldLabelClassName}>
      <span className={field.accentClassName}>{field.label}</span>
      <span className="relative">
        <input
          className={`${planFieldClassName} pr-9`}
          disabled={disabled}
          inputMode="decimal"
          min="0"
          name={field.name}
          placeholder={field.placeholder}
          required
          step={field.step}
          type="number"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
          {field.unit}
        </span>
      </span>
    </label>
  );
}

function BackToDayLink({ dateKey }: { readonly dateKey: string | undefined }) {
  if (dateKey === undefined) {
    return (
      <Link className={secondaryActionClassName} to="/">
        <X aria-hidden="true" size={17} strokeWidth={3} />
        Cancel
      </Link>
    );
  }

  return (
    <Link
      className={secondaryActionClassName}
      params={{ dateKey }}
      to="/days/$dateKey"
    >
      <X aria-hidden="true" size={17} strokeWidth={3} />
      Cancel
    </Link>
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

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
}
