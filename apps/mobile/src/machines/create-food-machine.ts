import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { Dialogs } from "./services/dialogs.ts";
import { Navigation } from "./services/navigation.ts";

export const CreateFoodRouteMode = Schema.Literals(["screen", "embedded"]);

export type CreateFoodRouteMode = typeof CreateFoodRouteMode.Type;

export const createFoodValidationNotice =
  "Check the name, required nutrients, price, and any custom portions.";

export const createFoodFailureNotice =
  "Something went wrong while saving the food. Please try again.";

export const createFoodCreatedNotice = "Food created.";

export const CreateFoodStates = Machine.state({
  fields: {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    mode: CreateFoodRouteMode,
    returnToFoods: Schema.Boolean,
  },
  states: {
    Form: {
      fields: { initialNotice: Schema.NullOr(Schema.String) },
      states: {
        Idle: { fields: { notice: Schema.NullOr(Schema.String) } },
        Submitting: { fields: { input: FoodFormMachine.FoodFormSubmitInput } },
        Failure: { fields: { notice: Schema.String } },
        Created: {},
      },
    },
  },
});

export const CreateFoodMachine = Machine.make({
  id: "CreateFood",
  root: CreateFoodStates,
  events: FoodFormMachine.FoodFormParentEvents,
  input: Schema.Struct({
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    initialNotice: Schema.NullOr(Schema.String),
    mode: CreateFoodRouteMode,
    returnToFoods: Schema.Boolean,
  }),
  children: { foodForm: FoodFormMachine.FoodFormChild },
  effects: {
    submitFood: (input: FoodFormMachine.FoodFormSubmitInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        yield* foods.create({ input });

        return { _tag: "Created" as const };
      }).pipe(
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({ _tag: "SchemaError" as const })
        )
      ),
    alertFailure: (message: string) =>
      Effect.gen(function* () {
        const dialogs = yield* Dialogs;

        yield* dialogs.alert({ message, title: "Food not saved" });
      }),
    navigateAfterCreate: ({
      dateKey,
      returnToFoods,
    }: {
      readonly dateKey: Domain.DateKey | undefined;
      readonly returnToFoods: boolean;
    }) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        if (returnToFoods) {
          if (yield* navigation.canGoBack) {
            yield* navigation.back;
          } else {
            yield* navigation.replace({
              pathname: "/foods",
              params: dateKey === undefined ? {} : { dateKey },
            });
          }

          return;
        }

        const today = todayDateKey();
        const targetDateKey = dateKey ?? today;

        if (targetDateKey === today) {
          yield* navigation.replace("/");

          return;
        }

        yield* navigation.replace({
          pathname: "/days/[dateKey]",
          params: { dateKey: targetDateKey },
        });
      }),
  },
  branches: {
    submitted: {
      navigate: { target: "Form.Created" },
      reset: { target: "Form.Idle" },
      invalid: { target: "Form.Failure" },
    },
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    mode: input.mode,
    returnToFoods: input.returnToFoods,
  }),
  initial: {
    target: "Form",
    data: ({ input }) => ({ initialNotice: input.initialNotice }),
  },
  states: {
    Form: {
      initial: {
        target: "Form.Idle",
        data: ({ state }) => ({ notice: state.initialNotice }),
      },
      invoke: {
        src: "foodForm",
        input: () => ({ initialFood: null, syncQuickInputFromFields: true }),
      },
      states: {
        Idle: {
          on: {
            FoodFormSubmitted: {
              target: "Form.Submitting",
              data: ({ event }) => ({ input: event.input }),
            },
          },
        },
        Submitting: {
          invoke: {
            src: "submitFood",
            input: ({ state }) => state.input,
            onDone: {
              branches: "submitted",
              resolve: ({ output, root, select }, enqueue) => {
                if (output._tag === "SchemaError") {
                  return select.invalid({
                    data: { notice: createFoodValidationNotice },
                  });
                }

                if (root.mode === "screen") {
                  return select.navigate();
                }

                enqueue.sendTo(
                  FoodFormMachine.FoodFormChild,
                  FoodFormMachine.FoodFormEvents.Reset()
                );

                return select.reset({
                  data: { notice: createFoodCreatedNotice },
                });
              },
            },
            onFailure: {
              target: "Form.Failure",
              data: { notice: createFoodFailureNotice },
            },
          },
        },
        Failure: {
          invoke: {
            src: "alertFailure",
            input: ({ state }) => state.notice,
            onDone: { none: true },
          },
          on: {
            FoodFormSubmitted: {
              target: "Form.Submitting",
              data: ({ event }) => ({ input: event.input }),
            },
          },
        },
        Created: {
          invoke: {
            src: "navigateAfterCreate",
            input: ({ root }) => ({
              dateKey: root.dateKey,
              returnToFoods: root.returnToFoods,
            }),
            onDone: { none: true },
          },
        },
      },
    },
  },
});
