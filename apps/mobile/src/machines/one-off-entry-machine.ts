import {
  OneOffFormValues,
  OneOffNutrientField,
  applyOneOffEntryQuickInput,
  decodeOneOffEntryForm,
  oneOffEntryErrorMessage,
  oneOffEntryFormValues,
  oneOffEntryQuickInputFromValues,
  setAllOneOffNutrientSources,
} from "@mai/machines/one-off-entry-form";
import { DailyLogs, Domain, MealEntries, Reporting } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Schema } from "effect";

import { Navigation } from "./services/navigation.ts";

export const OneOffRoute = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Schema.NullOr(Domain.MealEntryId),
});

export type OneOffRoute = typeof OneOffRoute.Type;

const OneOffHistory = Schema.Array(Domain.OneOffMealEntry);

type OneOffHistory = typeof OneOffHistory.Type;

const _matchingHistory = ({
  history,
  query,
}: {
  readonly history: OneOffHistory | null;
  readonly query: string;
}) => {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((token) => token !== "");
  return history === null || !Array.isReadonlyArrayNonEmpty(tokens)
    ? (history ?? [])
    : history.filter((entry) => {
        const searchable =
          `${entry.name} ${entry.amountDescription}`.toLocaleLowerCase();
        return tokens.every((token) => searchable.includes(token));
      });
};

const _historyEntry = ({
  history,
  mealEntryId,
}: {
  readonly history: OneOffHistory | null;
  readonly mealEntryId: Domain.MealEntryId;
}) => history?.find((entry) => entry.id === mealEntryId);

export const OneOffEntryStates = Machine.state({
  fields: {
    history: Schema.NullOr(OneOffHistory),
    historyQuery: Schema.String,
    matchingHistory: OneOffHistory,
    notice: Schema.NullOr(Schema.String),
    quickInput: Schema.String,
    quickInputIssues: Schema.Array(Schema.String),
    route: OneOffRoute,
    values: OneOffFormValues,
  },
  states: {
    Loading: {},
    Failure: {},
    Ready: {},
    History: {
      states: { Ready: {}, Loading: {}, Failure: {} },
    },
    Saving: {},
    Deleting: { fields: { mealEntryId: Domain.MealEntryId } },
    Done: {},
  },
});

const NutrientName = Schema.Literals(Reporting.NutrientNames);

export const OneOffEntryEvents = Machine.events({
  AllSources: { source: OneOffNutrientField.fields.source },
  ChangeQuickInput: { input: Schema.String },
  Delete: {},
  Nutrient: { field: NutrientName, value: Schema.String },
  Retry: {},
  Reuse: { mealEntryId: Domain.MealEntryId },
  Save: {},
  SearchHistory: { query: Schema.String },
  ShowForm: {},
  ShowHistory: {},
  Source: { field: NutrientName, source: OneOffNutrientField.fields.source },
  Text: {
    field: Schema.Literals(["name", "amountDescription", "note"]),
    value: Schema.String,
  },
});

