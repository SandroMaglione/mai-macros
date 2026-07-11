import { FoodForm } from "@/components/nutrition/food-form";
import {
  AppHeader,
  AppScreen,
  Button,
  IconButton,
  LoadingView,
  Notice,
  SectionCard,
} from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { RuntimeClient } from "@/lib/runtime-client";
import { describeFoodChanges } from "@/lib/food-change-summary";
import { formatShortDate } from "@/lib/format";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent, FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Predicate, Schema } from "effect";
import { Redirect, router } from "expo-router";
import {
  CircleCheck,
  ChevronLeft,
  Copy,
  Pencil,
  Ruler,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react-native";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { Actor, createAsyncLogic, setup } from "xstate";

const FoodFormInput = Schema.Struct({
  name: Schema.String,
  brand: Schema.optionalKey(Schema.String),
  energyKcal: Schema.String,
  proteinGrams: Schema.String,
  carbsGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.optionalKey(Schema.String),
  sugarGrams: Schema.optionalKey(Schema.String),
  saturatedFatGrams: Schema.optionalKey(Schema.String),
  saltGrams: Schema.optionalKey(Schema.String),
  nutritionReference: Schema.Struct({
    amount: Schema.String,
    unit: Domain.MeasurementUnit,
  }),
  portions: Schema.Array(
    Schema.Struct({
      id: Schema.optionalKey(Domain.FoodPortionId),
      name: Schema.String,
      size: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MeasurementUnit,
      }),
    })
  ),
  massVolumeConversion: Schema.optionalKey(
    Schema.Struct({
      mass: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MassUnit,
      }),
      volume: Schema.Struct({
        amount: Schema.String,
        unit: Domain.VolumeUnit,
      }),
    })
  ),
});

