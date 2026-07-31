import { FoodForm } from "@/components/nutrition/food-form";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Effect, Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { router, useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert } from "react-native";

const CreateFoodRouteMode = Schema.Literals(["screen", "embedded"]);

type CreateFoodRouteMode = typeof CreateFoodRouteMode.Type;

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const CreateFoodRouteInput = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  initialNotice: Schema.NullOr(Schema.String),
  mode: CreateFoodRouteMode,
});

class CreateFoodRouteState extends Schema.TaggedClass<CreateFoodRouteState>(
  "CreateFoodRouteState"
)("CreateFoodRouteState", {
  dateKey: CreateFoodRouteInput.fields.dateKey,
  mode: CreateFoodRouteMode,
}) {}
class CreateFoodIdle extends Schema.TaggedClass<CreateFoodIdle>(
  "CreateFoodIdle"
)("CreateFoodIdle", { notice: Schema.NullOr(Schema.String) }) {}
class CreateFoodSubmitting extends Schema.TaggedClass<CreateFoodSubmitting>(
  "CreateFoodSubmitting"
)("CreateFoodSubmitting", {
  input: Schema.declare<Foods.CreateFoodInput>(
    (value): value is Foods.CreateFoodInput => Predicate.isObject(value),
    { expected: "Foods.CreateFoodInput" }
  ),
}) {}
class CreateFoodFailure extends Schema.TaggedClass<CreateFoodFailure>(
  "CreateFoodFailure"
)("CreateFoodFailure", { notice: Schema.String }) {}
class CreateFoodCreated extends Schema.TaggedClass<CreateFoodCreated>(
  "CreateFoodCreated"
)("CreateFoodCreated", {}) {}
class FoodCreated extends Schema.TaggedClass<FoodCreated>("FoodCreated")(
  "FoodCreated",
  {}
) {}
class FoodCreateValidationFailed extends Schema.TaggedClass<FoodCreateValidationFailed>(
  "FoodCreateValidationFailed"
)("FoodCreateValidationFailed", {}) {}
class FoodCreateFailed extends Schema.TaggedClass<FoodCreateFailed>(
  "FoodCreateFailed"
)("FoodCreateFailed", {}) {}

const CreateFoodStates = Machine.defineStates({
  Route: {
    schema: CreateFoodRouteState,
    initial: "Idle",
    states: {
      Created: CreateFoodCreated,
      Failure: CreateFoodFailure,
      Idle: CreateFoodIdle,
      Submitting: CreateFoodSubmitting,
    },
  },
});

const createFoodRouteMachine = Machine.make({
  states: CreateFoodStates.states,
  events: [
    ...FoodFormMachine.foodFormMachine.emits,
    FoodCreated,
    FoodCreateValidationFailed,
    FoodCreateFailed,
  ],
  input: CreateFoodRouteInput,
  initial: ({ dateKey, initialNotice, mode }) =>
    CreateFoodStates.initial.Route(
      new CreateFoodRouteState({ dateKey, mode }),
      (route) => route.Idle(new CreateFoodIdle({ notice: initialNotice }))
    ),
}).handle({
  Route: {
    invoke: Machine.invokeMachine({
      child: FoodFormMachine.FoodFormChild,
      input: {
        initialFood: null,
        syncQuickInputFromFields: true,
      },
    }),
    on: {
      FoodFormSubmitted: ({ event, target }) =>
        target.local.Submitting(
          new CreateFoodSubmitting({ input: event.input })
        ),
    },
    states: {
      Idle: {},
      Failure: {},
      Submitting: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "createFood",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const foods = yield* Foods.Foods;
                  yield* foods.create({ input: state.input });
                  return new FoodCreated();
                }).pipe(
                  Effect.catchTag("SchemaError", () =>
                    Effect.succeed(new FoodCreateValidationFailed())
                  ),
                  Effect.catch(() => Effect.succeed(new FoodCreateFailed()))
                )
              ),
          }),
        on: {
          FoodCreated: ({ parents, target }) => {
            if (parents.Route.mode === "embedded") {
              return Machine.action(
                Machine.sendTo(
                  FoodFormMachine.FoodFormChild,
                  new FoodFormMachine.ResetFoodForm()
                )
              ).pipe(
                Effect.as(
                  target.local.Idle(
                    new CreateFoodIdle({ notice: "Food created." })
                  )
                )
              );
            }

            return Machine.action(
              Effect.sync(() => {
                const today = todayDateKey();
                const targetDateKey = parents.Route.dateKey ?? today;

                if (targetDateKey === today) {
                  router.replace("/");
                  return;
                }

                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: targetDateKey },
                });
              })
            ).pipe(Effect.as(target.local.Created(new CreateFoodCreated())));
          },
          FoodCreateValidationFailed: ({ target }) =>
            Machine.action(
              Effect.sync(() => {
                Alert.alert(
                  "Food not saved",
                  "Check the name, required nutrients, price, and any custom portions."
                );
              })
            ).pipe(
              Effect.as(
                target.local.Failure(
                  new CreateFoodFailure({
                    notice:
                      "Check the name, required nutrients, price, and any custom portions.",
                  })
                )
              )
            ),
          FoodCreateFailed: ({ target }) =>
            Machine.action(
              Effect.sync(() => {
                Alert.alert(
                  "Food not saved",
                  "Something went wrong while saving the food. Please try again."
                );
              })
            ).pipe(
              Effect.as(
                target.local.Failure(
                  new CreateFoodFailure({
                    notice:
                      "Something went wrong while saving the food. Please try again.",
                  })
                )
              )
            ),
        },
      },
      Created: {},
    },
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
  ) satisfies
    | {
        readonly _tag: "Valid";
        readonly dateKey: Domain.DateKey | undefined;
      }
    | {
        readonly _tag: "Invalid";
      };
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
        if (dateKey === undefined) {
          expoRouter.replace("/");
          return;
        }

        expoRouter.replace({
          pathname: "/days/[dateKey]",
          params: {
            dateKey,
          },
        });
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
  const machineAtom = useMemo(
    () =>
      AtomMachine.make(MobileAtomRuntime, createFoodRouteMachine, {
        dateKey,
        initialNotice,
        mode,
      }),
    [dateKey, initialNotice, mode]
  );
  const foodFormAtom = useMemo(
    () => machineAtom.child(FoodFormMachine.FoodFormChild),
    [machineAtom]
  );
  const stateResult = useAtomValue(machineAtom.state);

  if (!AsyncResult.isSuccess(stateResult)) {
    return null;
  }

  const state = stateResult.value;
  const idle = CreateFoodStates.get(state, "Route.Idle").pipe(Option.getOrNull);
  const failure = CreateFoodStates.get(state, "Route.Failure").pipe(
    Option.getOrNull
  );
  const isSubmitting =
    CreateFoodStates.matches(state, "Route.Submitting") ||
    CreateFoodStates.matches(state, "Route.Created");
  const notice = failure?.notice ?? idle?.notice ?? null;
  const feedback =
    notice === null
      ? undefined
      : failure !== null
        ? {
            message: notice,
            title: "Food not saved",
            tone: "danger" as const,
          }
        : notice === "Food created."
          ? {
              message: notice,
              tone: "success" as const,
            }
          : {
              message: notice,
              tone: "neutral" as const,
            };

  return (
    <FoodForm
      action="create"
      actor={foodFormAtom}
      disabled={isSubmitting}
      feedback={feedback}
      hasFailed={failure !== null}
      layout={mode}
      onBack={onBack}
    />
  );
}
