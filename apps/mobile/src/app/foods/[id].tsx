import { FoodForm } from "@/components/nutrition/food-form";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { describeFoodChanges } from "@/lib/food-change-summary";
import { formatNumber, formatShortDate } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  FoodEditorEvents,
  FoodEditorMachine,
  foodEditorLoadFailedMessage,
} from "@/machines/food-editor-machine";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { FoodFormMachine } from "@mai/machines";
import { Domain, type Foods } from "@mai/nutrition";
import { Array, Option, Schema } from "effect";
import { Redirect, router, useFocusEffect } from "expo-router";
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
  Trash2,
} from "lucide-react-native";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, type ReactNode } from "react";

const FoodEditorRouteParams = Schema.Struct({
  id: Domain.FoodId,
  dateKey: Schema.optionalKey(Domain.DateKey),
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
  const [snapshot, send, machine] = useMachine(() =>
    MachineAtoms.make(FoodEditorMachine, { foodId })
  );
  useFocusEffect(
    useCallback(() => {
      send(FoodEditorEvents.Refresh());
    }, [send])
  );
  const { message } = snapshot.value;
  const editorState = snapshot.state.state;
  const foodForm = machine.child(FoodFormMachine.FoodFormChild);

  if (editorState.path === "Editor.Deleted")
    return (
      <Redirect
        href={{
          pathname: "/foods",
          params: dateKey === undefined ? {} : { dateKey },
        }}
      />
    );
  if (
    editorState.path === "Editor.Loading" ||
    (editorState.path === "Editor.Loaded" &&
      editorState.state.path === "Editor.Loaded.Deleting")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView
          message={
            editorState.path === "Editor.Loaded"
              ? "Deleting food"
              : "Loading food"
          }
        />
      </AppScreen>
    );
  }

  if (editorState.path === "Editor.LoadFailed") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={message ?? foodEditorLoadFailedMessage}
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(FoodEditorEvents.Retry());
          }}
        >
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  if (editorState.path === "Editor.Completed") {
    return (
      <WorkflowPage food={editorState.value.food} title="Food saved">
        <Notice message={message ?? "Food saved."} tone="success" />
        <Button
          icon={Save}
          onPress={() => {
            router.replace({
              pathname: "/foods",
              params: dateKey === undefined ? {} : { dateKey },
            });
          }}
        >
          Back to foods
        </Button>
      </WorkflowPage>
    );
  }

  const { food, foods, usage } = editorState.value;
  const step = editorState.state;

  if (step.path === "Editor.Loaded.CopyForm") {
    return (
      <FoodForm
        action="edit"
        disabled={false}
        feedback={message === null ? undefined : { message, tone: "danger" }}
        foodForm={foodForm}
        hasFailed={false}
        heading="Copy food"
        intro={
          <Notice
            message="This creates a separate food. The source food and previous meal entries will not change."
            tone="neutral"
          />
        }
        onBack={() => {
          send(FoodEditorEvents.BackToChoice());
        }}
        portionUsage={[]}
        showMassVolumeConversion={false}
        showPortions={false}
        submitLabel="Review copy"
      />
    );
  }

  if (
    step.path === "Editor.Loaded.EditFormWarning" ||
    step.path === "Editor.Loaded.EditForm" ||
    step.path === "Editor.Loaded.PreviewingEdit" ||
    step.path === "Editor.Loaded.ReviewingEdit" ||
    step.path === "Editor.Loaded.Editing"
  ) {
    const previewing = step.path === "Editor.Loaded.PreviewingEdit";
    const editing = step.path === "Editor.Loaded.Editing";
    const draft =
      step.path === "Editor.Loaded.EditFormWarning" ? null : step.value.draft;
    const changes = draft === null ? [] : describeFoodChanges({ draft, food });

    return (
      <>
        <FoodForm
          action="edit"
          disabled={previewing || editing}
          feedback={message === null ? undefined : { message, tone: "danger" }}
          foodForm={foodForm}
          hasFailed={false}
          heading="Edit food details"
          onBack={() => {
            send(FoodEditorEvents.BackToChoice());
          }}
          portionUsage={usage.portions}
          showMassVolumeConversion={false}
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
          onCancel={() => {
            send(FoodEditorEvents.BackToChoice());
          }}
          onContinue={() => {
            send(FoodEditorEvents.AcknowledgeEdit());
          }}
          usage={usage}
          visible={step.path === "Editor.Loaded.EditFormWarning"}
        />
        <EditReviewDialog
          changes={changes}
          loading={editing}
          onCancel={() => {
            send(FoodEditorEvents.BackToForm());
          }}
          onConfirm={() => {
            send(FoodEditorEvents.ConfirmEdit());
          }}
          usage={usage}
          visible={step.path === "Editor.Loaded.ReviewingEdit" || editing}
        />
      </>
    );
  }

  if (step.path === "Editor.Loaded.ChoosingAction") {
    return (
      <WorkflowPage food={food} title="Manage food">
        {food.origin === "app-default" ? (
          <SectionCard
            title="Nutrition"
            subtitle="Correct values for all past and future entries. Reset to catalog anytime."
          >
            <Button
              icon={Pencil}
              onPress={() => router.push(`/foods/${food.id}/nutrition`)}
            >
              Customize nutrition
            </Button>
          </SectionCard>
        ) : null}
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
          subtitle={
            food.massVolumeConversion === undefined
              ? "Define how a weight such as kilograms equals a volume such as liters, so prices and logged quantities can be converted."
              : `${formatNumber({ maximumFractionDigits: 2, value: food.massVolumeConversion.mass.amount })} ${food.massVolumeConversion.mass.unit} = ${formatNumber({ maximumFractionDigits: 2, value: food.massVolumeConversion.volume.amount })} ${food.massVolumeConversion.volume.unit}. This conversion is used for spending and weight estimates.`
          }
          title="Weight and volume conversion"
        >
          <Button
            icon={Ruler}
            onPress={() => {
              router.push(`/foods/${food.id}/conversion`);
            }}
          >
            Manage conversion
          </Button>
        </SectionCard>
        <SectionCard
          subtitle="Add a portion, change one everywhere, or create a new portion while keeping earlier entries unchanged."
          title="Manage portions"
        >
          {food.origin === "app-default" ? (
            <Notice
              message="To change catalog portions, create your own food copy."
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
              message="Use Customize nutrition above to correct nutrient values. Copy the food to change its name or reference amount."
              tone="warning"
            />
          ) : (
            <Button
              icon={Pencil}
              onPress={() => {
                send(FoodEditorEvents.ChooseEdit());
              }}
            >
              Edit food details
            </Button>
          )}
        </SectionCard>
        <SectionCard
          subtitle="Create a separate food from these values. Previous entries stay unchanged."
          title="Copy food"
        >
          <Button
            icon={Copy}
            onPress={() => {
              send(FoodEditorEvents.ChooseCopy());
            }}
          >
            Copy this food
          </Button>
        </SectionCard>
        {message === null ? null : <Notice message={message} tone="danger" />}
        {food.origin === "user" && usage.mealEntryCount === 0 ? (
          <Button
            icon={Trash2}
            variant="danger"
            onPress={() => {
              send(FoodEditorEvents.DeleteFood());
            }}
          >
            Delete food
          </Button>
        ) : null}
      </WorkflowPage>
    );
  }

  if (
    step.path === "Editor.Loaded.ReviewingCopy" ||
    step.path === "Editor.Loaded.Copying"
  ) {
    const { draft } = step.value;
    const duplicateCount = foods.filter(
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
        {message === null ? null : <Notice message={message} tone="danger" />}
        <BottomActions
          back={() => {
            send(FoodEditorEvents.BackToForm());
          }}
          confirm={() => {
            send(FoodEditorEvents.Apply());
          }}
          confirmLabel="Create food copy"
          loading={step.path === "Editor.Loaded.Copying"}
        />
      </WorkflowPage>
    );
  }

  return null;
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
      topSafeAreaColor={color.header}
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
