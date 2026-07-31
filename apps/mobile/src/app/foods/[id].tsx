import { FoodForm } from "@/components/nutrition/food-form";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { describeFoodChanges } from "@/lib/food-change-summary";
import { formatShortDate } from "@/lib/format";
import { MobileMachine } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import {
  CircleCheck,
  ChevronLeft,
  Copy,
  Pencil,
  ReceiptEuro,
  Ruler,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react-native";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, type ReactNode } from "react";

const FoodEditorRouteParams = Schema.Struct({
  id: Domain.FoodId,
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const CreateFoodInput = Schema.declare<Foods.CreateFoodInput>(
  (value): value is Foods.CreateFoodInput => Predicate.isObject(value),
  { expected: "Foods.CreateFoodInput" }
);

class FoodEditorRouteState extends Schema.TaggedClass<FoodEditorRouteState>(
  "FoodEditorRouteState"
)("FoodEditorRouteState", { foodId: Domain.FoodId }) {}
class FoodEditorLoading extends Schema.TaggedClass<FoodEditorLoading>(
  "FoodEditorLoading"
)("FoodEditorLoading", {}) {}
class FoodEditorLoadFailed extends Schema.TaggedClass<FoodEditorLoadFailed>(
  "FoodEditorLoadFailed"
)("FoodEditorLoadFailed", { message: Schema.String }) {}
class FoodEditorReady extends Schema.TaggedClass<FoodEditorReady>(
  "FoodEditorReady"
)("FoodEditorReady", {
  food: Domain.Food,
  foods: Schema.Array(Domain.Food),
  usage: Foods.FoodEditUsage,
}) {}
class FoodEditorChoosingAction extends Schema.TaggedClass<FoodEditorChoosingAction>(
  "FoodEditorChoosingAction"
)("FoodEditorChoosingAction", {}) {}
class FoodEditorCopy extends Schema.TaggedClass<FoodEditorCopy>(
  "FoodEditorCopy"
)("FoodEditorCopy", {
  draft: Schema.NullOr(CreateFoodInput),
  message: Schema.NullOr(Schema.String),
}) {}
class FoodEditorCopyForm extends Schema.TaggedClass<FoodEditorCopyForm>(
  "FoodEditorCopyForm"
)("FoodEditorCopyForm", {}) {}
class FoodEditorReviewingCopy extends Schema.TaggedClass<FoodEditorReviewingCopy>(
  "FoodEditorReviewingCopy"
)("FoodEditorReviewingCopy", {}) {}
class FoodEditorCopying extends Schema.TaggedClass<FoodEditorCopying>(
  "FoodEditorCopying"
)("FoodEditorCopying", {}) {}
class FoodEditorEdit extends Schema.TaggedClass<FoodEditorEdit>(
  "FoodEditorEdit"
)("FoodEditorEdit", {
  draft: Schema.NullOr(CreateFoodInput),
  message: Schema.NullOr(Schema.String),
}) {}
class FoodEditorEditWarning extends Schema.TaggedClass<FoodEditorEditWarning>(
  "FoodEditorEditWarning"
)("FoodEditorEditWarning", {}) {}
class FoodEditorEditForm extends Schema.TaggedClass<FoodEditorEditForm>(
  "FoodEditorEditForm"
)("FoodEditorEditForm", {}) {}
class FoodEditorPreviewingEdit extends Schema.TaggedClass<FoodEditorPreviewingEdit>(
  "FoodEditorPreviewingEdit"
)("FoodEditorPreviewingEdit", {}) {}
class FoodEditorReviewingEdit extends Schema.TaggedClass<FoodEditorReviewingEdit>(
  "FoodEditorReviewingEdit"
)("FoodEditorReviewingEdit", {}) {}
class FoodEditorEditing extends Schema.TaggedClass<FoodEditorEditing>(
  "FoodEditorEditing"
)("FoodEditorEditing", {}) {}
class FoodEditorCompleted extends Schema.TaggedClass<FoodEditorCompleted>(
  "FoodEditorCompleted"
)("FoodEditorCompleted", {
  food: Domain.Food,
  message: Schema.String,
}) {}

class RetryFoodEditor extends Schema.TaggedClass<RetryFoodEditor>(
  "RetryFoodEditor"
)("RetryFoodEditor", {}) {}
class ChooseFoodCopy extends Schema.TaggedClass<ChooseFoodCopy>(
  "ChooseFoodCopy"
)("ChooseFoodCopy", {}) {}
class ChooseFoodEdit extends Schema.TaggedClass<ChooseFoodEdit>(
  "ChooseFoodEdit"
)("ChooseFoodEdit", {}) {}
class AcknowledgeFoodEdit extends Schema.TaggedClass<AcknowledgeFoodEdit>(
  "AcknowledgeFoodEdit"
)("AcknowledgeFoodEdit", {}) {}
class BackToFoodChoice extends Schema.TaggedClass<BackToFoodChoice>(
  "BackToFoodChoice"
)("BackToFoodChoice", {}) {}
class BackToFoodForm extends Schema.TaggedClass<BackToFoodForm>(
  "BackToFoodForm"
)("BackToFoodForm", {}) {}
class ApplyFoodCopy extends Schema.TaggedClass<ApplyFoodCopy>("ApplyFoodCopy")(
  "ApplyFoodCopy",
  {}
) {}
class ConfirmFoodEdit extends Schema.TaggedClass<ConfirmFoodEdit>(
  "ConfirmFoodEdit"
)("ConfirmFoodEdit", {}) {}
class FoodEditorLoaded extends Schema.TaggedClass<FoodEditorLoaded>(
  "FoodEditorLoaded"
)("FoodEditorLoaded", {
  food: Domain.Food,
  foods: Schema.Array(Domain.Food),
  usage: Foods.FoodEditUsage,
}) {}
class FoodEditorLoadingFailed extends Schema.TaggedClass<FoodEditorLoadingFailed>(
  "FoodEditorLoadingFailed"
)("FoodEditorLoadingFailed", {}) {}
class FoodEditPreviewed extends Schema.TaggedClass<FoodEditPreviewed>(
  "FoodEditPreviewed"
)("FoodEditPreviewed", {}) {}
class FoodCopied extends Schema.TaggedClass<FoodCopied>("FoodCopied")(
  "FoodCopied",
  { food: Domain.Food }
) {}
class FoodEdited extends Schema.TaggedClass<FoodEdited>("FoodEdited")(
  "FoodEdited",
  {
    food: Domain.Food,
    revisedMealEntryCount: Schema.Number,
  }
) {}
class FoodMutationFailed extends Schema.TaggedClass<FoodMutationFailed>(
  "FoodMutationFailed"
)("FoodMutationFailed", { message: Schema.String }) {}

const FoodEditorStates = Machine.defineStates({
  Route: {
    schema: FoodEditorRouteState,
    initial: "Loading",
    states: {
      Loading: FoodEditorLoading,
      LoadFailed: FoodEditorLoadFailed,
      Ready: {
        schema: FoodEditorReady,
        initial: "ChoosingAction",
        states: {
          ChoosingAction: FoodEditorChoosingAction,
          Copy: {
            schema: FoodEditorCopy,
            initial: "Form",
            states: {
              Form: FoodEditorCopyForm,
              Reviewing: FoodEditorReviewingCopy,
              Saving: FoodEditorCopying,
            },
          },
          Edit: {
            schema: FoodEditorEdit,
            initial: "Warning",
            states: {
              Warning: FoodEditorEditWarning,
              Form: FoodEditorEditForm,
              Previewing: FoodEditorPreviewingEdit,
              Reviewing: FoodEditorReviewingEdit,
              Saving: FoodEditorEditing,
            },
          },
          Completed: FoodEditorCompleted,
        },
      },
    },
  },
});

const foodEditorMachine = Machine.make({
  id: "foodEditor",
  states: FoodEditorStates.states,
  events: [
    RetryFoodEditor,
    ChooseFoodCopy,
    ChooseFoodEdit,
    AcknowledgeFoodEdit,
    BackToFoodChoice,
    BackToFoodForm,
    ApplyFoodCopy,
    ConfirmFoodEdit,
  ],
  internalEvents: [
    FoodEditorLoaded,
    FoodEditorLoadingFailed,
    FoodEditPreviewed,
    FoodCopied,
    FoodEdited,
    FoodMutationFailed,
    ...FoodFormMachine.foodFormMachine.emits,
  ],
  input: Schema.Struct({ foodId: Domain.FoodId }),
  initial: ({ foodId }) =>
    FoodEditorStates.initial.Route(
      new FoodEditorRouteState({ foodId }),
      (route) => route.Loading(new FoodEditorLoading())
    ),
}).handle({
  Route: {
    states: {
      Loading: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "loadFoodEditor",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const foods = yield* Foods.Foods;
                  const input = { foodId: parents.Route.foodId };
                  const food = yield* foods.get({ input });
                  return new FoodEditorLoaded({
                    food,
                    foods: [...(yield* foods.list())],
                    usage: yield* foods.inspectEdit({ input }),
                  });
                }).pipe(
                  Effect.catch(() =>
                    Effect.succeed(new FoodEditorLoadingFailed())
                  )
                )
              ),
          }),
        on: {
          FoodEditorLoaded: ({ event, parents, target }) =>
            target.full.Route(
              new FoodEditorRouteState({ ...parents.Route }),
              (route) =>
                route.Ready(
                  new FoodEditorReady({
                    food: event.food,
                    foods: event.foods,
                    usage: event.usage,
                  }),
                  (ready) =>
                    ready.ChoosingAction(new FoodEditorChoosingAction())
                )
            ),
          FoodEditorLoadingFailed: ({ parents, target }) =>
            target.full.Route(
              new FoodEditorRouteState({ ...parents.Route }),
              (route) =>
                route.LoadFailed(
                  new FoodEditorLoadFailed({
                    message: "Could not load this food.",
                  })
                )
            ),
        },
      },
      LoadFailed: {
        on: {
          RetryFoodEditor: ({ parents, target }) =>
            target.full.Route(
              new FoodEditorRouteState({ ...parents.Route }),
              (route) => route.Loading(new FoodEditorLoading())
            ),
        },
      },
      Ready: {
        invoke: ({ state }) =>
          Machine.invokeMachine({
            child: FoodFormMachine.FoodFormChild,
            input: {
              initialFood: state.food,
              syncQuickInputFromFields: false,
            },
          }),
        states: {
          ChoosingAction: {
            on: {
              ChooseFoodCopy: ({ parents, target }) =>
                Machine.action(
                  Machine.sendTo(
                    FoodFormMachine.FoodFormChild,
                    new FoodFormMachine.LoadFood({
                      food: parents["Route.Ready"].food,
                    })
                  ),
                  target.local.Copy(
                    new FoodEditorCopy({
                      draft: null,
                      message: null,
                    }),
                    (copy) => copy.Form(new FoodEditorCopyForm())
                  )
                ),
              ChooseFoodEdit: ({ parents, target }) => {
                if (parents["Route.Ready"].food.origin === "app-default") {
                  return;
                }
                return Machine.action(
                  Machine.sendTo(
                    FoodFormMachine.FoodFormChild,
                    new FoodFormMachine.LoadFood({
                      food: parents["Route.Ready"].food,
                    })
                  ),
                  target.local.Edit(
                    new FoodEditorEdit({
                      draft: null,
                      message: null,
                    }),
                    (edit) => edit.Warning(new FoodEditorEditWarning())
                  )
                );
              },
            },
          },
          Copy: {
            states: {
              Form: {
                on: {
                  BackToFoodChoice: ({ target }) =>
                    target.branch.Route.Ready.ChoosingAction(
                      new FoodEditorChoosingAction()
                    ),
                  FoodFormSubmitted: ({ event, target }) =>
                    target.local.with(
                      new FoodEditorCopy({
                        draft: event.input,
                        message: null,
                      }),
                      (copy) => copy.Reviewing(new FoodEditorReviewingCopy())
                    ),
                },
              },
              Reviewing: {
                on: {
                  BackToFoodForm: ({ target }) =>
                    target.local.Form(new FoodEditorCopyForm()),
                  ApplyFoodCopy: ({ target }) =>
                    target.local.Saving(new FoodEditorCopying()),
                },
              },
              Saving: {
                invoke: ({ parents }) => {
                  const draft = parents["Route.Ready.Copy"].draft;
                  const foodId = parents.Route.foodId;
                  return Machine.invoke({
                    id: "copyFood",
                    src: () =>
                      Machine.effect(
                        draft === null
                          ? Effect.succeed(_missingFoodDraftFailure())
                          : Effect.gen(function* () {
                              const foods = yield* Foods.Foods;
                              const result = yield* foods.copy({
                                input: {
                                  ..._foodDetailsFromDraft(draft),
                                  sourceFoodId: foodId,
                                },
                              });
                              return new FoodCopied({ food: result.food });
                            }).pipe(
                              Effect.catch((error) =>
                                Effect.succeed(
                                  new FoodMutationFailed({
                                    message: _foodMutationErrorMessage(error),
                                  })
                                )
                              )
                            )
                      ),
                  });
                },
                on: {
                  FoodCopied: ({ event, target }) =>
                    target.branch.Route.Ready.Completed(
                      new FoodEditorCompleted({
                        food: event.food,
                        message:
                          "Food copy created. Previous meal entries were unchanged.",
                      })
                    ),
                  FoodMutationFailed: ({ event, parents, target }) =>
                    target.local.with(
                      new FoodEditorCopy({
                        ...parents["Route.Ready.Copy"],
                        message: event.message,
                      }),
                      (copy) => copy.Reviewing(new FoodEditorReviewingCopy())
                    ),
                },
              },
            },
          },
          Edit: {
            states: {
              Warning: {
                on: {
                  BackToFoodChoice: ({ target }) =>
                    target.branch.Route.Ready.ChoosingAction(
                      new FoodEditorChoosingAction()
                    ),
                  AcknowledgeFoodEdit: ({ parents, target }) =>
                    target.local.with(
                      new FoodEditorEdit({
                        ...parents["Route.Ready.Edit"],
                        message: null,
                      }),
                      (edit) => edit.Form(new FoodEditorEditForm())
                    ),
                },
              },
              Form: {
                on: {
                  BackToFoodChoice: ({ target }) =>
                    target.branch.Route.Ready.ChoosingAction(
                      new FoodEditorChoosingAction()
                    ),
                  FoodFormSubmitted: ({ event, target }) =>
                    target.local.with(
                      new FoodEditorEdit({
                        draft: event.input,
                        message: null,
                      }),
                      (edit) => edit.Previewing(new FoodEditorPreviewingEdit())
                    ),
                },
              },
              Previewing: {
                invoke: ({ parents }) => {
                  const draft = parents["Route.Ready.Edit"].draft;
                  const foodId = parents.Route.foodId;
                  return Machine.invoke({
                    id: "previewFoodEdit",
                    src: () =>
                      Machine.effect(
                        draft === null
                          ? Effect.succeed(_missingFoodDraftFailure())
                          : Effect.gen(function* () {
                              const foods = yield* Foods.Foods;
                              yield* foods.previewFoodDetailsEdit({
                                input: {
                                  ..._foodDetailsFromDraft(draft),
                                  foodId,
                                },
                              });
                              return new FoodEditPreviewed();
                            }).pipe(
                              Effect.catch((error) =>
                                Effect.succeed(
                                  new FoodMutationFailed({
                                    message: _foodMutationErrorMessage(error),
                                  })
                                )
                              )
                            )
                      ),
                  });
                },
                on: {
                  FoodEditPreviewed: ({ parents, target }) =>
                    target.local.with(
                      new FoodEditorEdit({
                        ...parents["Route.Ready.Edit"],
                        message: null,
                      }),
                      (edit) => edit.Reviewing(new FoodEditorReviewingEdit())
                    ),
                  FoodMutationFailed: ({ event, parents, target }) =>
                    target.local.with(
                      new FoodEditorEdit({
                        ...parents["Route.Ready.Edit"],
                        message: event.message,
                      }),
                      (edit) => edit.Form(new FoodEditorEditForm())
                    ),
                },
              },
              Reviewing: {
                on: {
                  BackToFoodForm: ({ target }) =>
                    target.local.Form(new FoodEditorEditForm()),
                  ConfirmFoodEdit: ({ target }) =>
                    target.local.Saving(new FoodEditorEditing()),
                },
              },
              Saving: {
                invoke: ({ parents }) => {
                  const draft = parents["Route.Ready.Edit"].draft;
                  const foodId = parents.Route.foodId;
                  return Machine.invoke({
                    id: "editFood",
                    src: () =>
                      Machine.effect(
                        draft === null
                          ? Effect.succeed(_missingFoodDraftFailure())
                          : Effect.gen(function* () {
                              const foods = yield* Foods.Foods;
                              const result = yield* foods.editFoodDetails({
                                input: {
                                  ..._foodDetailsFromDraft(draft),
                                  foodId,
                                },
                              });
                              return new FoodEdited({
                                food: result.food,
                                revisedMealEntryCount:
                                  result.revisedMealEntryCount,
                              });
                            }).pipe(
                              Effect.catch((error) =>
                                Effect.succeed(
                                  new FoodMutationFailed({
                                    message: _foodMutationErrorMessage(error),
                                  })
                                )
                              )
                            )
                      ),
                  });
                },
                on: {
                  FoodEdited: ({ event, target }) =>
                    target.branch.Route.Ready.Completed(
                      new FoodEditorCompleted({
                        food: event.food,
                        message:
                          event.revisedMealEntryCount === 0
                            ? "Food updated. No previous meal entries changed."
                            : `Food updated across ${event.revisedMealEntryCount} previous meal ${event.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
                      })
                    ),
                  FoodMutationFailed: ({ event, parents, target }) =>
                    target.local.with(
                      new FoodEditorEdit({
                        ...parents["Route.Ready.Edit"],
                        message: event.message,
                      }),
                      (edit) => edit.Form(new FoodEditorEditForm())
                    ),
                },
              },
            },
          },
          Completed: {},
        },
      },
    },
  },
});

export default function FoodEditorRoute() {
  const params = useSchemaLocalSearchParams(FoodEditorRouteParams);

  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodEditorScreen dateKey={params.value.dateKey} foodId={params.value.id} />
  );
}

function FoodEditorScreen({
  dateKey,
  foodId,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly foodId: Domain.FoodId;
}) {
  const machineAtom = useMemo(
    () => MobileMachine.make(foodEditorMachine, { foodId }),
    [foodId]
  );
  const foodFormAtom = useMemo(
    () => machineAtom.child(FoodFormMachine.FoodFormChild),
    [machineAtom]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    (AsyncResult.isSuccess(stateResult) &&
      FoodEditorStates.matches(stateResult.value, "Route.Loading"))
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading food" />
      </AppScreen>
    );
  }

  if (AsyncResult.isFailure(stateResult)) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message="Could not start the food editor." tone="danger" />
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  const state = stateResult.value;
  const loadFailed = FoodEditorStates.get(state, "Route.LoadFailed").pipe(
    Option.getOrNull
  );
  if (loadFailed !== null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={loadFailed.message} tone="danger" />
        <Button icon={RotateCcw} onPress={() => send(new RetryFoodEditor())}>
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  const ready = FoodEditorStates.get(state, "Route.Ready").pipe(
    Option.getOrNull
  );
  if (ready === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading food" />
      </AppScreen>
    );
  }

  const copy = FoodEditorStates.get(state, "Route.Ready.Copy").pipe(
    Option.getOrNull
  );
  const edit = FoodEditorStates.get(state, "Route.Ready.Edit").pipe(
    Option.getOrNull
  );
  const completed = FoodEditorStates.get(state, "Route.Ready.Completed").pipe(
    Option.getOrNull
  );
  const food = completed?.food ?? ready.food;
  const usage = ready.usage;

  if (FoodEditorStates.matches(state, "Route.Ready.Copy.Form")) {
    return (
      <FoodForm
        action="edit"
        actor={foodFormAtom}
        disabled={false}
        feedback={
          copy?.message === null || copy?.message === undefined
            ? undefined
            : { message: copy.message, tone: "danger" }
        }
        hasFailed={false}
        heading="Copy food"
        intro={
          <Notice
            message="This creates a separate food. The source food and previous meal entries will not change."
            tone="neutral"
          />
        }
        onBack={() => send(new BackToFoodChoice())}
        portionUsage={[]}
        showPortions={false}
        submitLabel="Review copy"
      />
    );
  }

  if (
    FoodEditorStates.matches(state, "Route.Ready.Edit.Warning") ||
    FoodEditorStates.matches(state, "Route.Ready.Edit.Form") ||
    FoodEditorStates.matches(state, "Route.Ready.Edit.Previewing") ||
    FoodEditorStates.matches(state, "Route.Ready.Edit.Reviewing") ||
    FoodEditorStates.matches(state, "Route.Ready.Edit.Saving")
  ) {
    const previewing = FoodEditorStates.matches(
      state,
      "Route.Ready.Edit.Previewing"
    );
    const editing = FoodEditorStates.matches(state, "Route.Ready.Edit.Saving");
    const changes =
      edit?.draft === null || edit?.draft === undefined
        ? []
        : describeFoodChanges({
            draft: _foodDetailsFromDraft(edit.draft),
            food,
          });

    return (
      <>
        <FoodForm
          action="edit"
          actor={foodFormAtom}
          disabled={previewing || editing}
          feedback={
            edit?.message === null || edit?.message === undefined
              ? undefined
              : { message: edit.message, tone: "danger" }
          }
          hasFailed={false}
          heading="Edit food details"
          onBack={() => send(new BackToFoodChoice())}
          portionUsage={usage.portions}
          showPortions={false}
          submitLabel={
            editing
              ? "Saving changes"
              : previewing
                ? "Reviewing changes"
                : "Review changes"
          }
        />
        <EditImpactDialog
          onCancel={() => send(new BackToFoodChoice())}
          onContinue={() => send(new AcknowledgeFoodEdit())}
          usage={usage}
          visible={FoodEditorStates.matches(state, "Route.Ready.Edit.Warning")}
        />
        <EditReviewDialog
          changes={changes}
          loading={editing}
          onCancel={() => send(new BackToFoodForm())}
          onConfirm={() => send(new ConfirmFoodEdit())}
          usage={usage}
          visible={
            FoodEditorStates.matches(state, "Route.Ready.Edit.Reviewing") ||
            editing
          }
        />
      </>
    );
  }

  if (FoodEditorStates.matches(state, "Route.Ready.ChoosingAction")) {
    return (
      <WorkflowPage food={food} title="Manage food">
        <Notice
          message={
            usage.mealEntryCount === 0
              ? "This food has never been used. Copying creates another food; editing changes this food directly."
              : `This food appears in ${usage.mealEntryCount} meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}. Choose whether you want another food or want to change this one everywhere.`
          }
          tone="neutral"
        />
        <SectionCard
          subtitle="Add, update, delete, or select the price used for spending estimates."
          title="Manage prices"
        >
          <Button
            icon={ReceiptEuro}
            onPress={() => {
              router.push(`/foods/${food.id}/prices`);
            }}
          >
            Manage prices
          </Button>
        </SectionCard>
        <SectionCard
          subtitle="Add a portion, change one everywhere, or create a new portion while keeping earlier entries unchanged."
          title="Manage portions"
        >
          {food.origin === "app-default" ? (
            <Notice
              message="Pre-installed foods cannot be changed. Create your own food copy first."
              tone="warning"
            />
          ) : (
            <Button
              icon={Ruler}
              onPress={() => {
                router.push(`/foods/${food.id}/portions`);
              }}
            >
              Manage portions
            </Button>
          )}
        </SectionCard>
        <SectionCard
          subtitle="Keep the same food identity and update every entry that uses it."
          title="Edit food details"
        >
          {food.origin === "app-default" ? (
            <Notice
              message="Pre-installed foods cannot be edited. Create your own copy instead."
              tone="warning"
            />
          ) : (
            <Button icon={Pencil} onPress={() => send(new ChooseFoodEdit())}>
              Edit food details
            </Button>
          )}
        </SectionCard>
        <SectionCard
          subtitle="Create a separate food from these values. Previous entries stay unchanged."
          title="Copy food"
        >
          <Button icon={Copy} onPress={() => send(new ChooseFoodCopy())}>
            Copy this food
          </Button>
        </SectionCard>
      </WorkflowPage>
    );
  }

  if (
    FoodEditorStates.matches(state, "Route.Ready.Copy.Reviewing") ||
    FoodEditorStates.matches(state, "Route.Ready.Copy.Saving")
  ) {
    const draft = copy?.draft;
    const duplicateCount =
      draft === null || draft === undefined
        ? 0
        : ready.foods.filter(
            (candidate) =>
              _normalizeNameGroupValue(candidate.name) ===
                _normalizeNameGroupValue(draft.name) &&
              _normalizeNameGroupValue(candidate.brand ?? "") ===
                _normalizeNameGroupValue(draft.brand ?? "")
          ).length;
    return (
      <WorkflowPage food={food} title="Review food copy">
        <Notice
          message="A new food and new portion definitions will be created. The source food and every previous entry stay unchanged."
          tone="neutral"
        />
        {duplicateCount === 0 ? null : (
          <Notice
            message={`${duplicateCount} existing ${duplicateCount === 1 ? "food has" : "foods have"} the same name and brand. Search will mark this copy as Newest and the previous matches as Older.`}
            tone="warning"
          />
        )}
        {copy?.message === null || copy?.message === undefined ? null : (
          <Notice message={copy.message} tone="danger" />
        )}
        <BottomActions
          back={() => send(new BackToFoodForm())}
          confirm={() => send(new ApplyFoodCopy())}
          confirmLabel="Create food copy"
          loading={FoodEditorStates.matches(state, "Route.Ready.Copy.Saving")}
        />
      </WorkflowPage>
    );
  }

  return (
    <WorkflowPage food={food} title="Food saved">
      <Notice message={completed?.message ?? "Food saved."} tone="success" />
      <Button
        icon={Save}
        onPress={() => {
          router.replace({
            pathname: "/foods",
            params: {
              tab: "manage",
              ...(dateKey === undefined ? {} : { dateKey }),
            },
          });
        }}
      >
        Back to foods
      </Button>
    </WorkflowPage>
  );
}

function WorkflowPage({
  children,
  food,
  title,
}: {
  readonly children: ReactNode;
  readonly food: Domain.Food;
  readonly title: string;
}) {
  return (
    <AppScreen
      contentStyle={styles.pageContent}
      safeAreaEdges={["top"]}
      scroll
      topSafeAreaColor={color.primary}
    >
      <AppHeader
        embedded
        leading={
          <IconButton
            accessibilityLabel="Back to foods"
            icon={ChevronLeft}
            onPress={() => router.back()}
            variant="ghost"
          />
        }
        shadow
        title={title}
      />
      <View style={styles.foodHeading}>
        <Text style={styles.foodName}>{food.name}</Text>
        {food.brand === undefined ? null : (
          <Text style={styles.foodBrand}>{food.brand}</Text>
        )}
      </View>
      <View style={styles.stepBody}>{children}</View>
    </AppScreen>
  );
}

function BottomActions({
  back,
  confirm,
  confirmLabel,
  loading = false,
}: {
  readonly back: () => void;
  readonly confirm: () => void;
  readonly confirmLabel: string;
  readonly loading?: boolean;
}) {
  return (
    <View style={styles.inlineActions}>
      <Button
        disabled={loading}
        onPress={back}
        style={styles.action}
        variant="secondary"
      >
        Back
      </Button>
      <Button loading={loading} onPress={confirm} style={styles.action}>
        {confirmLabel}
      </Button>
    </View>
  );
}

function EditImpactDialog({
  onCancel,
  onContinue,
  usage,
  visible,
}: {
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly usage: Foods.FoodEditUsage;
  readonly visible: boolean;
}) {
  const changesHistory = usage.mealEntryCount > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.dialogBackdrop}>
        <View
          style={[styles.dialog, changesHistory ? null : styles.safeDialog]}
        >
          {changesHistory ? (
            <ShieldAlert
              color={color.warningText}
              size={28}
              strokeWidth={2.5}
            />
          ) : (
            <CircleCheck color={color.safeText} size={28} strokeWidth={2.5} />
          )}
          <Text style={styles.dialogTitle}>
            {usage.mealEntryCount === 0
              ? "Edit this unused food?"
              : "Edit this food everywhere?"}
          </Text>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>
              {usage.mealEntryCount === 0
                ? "This food has never been used, so no previous day will change."
                : `This food appears in ${usage.mealEntryCount} meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(usage)}. Saving changes will update the food details used to calculate those days. Portions are managed separately.`}
            </Text>
          </ScrollView>
          <View style={styles.inlineActions}>
            <Button
              onPress={onCancel}
              style={styles.action}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              onPress={onContinue}
              style={styles.action}
              variant={changesHistory ? "primary" : "safe"}
            >
              Continue
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EditReviewDialog({
  changes,
  loading,
  onCancel,
  onConfirm,
  usage,
  visible,
}: {
  readonly changes: readonly string[];
  readonly loading: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly usage: Foods.FoodEditUsage;
  readonly visible: boolean;
}) {
  const changesHistory = usage.mealEntryCount > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.dialogBackdrop}>
        <View
          style={[styles.dialog, changesHistory ? null : styles.safeDialog]}
        >
          {changesHistory ? (
            <ShieldAlert
              color={color.warningText}
              size={28}
              strokeWidth={2.5}
            />
          ) : (
            <CircleCheck color={color.safeText} size={28} strokeWidth={2.5} />
          )}
          <Text style={styles.dialogTitle}>Review changes</Text>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>
              {usage.mealEntryCount === 0
                ? "No previous meal entries will change."
                : `These changes will recalculate ${usage.mealEntryCount} previous meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(usage)}.`}
            </Text>
            <View style={styles.changeSection}>
              <Text style={styles.changeSectionTitle}>What changed</Text>
              {Array.isReadonlyArrayNonEmpty(changes) ? (
                <View style={styles.changeList}>
                  {changes.map((change) => (
                    <Text key={change} style={styles.changeItem}>
                      {`• ${change}`}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.dialogMessage}>
                  No field values changed.
                </Text>
              )}
            </View>
            <Text style={styles.dialogMessage}>
              Portions remain unchanged. This operation cannot be undone.
            </Text>
          </ScrollView>
          <View style={styles.inlineActions}>
            <Button
              disabled={loading}
              onPress={onCancel}
              style={styles.action}
              variant="secondary"
            >
              Back to editing
            </Button>
            <Button
              disabled={!Array.isReadonlyArrayNonEmpty(changes)}
              loading={loading}
              onPress={onConfirm}
              style={styles.action}
              variant={changesHistory ? "danger" : "safe"}
            >
              Confirm changes
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function _missingFoodDraftFailure() {
  return new FoodMutationFailed({
    message:
      "Could not save this food. Please review the values and try again.",
  });
}

function _foodMutationErrorMessage(error: unknown) {
  if (Predicate.isTagged(error, "UsedFoodPortionMutationNotAllowed")) {
    return "A used portion was changed or removed. Restore it before saving.";
  }
  if (Predicate.isTagged(error, "IncompatibleFoodMeasurement")) {
    return "The edited measurement settings cannot interpret every previous entry.";
  }
  if (Predicate.isTagged(error, "AppDefaultFoodEditNotAllowed")) {
    return "Pre-installed foods cannot be edited. Create a copy instead.";
  }
  return "Could not save this food. Please review the values and try again.";
}

function _usageDateRange(usage: Foods.FoodEditUsage) {
  if (usage.firstDateKey === undefined || usage.lastDateKey === undefined) {
    return "";
  }

  const firstDate = formatShortDate({ dateKey: usage.firstDateKey });
  return usage.firstDateKey === usage.lastDateKey
    ? ` on ${firstDate}`
    : ` between ${firstDate} and ${formatShortDate({ dateKey: usage.lastDateKey })}`;
}

function _normalizeNameGroupValue(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

function _foodDetailsFromDraft(draft: Foods.CreateFoodInput): Omit<
  Foods.EditFoodDetailsInput,
  "foodId" | "nutritionReference"
> & {
  readonly nutritionReference: NonNullable<
    Foods.EditFoodDetailsInput["nutritionReference"]
  >;
} {
  const {
    initialPrice: _initialPrice,
    portions: _portions,
    nutritionReference = { amount: "100", unit: "g" },
    ...details
  } = draft;
  return { ...details, nutritionReference };
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  pageContent: {
    gap: spacing.lg,
    paddingHorizontal: 0,
  },
  foodHeading: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  foodName: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
  foodBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  stepBody: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  action: {
    minWidth: 0,
    flex: 1,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  dialog: {
    width: "100%",
    maxHeight: "88%",
    maxWidth: 480,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: color.warningBorder,
    borderRadius: radius.md,
    padding: spacing.xl,
    backgroundColor: color.sheet,
  },
  safeDialog: {
    borderColor: color.safeBorder,
    backgroundColor: color.safeBg,
  },
  dialogTitle: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogMessage: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  dialogScroll: {
    flexShrink: 1,
  },
  dialogScrollContent: {
    gap: spacing.lg,
  },
  changeSection: {
    gap: spacing.sm,
  },
  changeSectionTitle: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  changeList: {
    gap: spacing.sm,
  },
  changeItem: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
});
