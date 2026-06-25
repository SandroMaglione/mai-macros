import type { BackupTransferMachine } from "@mai/machines";
import type { Domain } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { useMachine, useSelector } from "@xstate/react";
import { ChevronLeft, Flame, Plus, Save, Trash2 } from "lucide-react";
import { assign, setup } from "xstate";

import { AppHeader, appHeaderActionClassName } from "./app-header.tsx";
import {
  BackupTransferControls,
  type BackupTransferMode,
} from "./backup-transfer-controls.tsx";
import type { MealPlanFormActorRef } from "../machines/meal-plan-form-machine.ts";

type MealPlanFormAction = "create" | "edit";

type MealPlanSubmitEvent = {
  readonly type: "submit";
  readonly formData: FormData;
};

type MealPlanFormMealRow = {
  readonly id?: Domain.MealId;
  readonly name: string;
};

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
  readonly required: boolean;
  readonly step: "0.1" | "0.01";
  readonly unit: "g";
};

const planFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const planFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

const macroTargetFields: readonly PlanTargetField[] = [
  {
    accentClassName: "text-[#4c7dff]",
    label: "Protein",
    name: "proteinTargetGrams",
    placeholder: "160",
    required: true,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Carbs",
    name: "carbsTargetGrams",
    placeholder: "220",
    required: true,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Fat",
    name: "fatTargetGrams",
    placeholder: "70",
    required: true,
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
    required: false,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Sugar",
    name: "sugarTargetGrams",
    placeholder: "50",
    required: false,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Saturated fat",
    name: "saturatedFatTargetGrams",
    placeholder: "20",
    required: false,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#aaaab1]",
    label: "Salt",
    name: "saltTargetGrams",
    placeholder: "6",
    required: false,
    step: "0.01",
    unit: "g",
  },
];

const defaultMealRows = [
  { name: "Breakfast" },
  { name: "Lunch" },
  { name: "Dinner" },
] satisfies readonly MealPlanFormMealRow[];

const mealPlanFormMealRowsMachine = setup({
  types: {
    context: {} as {
      readonly mealRows: readonly MealPlanFormMealRow[];
    },
    events: {} as
      | {
          readonly type: "addMeal";
        }
      | {
          readonly index: number;
          readonly type: "changeMealName";
          readonly value: string;
        }
      | {
          readonly index: number;
          readonly type: "removeMeal";
        },
    input: {} as {
      readonly initialPlan: Domain.Plan | null;
    },
  },
}).createMachine({
  context: ({ input }) => ({
    mealRows:
      input.initialPlan === null
        ? defaultMealRows
        : [...input.initialPlan.meals]
            .sort((left, right) => left.position - right.position)
            .map((meal) => ({
              id: meal.id,
              name: meal.name,
            })),
  }),
  on: {
    addMeal: {
      actions: assign(({ context }) => ({
        mealRows: [...context.mealRows, { name: "" }],
      })),
    },
    changeMealName: {
      actions: assign(({ context, event }) => ({
        mealRows: context.mealRows.map((meal, index) =>
          index === event.index
            ? {
                ...meal,
                name: event.value,
              }
            : meal
        ),
      })),
    },
    removeMeal: {
      actions: assign(({ context, event }) => ({
        mealRows:
          context.mealRows.length <= 1
            ? context.mealRows
            : context.mealRows.flatMap((meal, index) =>
                index === event.index ? [] : [meal]
              ),
      })),
    },
  },
});

