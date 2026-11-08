import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Match, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { Navigation } from "./services/navigation.ts";

export const EditMealEntryData = Schema.Struct({
  dateKey: Domain.DateKey,
  food: Schema.UndefinedOr(Domain.Food),
  meal: Domain.MealId,
  mealLabel: Schema.NonEmptyString,
  mealEntry: Domain.CatalogMealEntry,
});

export type EditMealEntryData = typeof EditMealEntryData.Type;

const EditMealEntryRoute = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

const _mutationNotice = ({
  error,
  fallback,
}: {
  readonly error: { readonly _tag: string };
  readonly fallback: string;
}) =>
  Match.value(error).pipe(
    Match.tags({
      MealEntryNotFound: () => "This meal entry is no longer available.",
      SchemaError: () => "Enter a quantity greater than zero.",
    }),
    Match.orElse(() => fallback)
  );

export const EditMealEntryLoaderStates = Machine.state({
  fields: EditMealEntryRoute.fields,
  states: {
    Loading: {},
    InvalidRoute: {},
    Ready: { fields: { data: EditMealEntryData } },
  },
});

export const EditMealEntryLoaderMachine = Machine.make({
  id: "EditMealEntryLoader",
  root: EditMealEntryLoaderStates,
  events: Machine.events({}),
  input: EditMealEntryRoute,
  effects: {
    load: ({ dateKey, meal, mealEntryId }: typeof EditMealEntryRoute.Type) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const today = yield* Effect.sync(todayDateKey);
        const day = yield* dateKey === today
          ? dailyLogs.openOrCreate({ input: { dateKey } })
          : dailyLogs.open({ input: { dateKey } });

        if (day._tag === "UnrecordedDay") {
          return { _tag: "InvalidRoute" as const };
        }

        const planMeal = day.selectedPlan.meals.find(
          (candidate) => candidate.id === meal
        );

        if (planMeal === undefined) {
          return { _tag: "InvalidRoute" as const };
        }

        const mealEntries = yield* mealEntriesService.listForDay({
          input: { dateKey },
        });
        const mealEntry = mealEntries.find(
          (entry) => entry.id === mealEntryId && entry.mealId === meal
        );

        if (mealEntry === undefined || mealEntry.kind !== "catalog") {
          return { _tag: "InvalidRoute" as const };
        }

        const food = yield* foodsService.get({
          input: { foodId: mealEntry.foodId },
        });

        return {
          _tag: "Ready" as const,
          data: {
            dateKey,
            food,
            meal,
            mealLabel: planMeal.name,
            mealEntry,
          },
        };
      }),
    replaceHome: Effect.gen(function* () {
      const navigation = yield* Navigation;

      yield* navigation.replace("/");
    }),
  },
  branches: {
    loaded: {
      invalidRoute: { target: "InvalidRoute" },
      ready: { target: "Ready" },
    },
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    meal: input.meal,
    mealEntryId: input.mealEntryId,
  }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => ({
          dateKey: root.dateKey,
          meal: root.meal,
          mealEntryId: root.mealEntryId,
        }),
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            output._tag === "Ready"
              ? select.ready({ data: { data: output.data } })
              : select.invalidRoute(),
        },
        onFailure: { target: "InvalidRoute" },
      },
    },
    InvalidRoute: {
      invoke: { src: "replaceHome", onDone: { none: true } },
    },
    Ready: {},
  },
});

export const EditMealEntryStates = Machine.state({
  fields: {
    data: EditMealEntryData,
    notice: Schema.NullOr(Schema.String),
    portionId: Schema.NullOr(Domain.FoodPortionId),
    quantityAccuracy: Domain.QuantityAccuracy,
    quantityAmount: Schema.String,
    quantityUnit: Domain.MeasurementUnit,
  },
  states: {
    Ready: {},
    Deleting: {},
    Saving: {},
    Deleted: {},
    Saved: {},
  },
});

