import {
  FoodForm,
  foodFormMachine,
  type FoodFormSubmitEvent,
} from "@/components/nutrition/food-form";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import type { DateKey } from "@mai/nutrition";
import { DateKey as DateKeySchema } from "@mai/nutrition";
import { Foods, type CreateFoodInput } from "@mai/nutrition/services/foods";
import { useMachine } from "@xstate/react";
import { Effect, Option, Schema } from "effect";
import {
  type Href,
  router,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useMemo } from "react";
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
      readonly dateKey: DateKey | undefined;
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

const SearchParams = Schema.Struct({
  dateKey: Schema.optional(DateKeySchema),
});

const createFoodRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: DateKey | undefined;
      readonly foodFormActor: ActorRefFrom<typeof foodFormMachine>;
      readonly notice: string | null;
    },
    events: {} as
      | FoodFormSubmitEvent
      | {
          readonly type: "clearNotice";
        },
    input: {} as {
      readonly dateKey: DateKey | undefined;
      readonly initialNotice: string | null;
    },
  },
  actors: {
    foodForm: foodFormMachine,
    submitFood: fromPromise<
      SubmitResult,
      {
        readonly input: CreateFoodInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods;

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
            target: "Created",
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
  const params = useLocalSearchParams();
  const dateKeyParam = globalThis.Array.isArray(params.dateKey)
    ? params.dateKey[0]
    : params.dateKey;
  const search = useMemo(
    () =>
      Schema.decodeOption(SearchParams)({ dateKey: dateKeyParam }).pipe(
        Option.match({
          onNone: () => ({
            _tag: "Invalid" as const,
          }),
          onSome: (decodedSearch) => ({
            _tag: "Valid" as const,
            dateKey: decodedSearch.dateKey,
          }),
        })
      ),
    [dateKeyParam]
  ) satisfies SearchDecodeResult;
  const dateKey = search._tag === "Valid" ? search.dateKey : undefined;
  const [snapshot] = useMachine(createFoodRouteMachine, {
    input: {
      dateKey,
      initialNotice:
        search._tag === "Invalid"
          ? "The target date was not valid. Saving will return to today."
          : null,
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
      onBack={() => {
        expoRouter.replace(
          dateKey === undefined ? "/" : (`/days/${dateKey}` as Href)
        );
      }}
    />
  );
}