export const OneOffEntryMachine = Machine.make({
  id: "OneOffEntry",
  root: OneOffEntryStates,
  events: OneOffEntryEvents,
  input: OneOffRoute,
  effects: {
    load: (route: OneOffRoute) =>
      Effect.gen(function* () {
        const logs = yield* DailyLogs.DailyLogs;
        const day = yield* logs.open({ input: { dateKey: route.dateKey } });
        if (
          day._tag === "UnrecordedDay" ||
          !day.selectedPlan.meals.some((meal) => meal.id === route.meal)
        )
          return yield* Effect.fail("Meal unavailable");
        const service = yield* MealEntries.MealEntries;
        if (route.mealEntryId === null)
          return {
            entry: null,
            history: yield* service
              .listOneOffHistory()
              .pipe(Effect.orElseSucceed(() => null)),
          };
        const entry = (yield* service.listForDay({
          input: { dateKey: route.dateKey },
        })).find(
          (candidate) =>
            candidate.id === route.mealEntryId &&
            candidate.mealId === route.meal
        );
        if (entry?.kind !== "one-off")
          return yield* Effect.fail("Entry unavailable");
        return { entry, history: null };
      }),
    loadHistory: Effect.gen(function* () {
      const service = yield* MealEntries.MealEntries;
      return yield* service.listOneOffHistory();
    }),
    save: ({
      route,
      values,
    }: {
      readonly route: OneOffRoute;
      readonly values: typeof OneOffFormValues.Type;
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
      }),
    delete: (mealEntryId: Domain.MealEntryId) =>
      Effect.gen(function* () {
        const service = yield* MealEntries.MealEntries;
        yield* service.delete({ input: { mealEntryId } });
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
  branches: {
    deleteEntry: {
      deleting: { target: "Deleting", update: "root" },
    },
  },
}).handle({
  root: ({ input }) => ({
    route: input,
    ...oneOffEntryQuickInputFromValues({ values: oneOffEntryFormValues(null) }),
    notice: null,
    history: null,
    historyQuery: "",
    matchingHistory: [],
  }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.route,
        onDone: {
          target: "Ready",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: {
              ...root,
              ...oneOffEntryQuickInputFromValues({
                values: oneOffEntryFormValues(output.entry),
              }),
              history: output.history,
              matchingHistory: _matchingHistory({
                history: output.history,
                query: root.historyQuery,
              }),
            },
          }),
        },
        onFailure: {
          target: "Failure",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              notice: oneOffEntryErrorMessage({ error, action: "open" }),
            },
          }),
        },
      },
    },
    Failure: { on: { Retry: { target: "Loading" } } },
    History: {
      initial: { target: "History.Ready" },
      on: {
        ShowForm: {
          target: "Ready",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, notice: null },
          }),
        },
        SearchHistory: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            historyQuery: event.query,
            matchingHistory: _matchingHistory({
              history: root.history,
              query: event.query,
            }),
          }),
        },
        Reuse: {
          target: "Ready",
          update: "root",
          guard: ({ root, event }) =>
            root.route.mealEntryId === null &&
            _historyEntry({
              history: root.history,
              mealEntryId: event.mealEntryId,
            }) !== undefined,
          data: ({ root, event }) => ({
            target: undefined,
            update: {
              ...root,
              ...oneOffEntryQuickInputFromValues({
                values: oneOffEntryFormValues(
                  _historyEntry({
                    history: root.history,
                    mealEntryId: event.mealEntryId,
                  }) ?? null
                ),
              }),
              notice: null,
            },
          }),
        },
      },
      states: {
        Loading: {
          invoke: {
            src: "loadHistory",
            onDone: {
              target: "History.Ready",
              update: "root",
              data: ({ root, output }) => ({
                target: undefined,
                update: {
                  ...root,
                  history: output,
                  matchingHistory: _matchingHistory({
                    history: output,
                    query: root.historyQuery,
                  }),
                },
              }),
            },
            onFailure: {
              target: "History.Failure",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, notice: "Unable to load past entries" },
              }),
            },
          },
        },
        Ready: {
          on: {
            Retry: {
              target: "History.Loading",
              update: "root",
              guard: ({ root }) => root.history === null,
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, notice: null },
              }),
            },
          },
        },
        Failure: {
          on: {
            Retry: {
              target: "History.Loading",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, notice: null },
              }),
            },
          },
        },
      },
    },
    Ready: {
      on: {
        ShowHistory: {
          target: "History",
          update: "root",
          guard: ({ root }) => root.route.mealEntryId === null,
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, notice: null },
          }),
        },
        ChangeQuickInput: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            ...Effect.runSync(
              applyOneOffEntryQuickInput({
                input: event.input,
                values: root.values,
              })
            ),
          }),
        },
        Text: {
          update: "root",
          data: ({ root, event }) => {
            const values = { ...root.values, [event.field]: event.value };
            return event.field === "note"
              ? { ...root, values }
              : { ...root, ...oneOffEntryQuickInputFromValues({ values }) };
          },
        },
        Nutrient: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            ...oneOffEntryQuickInputFromValues({
              values: {
                ...root.values,
                nutrients: {
                  ...root.values.nutrients,
                  [event.field]: {
                    ...root.values.nutrients[event.field],
                    value: event.value,
                  },
                },
              },
            }),
          }),
        },
        Source: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            values: {
              ...root.values,
              nutrients: {
                ...root.values.nutrients,
                [event.field]: {
                  ...root.values.nutrients[event.field],
                  source: event.source,
                },
              },
            },
          }),
        },
        AllSources: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            values: setAllOneOffNutrientSources({
              values: root.values,
              source: event.source,
            }),
          }),
        },
        Save: {
          target: "Saving",
          update: "root",
          guard: ({ root }) =>
            !Array.isReadonlyArrayNonEmpty(root.quickInputIssues),
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, notice: null },
          }),
        },
        Delete: {
          branches: "deleteEntry",
          declinable: true,
          resolve: ({ root, select, decline }) =>
            root.route.mealEntryId === null
              ? decline()
              : select.deleting({
                  data: { mealEntryId: root.route.mealEntryId },
                  update: { data: { ...root, notice: null } },
                }),
        },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ root }) => ({ route: root.route, values: root.values }),
        onDone: { target: "Done" },
        onFailure: {
          target: "Ready",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              notice: oneOffEntryErrorMessage({ error, action: "save" }),
            },
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "delete",
        input: ({ state }) => state.mealEntryId,
        onDone: { target: "Done" },
        onFailure: {
          target: "Ready",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              notice: oneOffEntryErrorMessage({ error, action: "delete" }),
            },
          }),
        },
      },
    },
    Done: {
      invoke: {
        src: "replaceDay",
        input: ({ root }) => root.route.dateKey,
        onDone: { none: true },
      },
    },
  },
});