export const EditMealEntryEvents = Machine.events({
  ChangeAccuracy: { accuracy: Domain.QuantityAccuracy },
  ChangeQuantity: { quantityAmount: Schema.String },
  Delete: {},
  SelectMeasurementUnit: { unit: Domain.MeasurementUnit },
  SelectPortion: { portionId: Domain.FoodPortionId },
  Submit: {},
});

export const EditMealEntryMachine = Machine.make({
  id: "EditMealEntry",
  root: EditMealEntryStates,
  events: EditMealEntryEvents,
  input: EditMealEntryData,
  effects: {
    deleteMealEntry: (mealEntryId: Domain.MealEntryId) =>
      Effect.gen(function* () {
        const mealEntries = yield* MealEntries.MealEntries;

        yield* mealEntries.delete({ input: { mealEntryId } });
      }),
    reviseMealEntry: (input: MealEntries.ReviseMealEntryInput) =>
      Effect.gen(function* () {
        const mealEntries = yield* MealEntries.MealEntries;

        yield* mealEntries.revise({ input });
      }),
    replaceDay: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace({
          pathname: "/days/[dateKey]",
          params: { dateKey },
        });
      }),
  },
}).handle({
  root: ({ input }) => {
    const quantity = input.mealEntry.quantity;

    return {
      data: input,
      notice: null,
      portionId:
        quantity._tag === "PortionFoodQuantity" ? quantity.portionId : null,
      quantityAccuracy: input.mealEntry.quantityAccuracy,
      quantityAmount: `${
        quantity._tag === "MeasuredFoodQuantity"
          ? quantity.amount
          : quantity.count
      }`,
      quantityUnit:
        quantity._tag === "MeasuredFoodQuantity"
          ? quantity.unit
          : quantity.portionSize.unit,
    };
  },
  initial: { target: "Ready" },
  states: {
    Ready: {
      on: {
        ChangeAccuracy: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            quantityAccuracy: event.accuracy,
          }),
        },
        ChangeQuantity: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            quantityAmount: event.quantityAmount,
          }),
        },
        SelectMeasurementUnit: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            portionId: null,
            quantityUnit: event.unit,
          }),
        },
        SelectPortion: {
          update: "root",
          data: ({ root, event }) => ({ ...root, portionId: event.portionId }),
        },
        Delete: {
          target: "Deleting",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, notice: null },
          }),
        },
        Submit: {
          target: "Saving",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, notice: null },
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteMealEntry",
        input: ({ root }) => root.data.mealEntry.id,
        onDone: { target: "Deleted" },
        onFailure: {
          target: "Ready",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              notice: _mutationNotice({
                error,
                fallback: "Could not delete this entry. Please try again.",
              }),
            },
          }),
        },
      },
    },
    Saving: {
      invoke: {
        src: "reviseMealEntry",
        input: ({ root }) => ({
          mealEntryId: root.data.mealEntry.id,
          quantity:
            root.portionId === null
              ? {
                  _tag: "MeasuredFoodQuantity" as const,
                  amount: root.quantityAmount,
                  unit: root.quantityUnit,
                }
              : {
                  _tag: "PortionFoodQuantity" as const,
                  count: root.quantityAmount,
                  portionId: root.portionId,
                },
          quantityAccuracy: root.quantityAccuracy,
        }),
        onDone: { target: "Saved" },
        onFailure: {
          target: "Ready",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              notice: _mutationNotice({
                error,
                fallback: "Could not save this entry. Please try again.",
              }),
            },
          }),
        },
      },
    },
    Deleted: {
      invoke: {
        src: "replaceDay",
        input: ({ root }) => root.data.dateKey,
        onDone: { none: true },
      },
    },
    Saved: {
      invoke: {
        src: "replaceDay",
        input: ({ root }) => root.data.dateKey,
        onDone: { none: true },
      },
    },
  },
});
