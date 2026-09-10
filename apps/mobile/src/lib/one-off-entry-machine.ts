import {
  OneOffFormValues as FormValues,
  OneOffNutrientField as NutrientField,
  decodeOneOffEntryForm,
  oneOffEntryErrorMessage,
} from "@mai/machines/one-off-entry-form";
import { Domain, DailyLogs, MealEntries, Reporting } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Data, Effect, Optic, Schema } from "effect";
import { Router } from "./router";

export const OneOffRoute = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Schema.NullOr(Domain.MealEntryId),
});

class OneOffEntryDefect extends Data.TaggedError("OneOffEntryDefect")<{
  readonly cause: unknown;
}> {}

export const OneOffEntryStates = Machine.state({
  fields: { route: OneOffRoute, values: FormValues },
  states: {
    Loading: {},
    Failure: { fields: { message: Schema.String } },
    Ready: { fields: { notice: Schema.NullOr(Schema.String) } },
    Saving: {},
    Deleting: { fields: { mealEntryId: Domain.MealEntryId } },
    Done: {},
  },
});

export const OneOffEntryEvents = Machine.events({
  text: {
    field: Schema.Literals(["name", "amountDescription", "note"]),
    value: Schema.String,
  },
  nutrient: {
    field: Schema.Literals(Reporting.NutrientNames),
    value: Schema.String,
  },
  source: {
    field: Schema.Literals(Reporting.NutrientNames),
    source: Schema.Literals(["Recorded", "Estimated"]),
  },
  save: {},
  delete: {},
  retry: {},
});

const formValues =
  Optic.id<Machine.Snapshot<typeof OneOffEntryStates>["value"]>().key("values");
const nutrients = formValues.key("nutrients");

const targets = Machine.targets(OneOffEntryStates);

export const oneOffEntryMachine = Machine.make({
  id: "OneOffEntry",
  root: OneOffEntryStates,
  events: OneOffEntryEvents,
  input: OneOffRoute,
  effects: {
    load: (route: typeof OneOffRoute.Type) =>
      Effect.gen(function* () {
        const logs = yield* DailyLogs.DailyLogs;
        const day = yield* logs.open({
          input: { dateKey: route.dateKey },
        });
        if (
          day._tag === "UnrecordedDay" ||
          !day.selectedPlan.meals.some((meal) => meal.id === route.meal)
        )
          return yield* Effect.fail("Meal unavailable");
        if (route.mealEntryId === null) return null;
        const service = yield* MealEntries.MealEntries;
        const entry = (yield* service.listForDay({
          input: { dateKey: route.dateKey },
        })).find(
          (entry) =>
            entry.id === route.mealEntryId && entry.mealId === route.meal
        );
        if (entry?.kind !== "one-off")
          return yield* Effect.fail("Entry unavailable");
        return entry;
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new OneOffEntryDefect({ cause }))
        )
      ),
    save: ({
      route,
      values,
    }: {
      readonly route: typeof OneOffRoute.Type;
      readonly values: typeof FormValues.Type;
    }) =>
      Effect.gen(function* () {
        const details = yield* decodeOneOffEntryForm(values);
        const service = yield* MealEntries.MealEntries;
        if (route.mealEntryId === null)
          yield* service.createOneOff({
            input: {
              ...details,
              dateKey: route.dateKey,
              mealId: route.meal,
            },
          });
        else
          yield* service.reviseOneOff({
            input: { ...details, mealEntryId: route.mealEntryId },
          });
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new OneOffEntryDefect({ cause }))
        )
      ),
    delete: (mealEntryId: Domain.MealEntryId) =>
      Effect.gen(function* () {
        const service = yield* MealEntries.MealEntries;
        yield* service.delete({
          input: { mealEntryId },
        });
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new OneOffEntryDefect({ cause }))
        )
      ),
    backToDay: (dateKey: Domain.DateKey) =>
      Effect.flatMap(Router, (router) =>
        router.replace({
          pathname: "/days/[dateKey]",
          params: { dateKey },
        })
      ),
  },
  branches: {
    deleteEntry: {
      missingEntry: { none: true },
      existingEntry: { target: targets.root.Deleting },
    },
  },
}).handle({
  root: ({ input }) => ({ route: input, values: _formValues(null) }),
  initial: { target: targets.root.Loading },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.route,
        onDone: {
          target: targets.root.Ready,
          update: targets.root,
          data: ({ root: current, output }) => ({
            target: { notice: null },
            update: { ...current, values: _formValues(output) },
          }),
        },
        onFailure: {
          target: targets.root.Failure,
          data: ({ error }) => ({
            message: oneOffEntryErrorMessage({ error, action: "open" }),
          }),
        },
      },
    },
    Failure: { on: { retry: { target: targets.root.Loading } } },
    Ready: {
      on: {
        text: {
          update: targets.root,
          data: ({ root: current, event }) =>
            formValues.key(event.field).replace(event.value, current),
        },
        nutrient: {
          update: targets.root,
          data: ({ root: current, event }) =>
            nutrients
              .key(event.field)
              .key("value")
              .replace(event.value, current),
        },
        source: {
          update: targets.root,
          data: ({ root: current, event }) =>
            nutrients
              .key(event.field)
              .key("source")
              .replace(event.source, current),
        },
        save: { target: targets.root.Saving },
        delete: {
          branches: "deleteEntry",
          resolve: ({ containingState: { route }, select }) =>
            route.mealEntryId === null
              ? select.missingEntry()
              : select.existingEntry({
                  data: { mealEntryId: route.mealEntryId },
                }),
        },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ root }) => root,
        onDone: { target: targets.root.Done },
        onFailure: {
          target: targets.root.Ready,
          data: ({ error }) => ({
            notice: oneOffEntryErrorMessage({ error, action: "save" }),
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "delete",
        input: ({ state }) => state.mealEntryId,
        onDone: { target: targets.root.Done },
        onFailure: {
          target: targets.root.Ready,
          data: ({ error }) => ({
            notice: oneOffEntryErrorMessage({ error, action: "delete" }),
          }),
        },
      },
    },
    Done: {
      invoke: {
        src: "backToDay",
        input: ({ root }) => root.route.dateKey,
        onDone: { none: true },
      },
    },
  },
});

function _formField(
  value: Domain.NutrientValue | undefined
): typeof NutrientField.Type {
  return {
    value:
      value === undefined || value._tag === "Unknown"
        ? ""
        : String(value.value),
    source: value?._tag === "Recorded" ? "Recorded" : "Estimated",
  };
}

function _formValues(
  entry: Domain.OneOffMealEntry | null
): typeof FormValues.Type {
  return {
    name: entry?.name ?? "",
    amountDescription: entry?.amountDescription ?? "",
    note: entry?.note ?? "",
    nutrients: {
      energyKcal: _formField(entry?.nutrients.energyKcal),
      proteinGrams: _formField(entry?.nutrients.proteinGrams),
      carbsGrams: _formField(entry?.nutrients.carbsGrams),
      fatGrams: _formField(entry?.nutrients.fatGrams),
      fiberGrams: _formField(entry?.nutrients.fiberGrams),
      sugarGrams: _formField(entry?.nutrients.sugarGrams),
      saturatedFatGrams: _formField(entry?.nutrients.saturatedFatGrams),
      saltGrams: _formField(entry?.nutrients.saltGrams),
    },
  };
}
