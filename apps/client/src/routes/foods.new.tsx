import {
  Link,
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { Apple, Plus, X } from "lucide-react";
import type { FocusEvent } from "react";
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

type FoodNutrientFieldName =
  | "energyKcalPer100g"
  | "proteinGramsPer100g"
  | "carbsGramsPer100g"
  | "fatGramsPer100g"
  | "fiberGramsPer100g"
  | "sugarGramsPer100g"
  | "saturatedFatGramsPer100g"
  | "saltGramsPer100g";

type FoodNutrientField = {
  readonly accentClassName: string;
  readonly label: string;
  readonly name: FoodNutrientFieldName;
  readonly placeholder: string;
  readonly step: "0.1" | "0.01";
  readonly unit: "g" | "kcal";
};

const foodFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const foodFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";
const secondaryActionClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-4 text-sm font-black text-[#ff5a51] no-underline transition-colors hover:bg-[#2a1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45 sm:w-fit";

const macroFields: readonly FoodNutrientField[] = [
  {
    accentClassName: "text-[#4c7dff]",
    label: "Calories",
    name: "energyKcalPer100g",
    placeholder: "62",
    step: "0.1",
    unit: "kcal",
  },
  {
    accentClassName: "text-[#4c7dff]",
    label: "Protein",
    name: "proteinGramsPer100g",
    placeholder: "10",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Carbs",
    name: "carbsGramsPer100g",
    placeholder: "3.6",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Fat",
    name: "fatGramsPer100g",
    placeholder: "0.4",
    step: "0.1",
    unit: "g",
  },
];

const nutrientFields: readonly FoodNutrientField[] = [
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Fiber",
    name: "fiberGramsPer100g",
    placeholder: "0",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Sugar",
    name: "sugarGramsPer100g",
    placeholder: "3.2",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Saturated fat",
    name: "saturatedFatGramsPer100g",
    placeholder: "0.1",
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#aaaab1]",
    label: "Salt",
    name: "saltGramsPer100g",
    placeholder: "0.1",
    step: "0.01",
    unit: "g",
  },
];

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
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <header className="sticky top-0 z-30 bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <div className="flex h-16 items-center gap-3 px-4">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <Apple aria-hidden="true" size={24} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                Foods
              </p>
              <h1 className="truncate text-2xl font-black leading-tight text-white">
                Create food
              </h1>
            </div>
          </div>
        </header>

        <form
          className="grid gap-4 px-4 py-5"
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
          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Details
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              <label className={foodFieldLabelClassName}>
                Name
                <input
                  autoComplete="off"
                  autoFocus
                  className={foodFieldClassName}
                  disabled={isSubmitting}
                  name="name"
                  onFocus={_selectInputText}
                  placeholder="Greek yogurt"
                  required
                />
              </label>

              <label className={foodFieldLabelClassName}>
                Brand
                <input
                  autoComplete="off"
                  className={foodFieldClassName}
                  disabled={isSubmitting}
                  name="brand"
                  onFocus={_selectInputText}
                  placeholder="Mai"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Calories and macros per 100g
            </legend>

            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              {macroFields.map((field) => (
                <FoodNutrientInput
                  disabled={isSubmitting}
                  field={field}
                  key={field.name}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Nutrient details per 100g
            </legend>

            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              {nutrientFields.map((field) => (
                <FoodNutrientInput
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
              {snapshot.matches("Failure") ? "Try again" : "Create food"}
            </button>
            <BackToDayLink dateKey={search.dateKey} />
          </div>
        </form>
      </section>
    </main>
  );
}

function FoodNutrientInput({
  disabled,
  field,
}: {
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
}) {
  const unitPaddingClassName = field.unit === "kcal" ? "pr-14" : "pr-9";

  return (
    <label className={foodFieldLabelClassName}>
      <span className={field.accentClassName}>{field.label}</span>
      <span className="relative">
        <input
          className={`${foodFieldClassName} ${unitPaddingClassName}`}
          disabled={disabled}
          inputMode="decimal"
          min="0"
          name={field.name}
          onFocus={_selectInputText}
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

function _selectInputText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}
