import { FoodForm } from "@/components/nutrition/food-form";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Option, Schema } from "effect";
import { type Href, router, useRouter } from "expo-router";
import { Alert } from "react-native";
import {
  assertEvent,
  assign,
  fromPromise,
  setup,
  type ActorRefFrom,
} from "xstate";

type SearchDecodeResult =
  | {
      readonly _tag: "Valid";
      readonly dateKey: Domain.DateKey | undefined;
    }
  | {
      readonly _tag: "Invalid";
    };

type SubmitResult =
  | {
      readonly _tag: "Created";
    }
  | {
      readonly _tag: "SchemaError";
    };

type CreateFoodRouteMode = "screen" | "embedded";

const SearchParams = Schema.Struct({
  dateKey: Schema.optional(Domain.DateKey),
});

const createFoodRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: Domain.DateKey | undefined;
      readonly foodFormActor: ActorRefFrom<
        typeof FoodFormMachine.foodFormMachine
      >;
      readonly mode: CreateFoodRouteMode;
      readonly notice: string | null;
    },
    events: {} as
      | FoodFormMachine.FoodFormSubmitEvent
      | {
          readonly type: "clearNotice";
        },
    input: {} as {
      readonly dateKey: Domain.DateKey | undefined;
      readonly initialNotice: string | null;
      readonly mode: CreateFoodRouteMode;
    },
  },
  actors: {
    foodForm: FoodFormMachine.foodFormMachine,
    submitFood: fromPromise<
      SubmitResult,
      {
        readonly input: Foods.CreateFoodInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods.Foods;

          yield* foods.create({
            input: input.input,
          });

          return {
            _tag: "Created" as const,
          };
        }).pipe(
          Effect.catchTag("SchemaError", () =>
            Effect.succeed({
              _tag: "SchemaError" as const,
            })
          )
        )
      )
    ),
  },
}).createMachine({
  context: ({ input, spawn }) => ({
    dateKey: input.dateKey,
    foodFormActor: spawn("foodForm", {
      id: "createFoodRouteFoodForm",
      input: {
        initialFood: null,
        syncQuickInputFromFields: true,
      },
    }),
    mode: input.mode,
    notice: input.initialNotice,
  }),
  initial: "Idle",
  states: {
    Idle: {
      on: {
        clearNotice: {
          actions: assign({
            notice: null,
          }),
        },
        submit: {
          actions: assign({
            notice: null,
          }),
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "submitFood",
        input: ({ event }) => {
          assertEvent(event, "submit");

          return {
            input: event.input,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "SchemaError",
            actions: [
              assign({
                notice:
                  "Check that the name is filled and every required nutrient is a non-negative number.",
              }),
              () => {
                Alert.alert(
                  "Food not saved",
                  "Check that the name is filled and every required nutrient is a non-negative number."
                );
              },
            ],
            target: "Failure",
          },
          {
            actions: ({ context }) => {
              const today = todayDateKey();
              const targetDateKey = context.dateKey ?? today;

              router.replace(
                targetDateKey === today
                  ? "/"
                  : (`/days/${targetDateKey}` as Href)
              );
            },
            guard: ({ context }) => context.mode === "screen",
            target: "Created",
          },
          {
            actions: [
              assign({
                notice: "Food created.",
              }),
              ({ context }) => {
                context.foodFormActor.send({
                  type: "reset",
                });
              },
            ],
            target: "Idle",
          },
        ],
        onError: {
          actions: [
            assign({
              notice:
                "Something went wrong while saving the food. Please try again.",
            }),
            () => {
              Alert.alert(
                "Food not saved",
                "Something went wrong while saving the food. Please try again."
              );
            },
          ],
          target: "Failure",
        },
      },
    },
    Failure: {
      on: {
        clearNotice: {
          actions: assign({
            notice: null,
          }),
        },
        submit: {
          actions: assign({
            notice: null,
          }),
          target: "Submitting",
        },
      },
    },
    Created: {},
  },
});

export default function NewFoodScreen() {
  const expoRouter = useRouter();
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (decodedSearch) => ({
        _tag: "Valid" as const,
        dateKey: decodedSearch.dateKey,
      }),
    })
  ) satisfies SearchDecodeResult;
  const dateKey = search._tag === "Valid" ? search.dateKey : undefined;
  return (
    <CreateFoodPanel
      dateKey={dateKey}
      initialNotice={
        search._tag === "Invalid"
          ? "The target date was not valid. Saving will return to today."
          : null
      }
      mode="screen"
      onBack={() => {
        expoRouter.replace(
          dateKey === undefined ? "/" : (`/days/${dateKey}` as Href)
        );
      }}
    />
  );
}

export function CreateFoodPanel({
  dateKey,
  initialNotice,
  mode,
  onBack,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly initialNotice: string | null;
  readonly mode: CreateFoodRouteMode;
  readonly onBack: () => void;
}) {
  const [snapshot] = useMachine(createFoodRouteMachine, {
    input: {
      dateKey,
      initialNotice,
      mode,
    },
  });
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Created");

  return (
    <FoodForm
      action="create"
      actor={snapshot.context.foodFormActor}
      disabled={isSubmitting}
      errorMessage={snapshot.context.notice ?? undefined}
      hasFailed={snapshot.matches("Failure")}
      layout={mode}
      onBack={onBack}
    />
  );
}
