import { MeasurementUnitSelect } from "@/components/nutrition/measurement-unit-select";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field, NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatShortDate } from "@/lib/format";
import { MobileMachine } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import {
  ChevronLeft,
  CopyPlus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react-native";
import { useMemo } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

const RouteParams = Schema.Struct({ id: Domain.FoodId });

const PortionFormValues = Schema.Struct({
  amount: Schema.String,
  name: Schema.String,
  unit: Domain.MeasurementUnit,
});
type PortionFormValues = typeof PortionFormValues.Type;

const measurementUnitByValue: Readonly<
  Record<string, Domain.MeasurementUnit | undefined>
> = {
  g: "g",
  kg: "kg",
  l: "l",
  lb: "lb",
  ml: "ml",
  oz: "oz",
};

const PortionEditInput = Schema.Struct({
  foodId: Domain.FoodId,
  form: PortionFormValues,
  portionId: Domain.FoodPortionId,
});
const MessageTone = Schema.Literals(["danger", "success"]);

class PortionsRoute extends Schema.TaggedClass<PortionsRoute>("PortionsRoute")(
  "PortionsRoute",
  { foodId: Domain.FoodId }
) {}
class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {
  message: Schema.NullOr(Schema.String),
  messageTone: MessageTone,
}) {}
class LoadFailed extends Schema.TaggedClass<LoadFailed>("LoadFailed")(
  "LoadFailed",
  { message: Schema.String }
) {}
class Ready extends Schema.TaggedClass<Ready>("Ready")("Ready", {
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
}) {}
class Listing extends Schema.TaggedClass<Listing>("Listing")("Listing", {
  message: Schema.NullOr(Schema.String),
  messageTone: MessageTone,
}) {}
class Adding extends Schema.TaggedClass<Adding>("Adding")("Adding", {
  sourcePortionId: Schema.NullOr(Domain.FoodPortionId),
}) {}
class AddingForm extends Schema.TaggedClass<AddingForm>("AddingForm")(
  "AddingForm",
  { form: PortionFormValues, message: Schema.NullOr(Schema.String) }
) {}
class AddingSaving extends Schema.TaggedClass<AddingSaving>("AddingSaving")(
  "AddingSaving",
  { form: PortionFormValues }
) {}
class Editing extends Schema.TaggedClass<Editing>("Editing")("Editing", {
  portionId: Domain.FoodPortionId,
}) {}
class EditWarning extends Schema.TaggedClass<EditWarning>("EditWarning")(
  "EditWarning",
  { form: PortionFormValues }
) {}
class EditForm extends Schema.TaggedClass<EditForm>("EditForm")("EditForm", {
  form: PortionFormValues,
  message: Schema.NullOr(Schema.String),
}) {}
class PreviewingEdit extends Schema.TaggedClass<PreviewingEdit>(
  "PreviewingEdit"
)("PreviewingEdit", { form: PortionFormValues }) {}
class ReviewingEdit extends Schema.TaggedClass<ReviewingEdit>("ReviewingEdit")(
  "ReviewingEdit",
  { form: PortionFormValues }
) {}
class SavingEdit extends Schema.TaggedClass<SavingEdit>("SavingEdit")(
  "SavingEdit",
  { form: PortionFormValues }
) {}
class Removing extends Schema.TaggedClass<Removing>("Removing")("Removing", {
  portionId: Domain.FoodPortionId,
}) {}

