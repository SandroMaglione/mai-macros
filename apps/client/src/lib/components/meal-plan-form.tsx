import type { Plan } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { ClipboardList, Flame, Plus, Save, X } from "lucide-react";

import {
  BackupTransferControls,
  type BackupTransferMode,
} from "./backup-transfer-controls.tsx";
import type { BackupTransferActorRef } from "../machines/backup-transfer-machine.ts";
import type { MealPlanFormActorRef } from "../machines/meal-plan-form-machine.ts";

type MealPlanFormAction = "create" | "edit";

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
const secondaryActionClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-4 text-sm font-black text-[#ff5a51] no-underline transition-colors hover:bg-[#2a1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45 sm:w-fit";

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

export function MealPlanForm({
  action,
  actor,
  backupTransferActor = null,
  backupTransferMode = "importOnly",
  dateKey,
  initialPlan,
}: {
  readonly action: MealPlanFormAction;
  readonly actor: MealPlanFormActorRef;
  readonly backupTransferActor?: BackupTransferActorRef | null;
  readonly backupTransferMode?: BackupTransferMode;
  readonly dateKey: string | undefined;
  readonly initialPlan: Plan | null;
}) {
  const snapshot = useSelector(actor, (state) => state);
  const disabled =
    snapshot.value === "Submitting" ||
    snapshot.value === "Created" ||
    snapshot.value === "Revised";
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
        <header className="sticky top-0 z-30 bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4">
            <BackToDayIconLink dateKey={dateKey} />
            <div className="flex min-w-0 items-center gap-3">
              <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                <ClipboardList aria-hidden="true" size={24} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                  Meal plans
                </p>
                <h1 className="truncate text-2xl font-black leading-tight text-white">
                  {title}
                </h1>
              </div>
            </div>
            <span aria-hidden="true" className="size-10" />
          </div>
        </header>

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
            actor.send({
              type: "submit",
              formData: new FormData(event.currentTarget),
            });
          }}
        >
          <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-sm font-bold leading-snug text-[#aaaab1]">
            {isCreating
              ? "Creating a plan makes it the active meal plan."
              : "Saving replaces this plan if it has no recorded meals. If logs already use it, Mai preserves those logs and creates a revised plan for the selected day."}
          </p>

          <label className={planFieldLabelClassName}>
            Name
            <input
              autoComplete="off"
              className={planFieldClassName}
              defaultValue={initialPlan?.name}
              disabled={disabled}
              name="name"
              placeholder="Training day"
              required
            />
          </label>

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Macros
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
              {macroTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={disabled}
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

          <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
            <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
              Nutrient limits
            </legend>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              {nutrientTargetFields.map((field) => (
                <PlanTargetInput
                  disabled={disabled}
                  field={field}
                  initialPlan={initialPlan}
                  key={field.name}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60 sm:w-fit"
              disabled={disabled}
              type="submit"
            >
              <SubmitIcon aria-hidden="true" size={18} strokeWidth={3} />
              {submitText}
            </button>
            <BackToDayLink dateKey={dateKey} />
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
  readonly initialPlan: Plan | null;
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

function BackToDayIconLink({
  dateKey,
}: {
  readonly dateKey: string | undefined;
}) {
  const className =
    "inline-flex size-10 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white no-underline transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  if (dateKey === undefined) {
    return (
      <Link aria-label="Back to today" className={className} to="/">
        <X aria-hidden="true" size={18} strokeWidth={3} />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Back to day"
      className={className}
      params={{ dateKey }}
      to="/days/$dateKey"
    >
      <X aria-hidden="true" size={18} strokeWidth={3} />
    </Link>
  );
}
