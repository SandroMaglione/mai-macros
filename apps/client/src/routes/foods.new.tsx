import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { fromPromise, setup } from "xstate";

import { FoodForm } from "../lib/components/food-form.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { Foods } from "../lib/services/foods.ts";
import { createFoodInputFromFormData, dateKeyFromDate } from "../lib/utils.ts";

export const Route = createFileRoute("/foods/new")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  component: Component,
});

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
    <FoodForm
      action="create"
      dateKey={search.dateKey}
      disabled={isSubmitting}
      hasFailed={snapshot.matches("Failure")}
      initialFood={null}
      onSubmit={(formData) => {
        send({
          type: "submit",
          formData,
          dateKey: search.dateKey,
          navigate,
        });
      }}
    />
  );
}
