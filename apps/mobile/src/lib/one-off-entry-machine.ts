import {
  OneOffFormValues as FormValues,
  OneOffNutrientField as NutrientField,
  decodeOneOffEntryForm,
  oneOffEntryErrorMessage,
} from "@mai/machines/one-off-entry-form";
import { RuntimeClient } from "@/lib/runtime-client";
import { Domain, DailyLogs, MealEntries, Reporting } from "@mai/nutrition";
import { EmptyEvent } from "@mai/machines/schemas";
import { Effect, Schema } from "effect";
import { router } from "expo-router";
import { createAsyncLogic, setup } from "xstate";

export const OneOffRoute = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Schema.NullOr(Domain.MealEntryId),
});
const SaveInput = Schema.Struct({ route: OneOffRoute, values: FormValues });
const LoadResult = Schema.Struct({
  entry: Schema.NullOr(Domain.OneOffMealEntry),
});
const MutationResult = Schema.Union([
  Schema.TaggedStruct("Success", {}),
  Schema.TaggedStruct("Invalid", { message: Schema.String }),
]);
export const oneOffEntryMachine = setup({
  schemas: {
    input: Schema.toStandardSchemaV1(OneOffRoute),
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        route: OneOffRoute,
        values: FormValues,
        notice: Schema.NullOr(Schema.String),
      })
    ),
    events: {
      text: Schema.toStandardSchemaV1(
        Schema.Struct({
          field: Schema.Literals(["name", "amountDescription", "note"]),
          value: Schema.String,
        })
      ),
      nutrient: Schema.toStandardSchemaV1(
        Schema.Struct({
          field: Schema.Literals(Reporting.NutrientNames),
          value: Schema.String,
        })
      ),
      source: Schema.toStandardSchemaV1(
        Schema.Struct({
          field: Schema.Literals(Reporting.NutrientNames),
          source: Schema.Literals(["Recorded", "Estimated"]),
        })
      ),
      save: Schema.toStandardSchemaV1(EmptyEvent),
      delete: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  actorSources: {
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(OneOffRoute),
        output: Schema.toStandardSchemaV1(LoadResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const logs = yield* DailyLogs.DailyLogs;
            const day = yield* logs.open({ input: { dateKey: input.dateKey } });
            if (
              day._tag === "UnrecordedDay" ||
              !day.selectedPlan.meals.some((meal) => meal.id === input.meal)
            )
              return yield* Effect.fail("Meal unavailable");
            if (input.mealEntryId === null) return { entry: null };
            const service = yield* MealEntries.MealEntries;
            const entry = (yield* service.listForDay({
              input: { dateKey: input.dateKey },
            })).find(
              (entry) =>
                entry.id === input.mealEntryId && entry.mealId === input.meal
            );
            if (entry?.kind !== "one-off")
              return yield* Effect.fail("Entry unavailable");
            return { entry };
          })
        ),
    }),
    save: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SaveInput),
        output: Schema.toStandardSchemaV1(MutationResult),
      },
      run: ({ input: { route, values } }) =>
        RuntimeClient.runPromise(
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
            return { _tag: "Success" as const };
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed({
                _tag: "Invalid" as const,
                message: oneOffEntryErrorMessage({ error, action: "save" }),
              })
            )
          )
        ),
    }),
    delete: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(Domain.MealEntryId),
        output: Schema.toStandardSchemaV1(Schema.Boolean),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const service = yield* MealEntries.MealEntries;
            yield* service.delete({ input: { mealEntryId: input } });
            return true;
          })
        ),
    }),
  },
  states: {
    Loading: {},
    Failure: {},
    Ready: {},
    Saving: {},
    Deleting: {},
    Done: {},
  },
}).createMachine({
  context: ({ input }) => ({
    route: input,
    values: _formValues(null),
    notice: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => context.route,
        onDone: ({ event }) => ({
          target: "Ready",
          context: { values: _formValues(event.output.entry) },
        }),
        onError: ({ event }) => ({
          target: "Failure",
          context: {
            notice: oneOffEntryErrorMessage({
              error: event.error,
              action: "open",
            }),
          },
        }),
      },
    },
    Failure: { on: { retry: { target: "Loading" } } },
    Ready: {
      on: {
        text: ({ context, event }) => ({
          context: {
            values: { ...context.values, [event.field]: event.value },
          },
        }),
        nutrient: ({ context, event }) => ({
          context: {
            values: {
              ...context.values,
              nutrients: {
                ...context.values.nutrients,
                [event.field]: {
                  ...context.values.nutrients[event.field],
                  value: event.value,
                },
              },
            },
          },
        }),
        source: ({ context, event }) => ({
          context: {
            values: {
              ...context.values,
              nutrients: {
                ...context.values.nutrients,
                [event.field]: {
                  ...context.values.nutrients[event.field],
                  source: event.source,
                },
              },
            },
          },
        }),
        save: { target: "Saving", context: { notice: null } },
        delete: ({ context }) =>
          context.route.mealEntryId === null
            ? undefined
            : { target: "Deleting", context: { notice: null } },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ context }) => ({
          route: context.route,
          values: context.values,
        }),
        onDone: ({ event }) =>
          event.output._tag === "Success"
            ? { target: "Done" }
            : { target: "Ready", context: { notice: event.output.message } },
        onError: ({ event }) => ({
          target: "Ready",
          context: {
            notice: oneOffEntryErrorMessage({
              error: event.error,
              action: "save",
            }),
          },
        }),
      },
    },
    Deleting: {
      invoke: {
        src: "delete",
        input: ({ context }) => {
          if (context.route.mealEntryId === null)
            throw new Error("Missing meal entry");
          return context.route.mealEntryId;
        },
        onDone: { target: "Done" },
        onError: ({ event }) => ({
          target: "Ready",
          context: {
            notice: oneOffEntryErrorMessage({
              error: event.error,
              action: "delete",
            }),
          },
        }),
      },
    },
    Done: {
      entry: ({ context }) =>
        router.replace({
          pathname: "/days/[dateKey]",
          params: { dateKey: context.route.dateKey },
        }),
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