class Add extends Schema.TaggedClass<Add>("Add")("Add", {}) {}
class Back extends Schema.TaggedClass<Back>("Back")("Back", {}) {}
class Cancel extends Schema.TaggedClass<Cancel>("Cancel")("Cancel", {}) {}
class ConfirmChangeEverywhere extends Schema.TaggedClass<ConfirmChangeEverywhere>(
  "ConfirmChangeEverywhere"
)("ConfirmChangeEverywhere", {}) {}
class Retry extends Schema.TaggedClass<Retry>("Retry")("Retry", {}) {}
class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {}) {}
class ChangeForm extends Schema.TaggedClass<ChangeForm>("ChangeForm")(
  "ChangeForm",
  {
    field: Schema.Literals(["amount", "name", "unit"]),
    value: Schema.String,
  }
) {}
class CreateFromPortion extends Schema.TaggedClass<CreateFromPortion>(
  "CreateFromPortion"
)("CreateFromPortion", { portionId: Domain.FoodPortionId }) {}
class EditPortion extends Schema.TaggedClass<EditPortion>("EditPortion")(
  "EditPortion",
  { portionId: Domain.FoodPortionId }
) {}
class RemovePortion extends Schema.TaggedClass<RemovePortion>("RemovePortion")(
  "RemovePortion",
  { portionId: Domain.FoodPortionId }
) {}
class FoodLoaded extends Schema.TaggedClass<FoodLoaded>("FoodLoaded")(
  "FoodLoaded",
  { food: Domain.Food, usage: Foods.FoodEditUsage }
) {}
class PreviewSucceeded extends Schema.TaggedClass<PreviewSucceeded>(
  "PreviewSucceeded"
)("PreviewSucceeded", {}) {}
class PortionAdded extends Schema.TaggedClass<PortionAdded>("PortionAdded")(
  "PortionAdded",
  {}
) {}
class PortionEdited extends Schema.TaggedClass<PortionEdited>("PortionEdited")(
  "PortionEdited",
  { revisedMealEntryCount: Schema.Number }
) {}
class PortionRemoved extends Schema.TaggedClass<PortionRemoved>(
  "PortionRemoved"
)("PortionRemoved", {}) {}
class OperationFailed extends Schema.TaggedClass<OperationFailed>(
  "OperationFailed"
)("OperationFailed", { message: Schema.String }) {}

const PortionManagerStates = Machine.defineStates({
  Route: {
    schema: PortionsRoute,
    initial: "Loading",
    states: {
      Loading,
      LoadFailed,
      Ready: {
        schema: Ready,
        initial: "Listing",
        states: {
          Listing,
          Adding: {
            schema: Adding,
            initial: "Form",
            states: { Form: AddingForm, Saving: AddingSaving },
          },
          Editing: {
            schema: Editing,
            initial: "Warning",
            states: {
              Warning: EditWarning,
              Form: EditForm,
              Previewing: PreviewingEdit,
              Reviewing: ReviewingEdit,
              Saving: SavingEdit,
            },
          },
          Removing,
        },
      },
    },
  },
});

const portionOperations = {
  load: (foodId: Domain.FoodId) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      return new FoodLoaded({
        food: yield* foods.get({ input: { foodId } }),
        usage: yield* foods.inspectEdit({ input: { foodId } }),
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({
            message: "Could not load the portions for this food.",
          })
        )
      )
    ),
  add: (foodId: Domain.FoodId, form: PortionFormValues) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      yield* foods.addFoodPortion({
        input: {
          foodId,
          name: form.name,
          size: { amount: form.amount, unit: form.unit },
        },
      });
      return new PortionAdded();
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          new OperationFailed({ message: _mutationErrorMessage(error) })
        )
      )
    ),
  preview: (input: typeof PortionEditInput.Type) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      yield* foods.previewFoodPortionEdit({ input: _editInput(input) });
      return new PreviewSucceeded();
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          new OperationFailed({ message: _mutationErrorMessage(error) })
        )
      )
    ),
  edit: (input: typeof PortionEditInput.Type) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      const result = yield* foods.editFoodPortionEverywhere({
        input: _editInput(input),
      });
      return new PortionEdited({
        revisedMealEntryCount: result.revisedMealEntryCount,
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          new OperationFailed({ message: _mutationErrorMessage(error) })
        )
      )
    ),
  remove: (foodId: Domain.FoodId, portionId: Domain.FoodPortionId) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      yield* foods.removeUnusedFoodPortion({ input: { foodId, portionId } });
      return new PortionRemoved();
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(
          new OperationFailed({ message: _mutationErrorMessage(error) })
        )
      )
    ),
};

