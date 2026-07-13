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
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Predicate, Schema } from "effect";
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
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

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

const LoadOutput = Schema.Struct({
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
});

const Context = Schema.Struct({
  food: Schema.NullOr(Domain.Food),
  foodId: Domain.FoodId,
  form: PortionFormValues,
  message: Schema.NullOr(Schema.String),
  messageTone: Schema.Literals(["danger", "success"]),
  selectedPortionId: Schema.NullOr(Domain.FoodPortionId),
  usage: Schema.NullOr(Foods.FoodEditUsage),
});

const PortionIdEvent = Schema.Struct({ portionId: Domain.FoodPortionId });
const ChangeFormEvent = Schema.Struct({
  field: Schema.Literals(["amount", "name", "unit"]),
  value: Schema.String,
});
const PortionMutationInput = Schema.Struct({
  foodId: Domain.FoodId,
  form: PortionFormValues,
});
const PortionEditInput = Schema.Struct({
  foodId: Domain.FoodId,
  form: PortionFormValues,
  portionId: Domain.FoodPortionId,
});
const PortionRemoveInput = Schema.Struct({
  foodId: Domain.FoodId,
  portionId: Domain.FoodPortionId,
});

const portionManagerMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(Context),
    events: {
      add: Schema.toStandardSchemaV1(EmptyEvent),
      back: Schema.toStandardSchemaV1(EmptyEvent),
      cancel: Schema.toStandardSchemaV1(EmptyEvent),
      changeForm: Schema.toStandardSchemaV1(ChangeFormEvent),
      confirmChangeEverywhere: Schema.toStandardSchemaV1(EmptyEvent),
      createFromPortion: Schema.toStandardSchemaV1(PortionIdEvent),
      editPortion: Schema.toStandardSchemaV1(PortionIdEvent),
      removePortion: Schema.toStandardSchemaV1(PortionIdEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(Schema.Struct({ foodId: Domain.FoodId })),
  },
  actorSources: {
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({ foodId: Domain.FoodId })
        ),
        output: Schema.toStandardSchemaV1(LoadOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return {
              food: yield* foods.get({ input }),
              usage: yield* foods.inspectEdit({ input }),
            };
          })
        ),
    }),
    addPortion: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PortionMutationInput),
        output: Schema.toStandardSchemaV1(Schema.Struct({ food: Domain.Food })),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.addFoodPortion({
              input: {
                foodId: input.foodId,
                name: input.form.name,
                size: {
                  amount: input.form.amount,
                  unit: input.form.unit,
                },
              },
            });
            return { food: result.food };
          })
        ),
    }),
    previewEdit: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PortionEditInput),
        output: Schema.toStandardSchemaV1(Foods.FoodPortionEditPreview),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return yield* foods.previewFoodPortionEdit({
              input: _editInput(input),
            });
          })
        ),
    }),
    editPortion: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PortionEditInput),
        output: Schema.toStandardSchemaV1(
          Schema.Struct({
            food: Domain.Food,
            revisedMealEntryCount: Schema.Number,
          })
        ),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.editFoodPortionEverywhere({
              input: _editInput(input),
            });
            return {
              food: result.food,
              revisedMealEntryCount: result.revisedMealEntryCount,
            };
          })
        ),
    }),
    removePortion: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PortionRemoveInput),
        output: Schema.toStandardSchemaV1(Schema.Struct({ food: Domain.Food })),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.removeUnusedFoodPortion({ input });
            return { food: result.food };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    food: null,
    foodId: input.foodId,
    form: { amount: "", name: "", unit: "g" },
    message: null,
    messageTone: "success",
    selectedPortionId: null,
    usage: null,
  }),
  initial: "Loading",
  on: {
    changeForm: ({ context, event }) => ({
      context: {
        form: {
          ...context.form,
          [event.field]:
            event.field === "unit"
              ? (measurementUnitByValue[event.value] ?? context.form.unit)
              : event.value,
        },
      },
    }),
  },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ foodId: context.foodId }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: {
            food: event.output.food,
            selectedPortionId: null,
            usage: event.output.usage,
          },
        }),
        onError: {
          target: "LoadFailed",
          context: { message: "Could not load the portions for this food." },
        },
      },
    },
    LoadFailed: {
      on: { retry: { target: "Loading", context: { message: null } } },
    },
    Listing: {
      on: {
        add: {
          target: "Adding",
          context: {
            form: { amount: "", name: "", unit: "g" },
            message: null,
            selectedPortionId: null,
          },
        },
        createFromPortion: ({ context, event }) => {
          const portion = context.food?.portions.find(
            (candidate) => candidate.id === event.portionId
          );
          if (portion === undefined) return;
          return {
            target: "CreatingFromPortion",
            context: {
              form: {
                amount: `${portion.size.amount}`,
                name: `${portion.name} copy`,
                unit: portion.size.unit,
              },
              message: null,
              selectedPortionId: portion.id,
            },
          };
        },
        editPortion: ({ context, event }) => {
          const portion = context.food?.portions.find(
            (candidate) => candidate.id === event.portionId
          );
          const portionUsage = context.usage?.portions.find(
            (candidate) => candidate.portionId === event.portionId
          );
          if (portion === undefined || portionUsage === undefined) return;
          return {
            target: portionUsage.mealEntryCount > 0 ? "EditWarning" : "Editing",
            context: {
              form: {
                amount: `${portion.size.amount}`,
                name: portion.name,
                unit: portion.size.unit,
              },
              message: null,
              selectedPortionId: portion.id,
            },
          };
        },
        removePortion: ({ context, event }) => {
          const portion = context.food?.portions.find(
            (candidate) => candidate.id === event.portionId
          );
          const portionUsage = context.usage?.portions.find(
            (candidate) => candidate.portionId === event.portionId
          );
          if (
            portion === undefined ||
            portionUsage === undefined ||
            portionUsage.mealEntryCount > 0
          ) {
            return;
          }
          return {
            target: "Removing",
            context: {
              form: {
                amount: `${portion.size.amount}`,
                name: portion.name,
                unit: portion.size.unit,
              },
              message: null,
              selectedPortionId: portion.id,
            },
          };
        },
      },
    },
    EditWarning: {
      on: {
        back: { target: "Listing" },
        confirmChangeEverywhere: { target: "Editing" },
      },
    },
    Adding: {
      on: {
        cancel: { target: "Listing", context: { message: null } },
        submit: { target: "SavingNew" },
      },
    },
    CreatingFromPortion: {
      on: {
        cancel: { target: "Listing", context: { message: null } },
        submit: { target: "SavingNew" },
      },
    },
    SavingNew: {
      invoke: {
        src: "addPortion",
        input: ({ context }) => ({
          foodId: context.foodId,
          form: context.form,
        }),
        onDone: {
          target: "Loading",
          context: {
            message: "Portion added. Previous entries were unchanged.",
            messageTone: "success",
          },
        },
        onError: ({ event }) => ({
          target: "Adding",
          context: { message: _mutationErrorMessage(event.error) },
        }),
      },
    },
    Editing: {
      on: {
        cancel: { target: "Listing", context: { message: null } },
        submit: ({ context }) => {
          const portionUsage = context.usage?.portions.find(
            (candidate) => candidate.portionId === context.selectedPortionId
          );
          return {
            target:
              (portionUsage?.mealEntryCount ?? 0) > 0
                ? "PreviewingEdit"
                : "SavingEdit",
          };
        },
      },
    },
    PreviewingEdit: {
      invoke: {
        src: "previewEdit",
        input: ({ context }) => _editActorInput(context),
        onDone: { target: "ReviewingEdit", context: { message: null } },
        onError: ({ event }) => ({
          target: "Editing",
          context: { message: _mutationErrorMessage(event.error) },
        }),
      },
    },
    ReviewingEdit: {
      on: {
        back: { target: "Editing" },
        confirmChangeEverywhere: { target: "SavingEdit" },
      },
    },
    SavingEdit: {
      invoke: {
        src: "editPortion",
        input: ({ context }) => _editActorInput(context),
        onDone: ({ event }) => ({
          target: "Loading",
          context: {
            message:
              event.output.revisedMealEntryCount === 0
                ? "Unused portion updated. No previous entry changed."
                : `Portion updated across ${event.output.revisedMealEntryCount} previous meal ${event.output.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
            messageTone: "success",
          },
        }),
        onError: ({ event }) => ({
          target: "Editing",
          context: { message: _mutationErrorMessage(event.error) },
        }),
      },
    },
    Removing: {
      invoke: {
        src: "removePortion",
        input: ({ context }) => {
          if (context.selectedPortionId === null) {
            throw new Error("Expected a selected portion.");
          }
          return {
            foodId: context.foodId,
            portionId: context.selectedPortionId,
          };
        },
        onDone: {
          target: "Loading",
          context: {
            message: "Unused portion removed.",
            messageTone: "success",
          },
        },
        onError: ({ event }) => ({
          target: "Listing",
          context: {
            message: _mutationErrorMessage(event.error),
            messageTone: "danger",
          },
        }),
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
  const [snapshot, , actor] = useMachine(portionManagerMachine, {
    input: { foodId },
  });
  const { food, usage } = snapshot.context;

  if (snapshot.matches("Loading")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading portions" />
      </AppScreen>
    );
  }
  if (snapshot.matches("LoadFailed") || food === null || usage === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load portions."}
          tone="danger"
        />
        <Button icon={RotateCcw} onPress={actor.trigger.retry}>
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  const selectedPortion =
    snapshot.context.selectedPortionId === null
      ? undefined
      : food.portions.find(
          (portion) => portion.id === snapshot.context.selectedPortionId
        );
  const selectedUsage =
    selectedPortion === undefined
      ? undefined
      : usage.portions.find(
          (candidate) => candidate.portionId === selectedPortion.id
        );

  if (snapshot.matches("Listing")) {
    return (
      <PortionPage food={food} title="Manage portions">
        <Notice
          message="Portions are managed separately from nutrition and other food details."
          tone="neutral"
        />
        {snapshot.context.message === null ? null : (
          <Notice
            message={snapshot.context.message}
            tone={snapshot.context.messageTone}
          />
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
                          actor.send({
                            type: "editPortion",
                            portionId: portion.id,
                          })
                        }
                        style={styles.action}
                        variant={isUsed ? "primary" : "secondary"}
                      >
                        {isUsed ? "Edit everywhere" : "Edit"}
                      </Button>
                      <Button
                        icon={isUsed ? CopyPlus : Trash2}
                        onPress={() =>
                          actor.send({
                            type: isUsed
                              ? "createFromPortion"
                              : "removePortion",
                            portionId: portion.id,
                          })
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
        <Button icon={Plus} onPress={actor.trigger.add}>
          Add a portion
        </Button>
      </PortionPage>
    );
  }

  const addingBlankPortion =
    snapshot.matches("Adding") ||
    (snapshot.matches("SavingNew") &&
      snapshot.context.selectedPortionId === null);
  if (addingBlankPortion) {
    const saving = snapshot.matches("SavingNew");
    const formIsValid = _formIsValid({
      food,
      form: snapshot.context.form,
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
          form={snapshot.context.form}
          onChange={(field, value) =>
            actor.send({ type: "changeForm", field, value })
          }
        />
        {snapshot.context.message === null ? null : (
          <Notice message={snapshot.context.message} tone="danger" />
        )}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={actor.trigger.cancel}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={actor.trigger.submit}
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
        <Button onPress={actor.trigger.back}>Back to portions</Button>
      </AppScreen>
    );
  }

  const isUsed = selectedUsage.mealEntryCount > 0;
  if (snapshot.matches("Removing")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message={`Removing ${selectedPortion.name}`} />
      </AppScreen>
    );
  }

  const isNew =
    snapshot.matches("CreatingFromPortion") || snapshot.matches("SavingNew");
  if (
    isNew ||
    snapshot.matches("EditWarning") ||
    snapshot.matches("Editing") ||
    snapshot.matches("PreviewingEdit") ||
    snapshot.matches("ReviewingEdit") ||
    snapshot.matches("SavingEdit")
  ) {
    const saving =
      snapshot.matches("SavingNew") || snapshot.matches("SavingEdit");
    const reviewing = snapshot.matches("PreviewingEdit");
    const formIsValid = _formIsValid({
      food,
      form: snapshot.context.form,
      exceptPortionId: isNew ? undefined : selectedPortion.id,
    });
    const changes: string[] = [];
    if (snapshot.context.form.name.trim() !== selectedPortion.name) {
      changes.push(
        `Name: “${selectedPortion.name}” → “${snapshot.context.form.name.trim()}”`
      );
    }
    if (
      Number(snapshot.context.form.amount) !== selectedPortion.size.amount ||
      snapshot.context.form.unit !== selectedPortion.size.unit
    ) {
      changes.push(
        `Size: ${selectedPortion.size.amount} ${selectedPortion.size.unit} → ${snapshot.context.form.amount} ${snapshot.context.form.unit}`
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
            form={snapshot.context.form}
            onChange={(field, value) =>
              actor.send({ type: "changeForm", field, value })
            }
          />
          {snapshot.context.message === null ? null : (
            <Notice message={snapshot.context.message} tone="danger" />
          )}
          <View style={styles.actions}>
            <Button
              disabled={saving || reviewing}
              onPress={actor.trigger.cancel}
              style={styles.action}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={!formIsValid}
              icon={Save}
              loading={saving || reviewing}
              onPress={actor.trigger.submit}
              style={styles.action}
            >
              {isNew ? "Add portion" : isUsed ? "Review changes" : "Save"}
            </Button>
          </View>
        </PortionPage>
        <ConfirmationDialog
          confirmLabel="Continue"
          message={`This portion is used in ${selectedUsage.mealEntryCount} meal ${selectedUsage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(selectedUsage)}. Any saved changes will apply to all of them.`}
          onCancel={actor.trigger.back}
          onConfirm={actor.trigger.confirmChangeEverywhere}
          title="Change this portion everywhere?"
          visible={snapshot.matches("EditWarning")}
        />
        <ReviewDialog
          changes={changes}
          loading={snapshot.matches("SavingEdit")}
          onCancel={actor.trigger.back}
          onConfirm={actor.trigger.confirmChangeEverywhere}
          usage={selectedUsage}
          visible={
            snapshot.matches("ReviewingEdit") || snapshot.matches("SavingEdit")
          }
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

function _editActorInput(
  context: typeof Context.Type
): typeof PortionEditInput.Type {
  if (context.selectedPortionId === null) {
    throw new Error("Expected a selected portion.");
  }
  return {
    foodId: context.foodId,
    form: context.form,
    portionId: context.selectedPortionId,
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
