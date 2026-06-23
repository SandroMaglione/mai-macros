import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { FoodFormMachine } from "@mai/machines";
import { Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { assertEvent, fromPromise, setup, type ActorRefFrom } from "xstate";

import { FoodForm } from "../lib/components/food-form.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { dateKeyFromDate } from "../lib/utils.ts";

export const Route = createFileRoute("/foods/new")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  component: Component,
});

const createFoodMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: string | undefined;
      readonly foodFormActor: ActorRefFrom<
        typeof FoodFormMachine.foodFormMachine
      >;
      readonly navigate: UseNavigateResult<string>;
    },
    events: {} as FoodFormMachine.FoodFormSubmitEvent,
    input: {} as {
      readonly dateKey: string | undefined;
      readonly navigate: UseNavigateResult<string>;
    },
  },
  actors: {
    foodForm: FoodFormMachine.foodFormMachine,
    submitFood: fromPromise<
      void,
      {
        readonly input: Foods.CreateFoodInput;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          yield* foods.create({ input: input.input });

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
  context: ({ input, spawn }) => ({
    dateKey: input.dateKey,
    foodFormActor: spawn("foodForm", {
      id: "foodForm",
      input: {
        initialFood: null,
        syncQuickInputFromFields: true,
      },
    }),
    navigate: input.navigate,
  }),
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
        input: ({ context, event }) => {
          assertEvent(event, "submit");

          return {
            input: event.input,
            dateKey: context.dateKey,
            navigate: context.navigate,
          };
        },
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
  const [snapshot] = useMachine(createFoodMachine, {
    input: {
      dateKey: search.dateKey,
      navigate,
    },
  });
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Created");

  return (
    <FoodForm
      action="create"
      actor={snapshot.context.foodFormActor}
      dateKey={search.dateKey}
      disabled={isSubmitting}
      hasFailed={snapshot.matches("Failure")}
    />
  );
}