const FoodEditorRouteParams = Schema.Struct({
  id: Domain.FoodId,
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const FoodFormActorSchema = Schema.declare<FoodFormMachine.FoodFormActorRef>(
  (value): value is FoodFormMachine.FoodFormActorRef =>
    value instanceof Actor && value.logic === FoodFormMachine.foodFormMachine,
  { expected: "FoodFormActor" }
);

const FoodEditorLoadOutput = Schema.Struct({
  food: Domain.Food,
  foods: Schema.Array(Domain.Food),
  usage: Foods.FoodEditUsage,
});

const FoodEditorContext = Schema.Struct({
  draft: Schema.NullOr(FoodFormInput),
  food: Schema.NullOr(Domain.Food),
  foods: Schema.Array(Domain.Food),
  foodFormActor: FoodFormActorSchema,
  foodId: Domain.FoodId,
  message: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(Foods.FoodEditUsage),
});

const SubmitFoodInput = Schema.Struct({ input: FoodFormInput });

const foodEditorMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(FoodEditorContext),
    events: {
      acknowledgeEdit: Schema.toStandardSchemaV1(EmptyEvent),
      apply: Schema.toStandardSchemaV1(EmptyEvent),
      backToChoice: Schema.toStandardSchemaV1(EmptyEvent),
      backToForm: Schema.toStandardSchemaV1(EmptyEvent),
      chooseCopy: Schema.toStandardSchemaV1(EmptyEvent),
      chooseEdit: Schema.toStandardSchemaV1(EmptyEvent),
      confirmEdit: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(SubmitFoodInput),
    },
    input: Schema.toStandardSchemaV1(Schema.Struct({ foodId: Domain.FoodId })),
  },
  actorSources: {
    foodForm: FoodFormMachine.foodFormMachine,
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({ foodId: Domain.FoodId })
        ),
        output: Schema.toStandardSchemaV1(FoodEditorLoadOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const food = yield* foods.get({ input });

            return {
              food,
              foods: [...(yield* foods.list())],
              usage: yield* foods.inspectEdit({ input }),
            };
          })
        ),
    }),
    previewEdit: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            draft: FoodFormInput,
            foodId: Domain.FoodId,
          })
        ),
        output: Schema.toStandardSchemaV1(Foods.FoodEditPreview),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return yield* foods.previewFoodDetailsEdit({
              input: {
                ..._foodDetailsFromDraft(input.draft),
                foodId: input.foodId,
              },
            });
          })
        ),
    }),
    copyFood: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            draft: FoodFormInput,
            sourceFoodId: Domain.FoodId,
          })
        ),
        output: Schema.toStandardSchemaV1(Schema.Struct({ food: Domain.Food })),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.copy({
              input: {
                ..._foodDetailsFromDraft(input.draft),
                sourceFoodId: input.sourceFoodId,
              },
            });
            return { food: result.food };
          })
        ),
    }),
    editFood: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({ draft: FoodFormInput, foodId: Domain.FoodId })
        ),
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
            const result = yield* foods.editFoodDetails({
              input: {
                ..._foodDetailsFromDraft(input.draft),
                foodId: input.foodId,
              },
            });
            return {
              food: result.food,
              revisedMealEntryCount: result.revisedMealEntryCount,
            };
          })
        ),
    }),
  },
  actions: {
    loadFoodForm: (params: {
      readonly actor: FoodFormMachine.FoodFormActorRef;
      readonly food: Domain.Food;
    }) => {
      params.actor.send({ type: "loadFood", food: params.food });
    },
  },
}).createMachine({
  context: ({ actorSources, input, spawn }) => ({
    draft: null,
    food: null,
    foods: [],
    foodFormActor: spawn(actorSources.foodForm, {
      id: "foodEditorForm",
      input: { initialFood: null, syncQuickInputFromFields: false },
    }),
    foodId: input.foodId,
    message: null,
    usage: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ foodId: context.foodId }),
        onDone: ({ event }) => ({
          target: "ChoosingAction",
          context: {
            food: event.output.food,
            foods: event.output.foods,
            usage: event.output.usage,
          },
        }),
        onError: {
          target: "LoadFailed",
          context: { message: "Could not load this food." },
        },
      },
    },
    LoadFailed: {
      on: { retry: { target: "Loading", context: { message: null } } },
    },
    ChoosingAction: {
      on: {
        chooseCopy: ({ actions, context }, enq) => {
          if (context.food === null) {
            return;
          }
          enq(actions.loadFoodForm, {
            actor: context.foodFormActor,
            food: context.food,
          });
          return { target: "CopyForm", context: { message: null } };
        },
        chooseEdit: ({ actions, context }, enq) => {
          if (context.food === null || context.food.origin === "app-default") {
            return;
          }
          enq(actions.loadFoodForm, {
            actor: context.foodFormActor,
            food: context.food,
          });
          return { target: "EditFormWarning", context: { message: null } };
        },
      },
    },
    EditFormWarning: {
      on: {
        backToChoice: { target: "ChoosingAction" },
        acknowledgeEdit: { target: "EditForm", context: { message: null } },
      },
    },
    CopyForm: {
      on: {
        backToChoice: { target: "ChoosingAction", context: { message: null } },
        submit: ({ event }) => ({
          target: "ReviewingCopy",
          context: { draft: event.input, message: null },
        }),
      },
    },
    EditForm: {
      on: {
        backToChoice: { target: "ChoosingAction", context: { message: null } },
        submit: ({ event }) => ({
          target: "PreviewingEdit",
          context: { draft: event.input, message: null },
        }),
      },
    },
    PreviewingEdit: {
      invoke: {
        src: "previewEdit",
        input: ({ context }) => {
          if (context.draft === null) {
            throw new Error("Expected an edit draft.");
          }
          return { draft: context.draft, foodId: context.foodId };
        },
        onDone: {
          target: "ReviewingEdit",
          context: { message: null },
        },
        onError: ({ event }) => ({
          target: "EditForm",
          context: { message: _foodMutationErrorMessage(event.error) },
        }),
      },
    },
    ReviewingCopy: {
      on: {
        backToForm: { target: "CopyForm" },
        apply: { target: "Copying" },
      },
    },
    ReviewingEdit: {
      on: {
        backToForm: { target: "EditForm" },
        confirmEdit: { target: "Editing" },
      },
    },
    Copying: {
      invoke: {
        src: "copyFood",
        input: ({ context }) => {
          if (context.draft === null) {
            throw new Error("Expected a copy draft.");
          }
          return { draft: context.draft, sourceFoodId: context.foodId };
        },
        onDone: ({ event }) => ({
          target: "Completed",
          context: {
            food: event.output.food,
            message: "Food copy created. Previous meal entries were unchanged.",
          },
        }),
        onError: ({ event }) => ({
          target: "ReviewingCopy",
          context: { message: _foodMutationErrorMessage(event.error) },
        }),
      },
    },
    Editing: {
      invoke: {
        src: "editFood",
        input: ({ context }) => {
          if (context.draft === null) {
            throw new Error("Expected an edit draft.");
          }
          return { draft: context.draft, foodId: context.foodId };
        },
        onDone: ({ event }) => ({
          target: "Completed",
          context: {
            food: event.output.food,
            message:
              event.output.revisedMealEntryCount === 0
                ? "Food updated. No previous meal entries changed."
                : `Food updated across ${event.output.revisedMealEntryCount} previous meal ${event.output.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
          },
        }),
        onError: ({ event }) => ({
          target: "EditForm",
          context: { message: _foodMutationErrorMessage(event.error) },
        }),
      },
    },
    Completed: {},
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
  const [snapshot, , actor] = useMachine(foodEditorMachine, {
    input: { foodId },
  });
  const food = snapshot.context.food;
  const usage = snapshot.context.usage;

  if (snapshot.matches("Loading")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading food" />
      </AppScreen>
    );
  }

  if (snapshot.matches("LoadFailed") || food === null || usage === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load this food."}
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

  if (snapshot.matches("CopyForm")) {
    return (
      <FoodForm
        action="edit"
        actor={snapshot.context.foodFormActor}
        disabled={false}
        feedback={
          snapshot.context.message === null
            ? undefined
            : { message: snapshot.context.message, tone: "danger" }
        }
        hasFailed={false}
        heading="Copy food"
        intro={
          <Notice
            message="This creates a separate food. The source food and previous meal entries will not change."
            tone="neutral"
          />
        }
        onBack={actor.trigger.backToChoice}
        portionUsage={[]}
        showPortions={false}
        submitLabel="Review copy"
      />
    );
  }

  if (
    snapshot.matches("EditFormWarning") ||
    snapshot.matches("EditForm") ||
    snapshot.matches("PreviewingEdit") ||
    snapshot.matches("ReviewingEdit") ||
    snapshot.matches("Editing")
  ) {
    const previewing = snapshot.matches("PreviewingEdit");
    const editing = snapshot.matches("Editing");
    const changes =
      snapshot.context.draft === null
        ? []
        : describeFoodChanges({ draft: snapshot.context.draft, food });

    return (
      <>
        <FoodForm
          action="edit"
          actor={snapshot.context.foodFormActor}
          disabled={previewing || editing}
          feedback={
            snapshot.context.message === null
              ? undefined
              : { message: snapshot.context.message, tone: "danger" }
          }
          hasFailed={false}
          heading="Edit food details"
          onBack={actor.trigger.backToChoice}
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
          onCancel={actor.trigger.backToChoice}
          onContinue={actor.trigger.acknowledgeEdit}
          usage={usage}
          visible={snapshot.matches("EditFormWarning")}
        />
        <EditReviewDialog
          changes={changes}
          loading={editing}
          onCancel={actor.trigger.backToForm}
          onConfirm={actor.trigger.confirmEdit}
          usage={usage}
          visible={snapshot.matches("ReviewingEdit") || editing}
        />
      </>
    );
  }

  if (snapshot.matches("ChoosingAction")) {
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
          subtitle="Create a separate food from these values. Previous entries stay unchanged."
          title="Copy food"
        >
          <Button icon={Copy} onPress={actor.trigger.chooseCopy}>
            Copy this food
          </Button>
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
            <Button icon={Pencil} onPress={actor.trigger.chooseEdit}>
              Edit food details
            </Button>
          )}
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
      </WorkflowPage>
    );
  }

  if (snapshot.matches("ReviewingCopy") || snapshot.matches("Copying")) {
    const draft = snapshot.context.draft;
    const duplicateCount =
      draft === null
        ? 0
        : snapshot.context.foods.filter(
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
        {snapshot.context.message === null ? null : (
          <Notice message={snapshot.context.message} tone="danger" />
        )}
        <BottomActions
          back={actor.trigger.backToForm}
          confirm={actor.trigger.apply}
          confirmLabel="Create food copy"
          loading={snapshot.matches("Copying")}
        />
      </WorkflowPage>
    );
  }

  return (
    <WorkflowPage food={food} title="Food saved">
      <Notice
        message={snapshot.context.message ?? "Food saved."}
        tone="success"
      />
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

function _foodDetailsFromDraft(draft: typeof FoodFormInput.Type) {
  const { portions: _portions, ...details } = draft;
  return details;
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