const portionManagerMachine = Machine.make({
  states: PortionManagerStates.states,
  events: [
    Add,
    Back,
    Cancel,
    ChangeForm,
    ConfirmChangeEverywhere,
    CreateFromPortion,
    EditPortion,
    RemovePortion,
    Retry,
    Submit,
  ],
  internalEvents: [
    FoodLoaded,
    PreviewSucceeded,
    PortionAdded,
    PortionEdited,
    PortionRemoved,
    OperationFailed,
  ],
  input: Schema.Struct({ foodId: Domain.FoodId }),
  initial: ({ foodId }) =>
    PortionManagerStates.initial.Route(new PortionsRoute({ foodId }), (route) =>
      route.Loading(new Loading({ message: null, messageTone: "success" }))
    ),
}).handle({
  Route: {
    states: {
      Loading: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "load-portions",
            src: () =>
              Machine.effect(portionOperations.load(parents.Route.foodId)),
          }),
        on: {
          FoodLoaded: ({ event, state, target }) =>
            target.local.Ready(
              new Ready({ food: event.food, usage: event.usage }),
              (ready) =>
                ready.Listing(
                  new Listing({
                    message: state.message,
                    messageTone: state.messageTone,
                  })
                )
            ),
          OperationFailed: ({ event, target }) =>
            target.local.LoadFailed(new LoadFailed({ message: event.message })),
        },
      },
      LoadFailed: {
        on: {
          Retry: ({ target }) =>
            target.local.Loading(
              new Loading({ message: null, messageTone: "success" })
            ),
        },
      },
      Ready: {
        states: {
          Listing: {
            on: {
              Add: ({ target }) =>
                target.local.Adding(
                  new Adding({ sourcePortionId: null }),
                  (adding) =>
                    adding.Form(
                      new AddingForm({
                        form: { amount: "", name: "", unit: "g" },
                        message: null,
                      })
                    )
                ),
              CreateFromPortion: ({ event, parents, target }) => {
                const portion = parents["Route.Ready"].food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );
                return portion === undefined
                  ? undefined
                  : target.local.Adding(
                      new Adding({ sourcePortionId: portion.id }),
                      (adding) =>
                        adding.Form(
                          new AddingForm({
                            form: {
                              amount: `${portion.size.amount}`,
                              name: `${portion.name} copy`,
                              unit: portion.size.unit,
                            },
                            message: null,
                          })
                        )
                    );
              },
              EditPortion: ({ event, parents, target }) => {
                const ready = parents["Route.Ready"];
                const portion = ready.food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );
                const usage = ready.usage.portions.find(
                  (candidate) => candidate.portionId === event.portionId
                );
                if (portion === undefined || usage === undefined) return;
                const form = {
                  amount: `${portion.size.amount}`,
                  name: portion.name,
                  unit: portion.size.unit,
                };
                return target.local.Editing(
                  new Editing({ portionId: portion.id }),
                  (editing) =>
                    usage.mealEntryCount > 0
                      ? editing.Warning(new EditWarning({ form }))
                      : editing.Form(new EditForm({ form, message: null }))
                );
              },
              RemovePortion: ({ event, parents, target }) => {
                const ready = parents["Route.Ready"];
                const portion = ready.food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );
                const usage = ready.usage.portions.find(
                  (candidate) => candidate.portionId === event.portionId
                );
                return portion === undefined ||
                  usage === undefined ||
                  usage.mealEntryCount > 0
                  ? undefined
                  : target.local.Removing(
                      new Removing({ portionId: portion.id })
                    );
              },
            },
          },
          Adding: {
            states: {
              Form: {
                on: {
                  Cancel: ({ parents, target }) =>
                    target.full.Route(parents.Route, (route) =>
                      route.Ready(parents["Route.Ready"], (ready) =>
                        ready.Listing(
                          new Listing({
                            message: null,
                            messageTone: "success",
                          })
                        )
                      )
                    ),
                  ChangeForm: ({ event, state, target }) =>
                    target.local.Form(
                      new AddingForm({
                        form: _changeForm({ event, form: state.form }),
                        message: null,
                      })
                    ),
                  Submit: ({ state, target }) =>
                    target.local.Saving(new AddingSaving({ form: state.form })),
                },
              },
              Saving: {
                invoke: ({ parents, state }) =>
                  Machine.invoke({
                    id: "add-portion",
                    src: () =>
                      Machine.effect(
                        portionOperations.add(parents.Route.foodId, state.form)
                      ),
                  }),
                on: {
                  PortionAdded: ({ parents, target }) =>
                    target.full.Route(parents.Route, (route) =>
                      route.Loading(
                        new Loading({
                          message:
                            "Portion added. Previous entries were unchanged.",
                          messageTone: "success",
                        })
                      )
                    ),
                  OperationFailed: ({ event, state, target }) =>
                    target.local.Form(
                      new AddingForm({
                        form: state.form,
                        message: event.message,
                      })
                    ),
                },
              },
            },
          },
          Editing: {
            states: {
              Warning: {
                on: {
                  Back: ({ parents, target }) =>
                    target.full.Route(parents.Route, (route) =>
                      route.Ready(parents["Route.Ready"], (ready) =>
                        ready.Listing(
                          new Listing({
                            message: null,
                            messageTone: "success",
                          })
                        )
                      )
                    ),
                  ConfirmChangeEverywhere: ({ state, target }) =>
                    target.local.Form(
                      new EditForm({ form: state.form, message: null })
                    ),
                },
              },
              Form: {
                on: {
                  Cancel: ({ parents, target }) =>
                    target.full.Route(parents.Route, (route) =>
                      route.Ready(parents["Route.Ready"], (ready) =>
                        ready.Listing(
                          new Listing({
                            message: null,
                            messageTone: "success",
                          })
                        )
                      )
                    ),
                  ChangeForm: ({ event, state, target }) =>
                    target.local.Form(
                      new EditForm({
                        form: _changeForm({ event, form: state.form }),
                        message: null,
                      })
                    ),
                  Submit: ({ parents, state, target }) => {
                    const usage = parents["Route.Ready"].usage.portions.find(
                      (candidate) =>
                        candidate.portionId ===
                        parents["Route.Ready.Editing"].portionId
                    );
                    return (usage?.mealEntryCount ?? 0) > 0
                      ? target.local.Previewing(
                          new PreviewingEdit({ form: state.form })
                        )
                      : target.local.Saving(
                          new SavingEdit({ form: state.form })
                        );
                  },
                },
              },
              Previewing: {
                invoke: ({ parents, state }) =>
                  Machine.invoke({
                    id: "preview-portion-edit",
                    src: () =>
                      Machine.effect(
                        portionOperations.preview({
                          foodId: parents.Route.foodId,
                          form: state.form,
                          portionId: parents["Route.Ready.Editing"].portionId,
                        })
                      ),
                  }),
                on: {
                  PreviewSucceeded: ({ state, target }) =>
                    target.local.Reviewing(
                      new ReviewingEdit({ form: state.form })
                    ),
                  OperationFailed: ({ event, state, target }) =>
                    target.local.Form(
                      new EditForm({
                        form: state.form,
                        message: event.message,
                      })
                    ),
                },
              },
              Reviewing: {
                on: {
                  Back: ({ state, target }) =>
                    target.local.Form(
                      new EditForm({ form: state.form, message: null })
                    ),
                  ConfirmChangeEverywhere: ({ state, target }) =>
                    target.local.Saving(new SavingEdit({ form: state.form })),
                },
              },
              Saving: {
                invoke: ({ parents, state }) =>
                  Machine.invoke({
                    id: "save-portion-edit",
                    src: () =>
                      Machine.effect(
                        portionOperations.edit({
                          foodId: parents.Route.foodId,
                          form: state.form,
                          portionId: parents["Route.Ready.Editing"].portionId,
                        })
                      ),
                  }),
                on: {
                  PortionEdited: ({ event, parents, target }) =>
                    target.full.Route(parents.Route, (route) =>
                      route.Loading(
                        new Loading({
                          message:
                            event.revisedMealEntryCount === 0
                              ? "Unused portion updated. No previous entry changed."
                              : `Portion updated across ${event.revisedMealEntryCount} previous meal ${event.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
                          messageTone: "success",
                        })
                      )
                    ),
                  OperationFailed: ({ event, state, target }) =>
                    target.local.Form(
                      new EditForm({
                        form: state.form,
                        message: event.message,
                      })
                    ),
                },
              },
            },
          },
          Removing: {
            invoke: ({ parents, state }) =>
              Machine.invoke({
                id: "remove-portion",
                src: () =>
                  Machine.effect(
                    portionOperations.remove(
                      parents.Route.foodId,
                      state.portionId
                    )
                  ),
              }),
            on: {
              PortionRemoved: ({ parents, target }) =>
                target.full.Route(parents.Route, (route) =>
                  route.Loading(
                    new Loading({
                      message: "Unused portion removed.",
                      messageTone: "success",
                    })
                  )
                ),
              OperationFailed: ({ event, target }) =>
                target.local.Listing(
                  new Listing({
                    message: event.message,
                    messageTone: "danger",
                  })
                ),
            },
          },
        },
      },
    },
  },
});

export default function FoodPortionsRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodPortionsScreen foodId={params.value.id} />
  );
}

function FoodPortionsScreen({ foodId }: { readonly foodId: Domain.FoodId }) {
  const machineAtom = useMemo(
    () => MobileMachine.make(portionManagerMachine, { foodId }),
    [foodId]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    PortionManagerStates.matches(stateResult.value, "Route.Loading")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading portions" />
      </AppScreen>
    );
  }

  const failed = PortionManagerStates.get(
    stateResult.value,
    "Route.LoadFailed"
  ).pipe(Option.getOrUndefined);
  if (failed !== undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={failed.message} tone="danger" />
        <Button icon={RotateCcw} onPress={() => send(new Retry())}>
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  const ready = PortionManagerStates.get(stateResult.value, "Route.Ready").pipe(
    Option.getOrUndefined
  );
  if (ready === undefined) return <Redirect href="/foods" />;

  const { food, usage } = ready;
  const listing = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Listing"
  ).pipe(Option.getOrUndefined);
  const adding = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Adding"
  ).pipe(Option.getOrUndefined);
  const addingForm = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Adding.Form"
  ).pipe(Option.getOrUndefined);
  const addingSaving = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Adding.Saving"
  ).pipe(Option.getOrUndefined);
  const editing = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing"
  ).pipe(Option.getOrUndefined);
  const editWarning = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing.Warning"
  ).pipe(Option.getOrUndefined);
  const editForm = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing.Form"
  ).pipe(Option.getOrUndefined);
  const previewingEdit = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing.Previewing"
  ).pipe(Option.getOrUndefined);
  const reviewingEdit = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing.Reviewing"
  ).pipe(Option.getOrUndefined);
  const savingEdit = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Editing.Saving"
  ).pipe(Option.getOrUndefined);
  const removing = PortionManagerStates.get(
    stateResult.value,
    "Route.Ready.Removing"
  ).pipe(Option.getOrUndefined);

  const selectedPortionId =
    adding?.sourcePortionId ?? editing?.portionId ?? removing?.portionId;
  const selectedPortion =
    selectedPortionId === null || selectedPortionId === undefined
      ? undefined
      : food.portions.find((portion) => portion.id === selectedPortionId);
  const selectedUsage =
    selectedPortion === undefined
      ? undefined
      : usage.portions.find(
          (candidate) => candidate.portionId === selectedPortion.id
        );

  if (listing !== undefined) {
    return (
      <PortionPage food={food} title="Manage portions">
        <Notice
          message="Portions are managed separately from nutrition and other food details."
          tone="neutral"
        />
        {listing.message === null ? null : (
          <Notice message={listing.message} tone={listing.messageTone} />
        )}
        {Array.isReadonlyArrayNonEmpty(food.portions) ? (
          <View style={styles.stack}>
            {food.portions.map((portion) => {
              const portionUsage = usage.portions.find(
                (candidate) => candidate.portionId === portion.id
              );
              const isUsed = (portionUsage?.mealEntryCount ?? 0) > 0;
              return (
                <SectionCard
                  key={portion.id}
                  subtitle={`${portion.size.amount} ${portion.size.unit}`}
                  title={portion.name}
                >
                  <View style={styles.portionCardBody}>
                    <Text style={styles.metaText}>
                      {portionUsage === undefined ||
                      portionUsage.mealEntryCount === 0
                        ? "Never used — can be edited or removed freely."
                        : `Used in ${portionUsage.mealEntryCount} meal ${portionUsage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(portionUsage)}.`}
                    </Text>
                    <View style={styles.actions}>
                      <Button
                        icon={Pencil}
                        onPress={() =>
                          send(new EditPortion({ portionId: portion.id }))
                        }
                        style={styles.action}
                        variant={isUsed ? "primary" : "secondary"}
                      >
                        {isUsed ? "Edit everywhere" : "Edit"}
                      </Button>
                      <Button
                        icon={isUsed ? CopyPlus : Trash2}
                        onPress={() =>
                          isUsed
                            ? send(
                                new CreateFromPortion({
                                  portionId: portion.id,
                                })
                              )
                            : send(new RemovePortion({ portionId: portion.id }))
                        }
                        style={styles.action}
                        variant={isUsed ? "secondary" : "danger"}
                      >
                        {isUsed ? "Copy" : "Remove"}
                      </Button>
                    </View>
                  </View>
                </SectionCard>
              );
            })}
          </View>
        ) : (
          <Notice
            message="This food has no custom portions yet."
            tone="neutral"
          />
        )}
        <Button icon={Plus} onPress={() => send(new Add())}>
          Add a portion
        </Button>
      </PortionPage>
    );
  }

  const addingBlankPortion =
    adding !== undefined && adding.sourcePortionId === null;
  if (addingBlankPortion) {
    const formState = addingForm ?? addingSaving;
    if (formState === undefined) return <Redirect href="/foods" />;
    const saving = addingSaving !== undefined;
    const formIsValid = _formIsValid({
      food,
      form: formState.form,
      exceptPortionId: undefined,
    });
    return (
      <PortionPage food={food} title="Add portion">
        <Notice
          message="This creates a new portion. Previous meal entries will not change."
          tone="neutral"
        />
        <PortionFields
          disabled={saving}
          form={formState.form}
          onChange={(field, value) => send(new ChangeForm({ field, value }))}
        />
        {addingForm?.message === null ||
        addingForm?.message === undefined ? null : (
          <Notice message={addingForm.message} tone="danger" />
        )}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={() => send(new Cancel())}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={() => send(new Submit())}
            style={styles.action}
          >
            Add portion
          </Button>
        </View>
      </PortionPage>
    );
  }

  if (selectedPortion === undefined || selectedUsage === undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message="This portion could not be found." tone="danger" />
        <Button onPress={() => send(new Cancel())}>Back to portions</Button>
      </AppScreen>
    );
  }

  const isUsed = selectedUsage.mealEntryCount > 0;
  if (removing !== undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message={`Removing ${selectedPortion.name}`} />
      </AppScreen>
    );
  }

  const isNew = adding !== undefined;
  if (
    isNew ||
    editWarning !== undefined ||
    editForm !== undefined ||
    previewingEdit !== undefined ||
    reviewingEdit !== undefined ||
    savingEdit !== undefined
  ) {
    const formState =
      addingForm ??
      addingSaving ??
      editWarning ??
      editForm ??
      previewingEdit ??
      reviewingEdit ??
      savingEdit;
    if (formState === undefined) return <Redirect href="/foods" />;
    const saving = addingSaving !== undefined || savingEdit !== undefined;
    const reviewing = previewingEdit !== undefined;
    const formIsValid = _formIsValid({
      food,
      form: formState.form,
      exceptPortionId: isNew ? undefined : selectedPortion.id,
    });
    const changes: string[] = [];
    if (formState.form.name.trim() !== selectedPortion.name) {
      changes.push(
        `Name: “${selectedPortion.name}” → “${formState.form.name.trim()}”`
      );
    }
    if (
      Number(formState.form.amount) !== selectedPortion.size.amount ||
      formState.form.unit !== selectedPortion.size.unit
    ) {
      changes.push(
        `Size: ${selectedPortion.size.amount} ${selectedPortion.size.unit} → ${formState.form.amount} ${formState.form.unit}`
      );
    }
    return (
      <>
        <PortionPage food={food} title={isNew ? "Add portion" : "Edit portion"}>
          <Notice
            message={
              isNew
                ? "This creates a new portion. Previous meal entries will not change."
                : isUsed
                  ? `Saving will update ${selectedUsage.mealEntryCount} historical meal ${selectedUsage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(selectedUsage)}.`
                  : "This portion has never been used, so you can edit it freely."
            }
            tone={isUsed && !isNew ? "warning" : "neutral"}
          />
          <PortionFields
            disabled={saving || reviewing}
            form={formState.form}
            onChange={(field, value) => send(new ChangeForm({ field, value }))}
          />
          {addingForm?.message === null || addingForm?.message === undefined ? (
            editForm?.message === null ||
            editForm?.message === undefined ? null : (
              <Notice message={editForm.message} tone="danger" />
            )
          ) : (
            <Notice message={addingForm.message} tone="danger" />
          )}
          <View style={styles.actions}>
            <Button
              disabled={saving || reviewing}
              onPress={() => send(new Cancel())}
              style={styles.action}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={!formIsValid}
              icon={Save}
              loading={saving || reviewing}
              onPress={() => send(new Submit())}
              style={styles.action}
            >
              {isNew ? "Add portion" : isUsed ? "Review changes" : "Save"}
            </Button>
          </View>
        </PortionPage>
        <ConfirmationDialog
          confirmLabel="Continue"
          message={`This portion is used in ${selectedUsage.mealEntryCount} meal ${selectedUsage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(selectedUsage)}. Any saved changes will apply to all of them.`}
          onCancel={() => send(new Back())}
          onConfirm={() => send(new ConfirmChangeEverywhere())}
          title="Change this portion everywhere?"
          visible={editWarning !== undefined}
        />
        <ReviewDialog
          changes={changes}
          loading={savingEdit !== undefined}
          onCancel={() => send(new Back())}
          onConfirm={() => send(new ConfirmChangeEverywhere())}
          usage={selectedUsage}
          visible={reviewingEdit !== undefined || savingEdit !== undefined}
        />
      </>
    );
  }

  return <Redirect href="/foods" />;
}

function PortionPage({
  children,
  food,
  title,
}: {
  readonly children: React.ReactNode;
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
            accessibilityLabel="Back"
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
      <View style={styles.body}>{children}</View>
    </AppScreen>
  );
}

function PortionFields({
  disabled,
  form,
  onChange,
}: {
  readonly disabled: boolean;
  readonly form: PortionFormValues;
  readonly onChange: (field: "amount" | "name" | "unit", value: string) => void;
}) {
  return (
    <SectionCard title="Portion details">
      <View style={styles.stack}>
        <Field
          editable={!disabled}
          label="Portion name"
          onChangeText={(value) => onChange("name", value)}
          placeholder="Scoop"
          value={form.name}
        />
        <NumberField
          editable={!disabled}
          label={`One ${form.name.trim() || "portion"} equals`}
          onChangeText={(value) => onChange("amount", value)}
          placeholder="30"
          rightElement={
            <MeasurementUnitSelect
              disabled={disabled}
              onSelect={(unit) => onChange("unit", unit)}
              selectedUnit={form.unit}
              title="Portion unit"
              units={["g", "kg", "oz", "lb", "ml", "l"]}
            />
          }
          value={form.amount}
        />
      </View>
    </SectionCard>
  );
}

function ConfirmationDialog({
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
  visible,
}: {
  readonly confirmLabel: string;
  readonly message: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <ShieldAlert color={color.warningText} size={28} strokeWidth={2.5} />
          <Text style={styles.dialogTitle}>{title}</Text>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>{message}</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Button
              onPress={onCancel}
              style={styles.action}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button onPress={onConfirm} style={styles.action}>
              {confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReviewDialog({
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
  readonly usage: Foods.FoodPortionUsage;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <ShieldAlert color={color.warningText} size={28} strokeWidth={2.5} />
          <Text style={styles.dialogTitle}>Review portion changes</Text>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>
              {usage.mealEntryCount === 0
                ? "No previous meal entries will change."
                : `These changes will update ${usage.mealEntryCount} previous meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(usage)}.`}
            </Text>
            {changes.map((change) => (
              <Text
                key={change}
                style={styles.dialogMessage}
              >{`• ${change}`}</Text>
            ))}
            <Text style={styles.dialogMessage}>
              This operation cannot be undone.
            </Text>
          </ScrollView>
          <View style={styles.actions}>
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
              variant="danger"
            >
              Confirm changes
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function _editInput(
  input: typeof PortionEditInput.Type
): Foods.EditFoodPortionInput {
  return {
    foodId: input.foodId,
    portionId: input.portionId,
    name: input.form.name,
    size: { amount: input.form.amount, unit: input.form.unit },
  };
}

function _changeForm({
  event,
  form,
}: {
  readonly event: ChangeForm;
  readonly form: PortionFormValues;
}): PortionFormValues {
  return {
    ...form,
    [event.field]:
      event.field === "unit"
        ? (measurementUnitByValue[event.value] ?? form.unit)
        : event.value,
  };
}

function _formIsValid({
  exceptPortionId,
  food,
  form,
}: {
  readonly exceptPortionId: Domain.FoodPortionId | undefined;
  readonly food: Domain.Food;
  readonly form: PortionFormValues;
}) {
  const normalizedName = form.name.trim().toLocaleLowerCase();
  const amount = Number(form.amount);
  return (
    normalizedName !== "" &&
    Number.isFinite(amount) &&
    amount > 0 &&
    !food.portions.some(
      (portion) =>
        portion.id !== exceptPortionId &&
        portion.name.trim().toLocaleLowerCase() === normalizedName
    )
  );
}

function _usageDateRange(usage: Foods.FoodPortionUsage) {
  if (usage.firstDateKey === undefined || usage.lastDateKey === undefined)
    return "";
  const first = formatShortDate({ dateKey: usage.firstDateKey });
  return usage.firstDateKey === usage.lastDateKey
    ? ` on ${first}`
    : ` between ${first} and ${formatShortDate({ dateKey: usage.lastDateKey })}`;
}

function _mutationErrorMessage(error: unknown) {
  if (Predicate.isTagged(error, "FoodPortionNameAlreadyExists")) {
    return "Use a name that is not already assigned to another portion.";
  }
  if (Predicate.isTagged(error, "UsedFoodPortionMutationNotAllowed")) {
    return "This portion is now used and cannot be removed.";
  }
  if (Predicate.isTagged(error, "IncompatibleFoodMeasurement")) {
    return "This unit cannot be applied to the food’s current measurement settings.";
  }
  if (Predicate.isTagged(error, "AppDefaultFoodEditNotAllowed")) {
    return "Pre-installed foods cannot be changed. Create a food copy first.";
  }
  return "Could not save this portion. Review the values and try again.";
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  pageContent: { gap: spacing.lg, paddingHorizontal: 0 },
  foodHeading: { gap: spacing.xs, paddingHorizontal: spacing.lg },
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
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stack: { gap: spacing.md },
  portionCardBody: { gap: spacing.md },
  metaText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { minWidth: 0, flex: 1 },
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
  dialogScroll: { flexGrow: 0 },
  dialogScrollContent: { gap: spacing.md },
  dialogTitle: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogMessage: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.medium,
    lineHeight: tokens.type.lineHeight.md,
  },
});