export function MealPlanForm({
  action,
  actor,
  backupTransferActor = null,
  backupTransferMode = "importOnly",
  canNavigateBack = true,
  dateKey,
  initialPlan,
}: {
  readonly action: MealPlanFormAction;
  readonly actor: MealPlanFormActorRef;
  readonly backupTransferActor?: BackupTransferMachine.BackupTransferActorRef | null;
  readonly backupTransferMode?: BackupTransferMode;
  readonly canNavigateBack?: boolean;
  readonly dateKey: string | undefined;
  readonly initialPlan: Domain.Plan | null;
}) {
  const [mealRowsSnapshot, sendMealRows] = useMachine(
    mealPlanFormMealRowsMachine,
    {
      input: {
        initialPlan,
      },
    }
  );
  const mealRows = mealRowsSnapshot.context.mealRows;
  const snapshot = useSelector(actor, (state) => state);
  const formDisabled =
    snapshot.value === "Submitting" ||
    snapshot.value === "Created" ||
    snapshot.value === "Revised";
  const submitDisabled = formDisabled;
  const formattedEnergyKcal = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(snapshot.context.energyKcal);
  const hasFailed = snapshot.value === "Failure";
  const isCreating = action === "create";
  const SubmitIcon = isCreating ? Plus : Save;
  const title = isCreating ? "Create plan" : "Edit plan";
  const submitText = hasFailed
    ? "Try again"
    : isCreating
      ? title
      : "Save revised plan";

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <AppHeader
          leading={
            canNavigateBack ? <BackToDayIconLink dateKey={dateKey} /> : null
          }
          shadow={true}
          sticky={true}
          title={title}
        />

        <form
          className="grid gap-4 px-4 py-5"
          onInput={(event) => {
            actor.send({
              type: "changeTargets",
              formData: new FormData(event.currentTarget),
            });
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const submitEvent = {
              type: "submit",
              formData: new FormData(event.currentTarget),
            } satisfies MealPlanSubmitEvent;

            if (formDisabled || !snapshot.can(submitEvent)) {
              return;
            }

            actor.send(submitEvent);
          }}
        >
          <label className={planFieldLabelClassName}>
            Name
            <input
              autoComplete="off"
              className={planFieldClassName}
              defaultValue={initialPlan?.name}
              disabled={formDisabled}
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Meals
            </legend>
            <div className="grid gap-3">
              {mealRows.map((meal, index) => (
                <label
                  className={planFieldLabelClassName}
                  key={meal.id ?? index}
                >
                  Meal {index + 1}
                  <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input name="mealId" type="hidden" value={meal.id ?? ""} />
                    <input
                      autoComplete="off"
                      className={planFieldClassName}
                      disabled={formDisabled}
                      name="mealName"
                      onChange={(event) => {
                        sendMealRows({
                          type: "changeMealName",
                          index,
                          value: event.currentTarget.value,
                        });
                      }}
                      placeholder="Meal name"
                      required
                      value={meal.name}
                    />
                    <button
                      aria-label={`Remove meal ${index + 1}`}
                      className="inline-flex size-10 items-center justify-center rounded-md border border-[#37373b] bg-[#111113] text-[#aaaab1] transition hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={formDisabled || mealRows.length <= 1}
                      onClick={() => {
                        sendMealRows({
                          type: "removeMeal",
                          index,
                        });
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={3} />
                    </button>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="btn-secondary w-fit"
              disabled={formDisabled}
              onClick={() => {
                sendMealRows({
                  type: "addMeal",
                });
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={16} strokeWidth={3} />
              Add meal
            </button>
          </fieldset>

          <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Macros
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
              {macroTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={formDisabled}
                  field={field}
                  initialPlan={initialPlan}
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

          <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Nutrient limits
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              {nutrientTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={formDisabled}
                  field={field}
                  initialPlan={initialPlan}
                  key={field.name}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="btn-primary sm:w-fit"
              disabled={submitDisabled}
              type="submit"
            >
              <SubmitIcon aria-hidden="true" size={18} strokeWidth={3} />
              {submitText}
            </button>
          </div>
        </form>

        {backupTransferActor === null ? null : (
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <BackupTransferControls
              actor={backupTransferActor}
              mode={backupTransferMode}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function PlanTargetInput({
  disabled,
  field,
  initialPlan,
}: {
  readonly disabled: boolean;
  readonly field: PlanTargetField;
  readonly initialPlan: Domain.Plan | null;
}) {
  return (
    <label className={planFieldLabelClassName}>
      <span className={field.accentClassName}>{field.label}</span>
      <span className="relative">
        <input
          className={`${planFieldClassName} pr-9`}
          defaultValue={initialPlan?.[field.name]}
          disabled={disabled}
          inputMode="decimal"
          min="0"
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
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

function BackToDayIconLink({
  dateKey,
}: {
  readonly dateKey: string | undefined;
}) {
  if (dateKey === undefined) {
    return (
      <Link
        aria-label="Back to today"
        className={appHeaderActionClassName}
        title="Back to today"
        to="/"
      >
        <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Back to day"
      className={appHeaderActionClassName}
      params={{ dateKey }}
      title={`Back to ${dateKey}`}
      to="/days/$dateKey"
    >
      <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
    </Link>
  );
}
