import { MeasurementUnitSelect } from "@/components/nutrition/measurement-unit-select";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field, NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatShortDate } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  FoodPortionsEvents,
  FoodPortionsLoaderEvents,
  FoodPortionsLoaderMachine,
  FoodPortionsMachine,
  FoodPortionsStates,
  type FoodPortionsData,
  type PortionFormField,
  type PortionFormValues,
} from "@/machines/food-portions-machine";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { Domain, Foods } from "@mai/nutrition";
import { Array, Option, Schema } from "effect";
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

const RouteParams = Schema.Struct({ id: Domain.FoodId });

export default function FoodPortionsRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodPortionsLoader foodId={params.value.id} />
  );
}

function FoodPortionsLoader({ foodId }: { readonly foodId: Domain.FoodId }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodPortionsLoaderMachine, { foodId })
  );
  const state = snapshot.state;

  if (state.path === "Loading") {
    return <PortionsLoading />;
  }
  if (state.path === "Failed") {
    return (
      <PortionsLoadFailure
        message={state.value.message}
        onRetry={() => {
          send(FoodPortionsLoaderEvents.Retry());
        }}
      />
    );
  }

  return <FoodPortionsScreen data={state.value.data} />;
}

function PortionsLoading() {
  return (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading portions" />
    </AppScreen>
  );
}

function PortionsLoadFailure({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <AppScreen contentStyle={styles.centered}>
      <Notice message={message} tone="danger" />
      <Button icon={RotateCcw} onPress={onRetry}>
        Try again
      </Button>
      <Button onPress={() => router.back()} variant="secondary">
        Back
      </Button>
    </AppScreen>
  );
}

function FoodPortionsScreen({ data }: { readonly data: FoodPortionsData }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodPortionsMachine, data)
  );
  const state = snapshot.state;

  if (state.path === "Reloading") {
    return <PortionsLoading />;
  }
  if (state.path === "ReloadFailed") {
    return (
      <PortionsLoadFailure
        message={state.value.message}
        onRetry={() => {
          send(FoodPortionsEvents.Retry());
        }}
      />
    );
  }

  const { food, form, message, messageTone, usage } = state.value;
  const selectedPortionId =
    state.state.path === "Loaded.Listing" ? null : state.state.value.portionId;
  const selectedPortion =
    selectedPortionId === null
      ? undefined
      : food.portions.find((portion) => portion.id === selectedPortionId);
  const selectedUsage =
    selectedPortion === undefined
      ? undefined
      : usage.portions.find(
          (candidate) => candidate.portionId === selectedPortion.id
        );

  if (FoodPortionsStates.matches(snapshot, "Loaded.Listing")) {
    return (
      <PortionPage food={food} title="Manage portions">
        <Notice
          message="Portions are managed separately from nutrition and other food details."
          tone="neutral"
        />
        {message === null ? null : (
          <Notice message={message} tone={messageTone} />
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
                        onPress={() => {
                          send(
                            FoodPortionsEvents.EditPortion({
                              portionId: portion.id,
                            })
                          );
                        }}
                        style={styles.action}
                        variant={isUsed ? "primary" : "secondary"}
                      >
                        {isUsed ? "Edit everywhere" : "Edit"}
                      </Button>
                      <Button
                        icon={isUsed ? CopyPlus : Trash2}
                        onPress={() => {
                          send(
                            isUsed
                              ? FoodPortionsEvents.CreateFromPortion({
                                  portionId: portion.id,
                                })
                              : FoodPortionsEvents.RemovePortion({
                                  portionId: portion.id,
                                })
                          );
                        }}
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
        <Button
          icon={Plus}
          onPress={() => {
            send(FoodPortionsEvents.Add());
          }}
        >
          Add a portion
        </Button>
      </PortionPage>
    );
  }

  const addingBlankPortion =
    FoodPortionsStates.matches(snapshot, "Loaded.Adding") ||
    (FoodPortionsStates.matches(snapshot, "Loaded.SavingNew") &&
      selectedPortionId === null);
  if (addingBlankPortion) {
    const saving = FoodPortionsStates.matches(snapshot, "Loaded.SavingNew");
    const formIsValid = _formIsValid({
      food,
      form,
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
          form={form}
          onChange={(field, value) => {
            send(FoodPortionsEvents.ChangeForm({ field, value }));
          }}
        />
        {message === null ? null : <Notice message={message} tone="danger" />}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={() => {
              send(FoodPortionsEvents.Cancel());
            }}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={() => {
              send(FoodPortionsEvents.Submit());
            }}
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
        <Button
          onPress={() => {
            send(FoodPortionsEvents.Back());
          }}
        >
          Back to portions
        </Button>
      </AppScreen>
    );
  }

  const isUsed = selectedUsage.mealEntryCount > 0;
  if (FoodPortionsStates.matches(snapshot, "Loaded.Removing")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message={`Removing ${selectedPortion.name}`} />
      </AppScreen>
    );
  }

  const isNew =
    FoodPortionsStates.matches(snapshot, "Loaded.CreatingFromPortion") ||
    FoodPortionsStates.matches(snapshot, "Loaded.SavingNew");
  if (isNew || FoodPortionsStates.matches(snapshot, "Loaded.Edit")) {
    const saving =
      FoodPortionsStates.matches(snapshot, "Loaded.SavingNew") ||
      FoodPortionsStates.matches(snapshot, "Loaded.Edit.Saving");
    const reviewing = FoodPortionsStates.matches(
      snapshot,
      "Loaded.Edit.Previewing"
    );
    const formIsValid = _formIsValid({
      food,
      form,
      exceptPortionId: isNew ? undefined : selectedPortion.id,
    });
    const changes: string[] = [];
    if (form.name.trim() !== selectedPortion.name) {
      changes.push(`Name: “${selectedPortion.name}” → “${form.name.trim()}”`);
    }
    if (
      Number(form.amount) !== selectedPortion.size.amount ||
      form.unit !== selectedPortion.size.unit
    ) {
      changes.push(
        `Size: ${selectedPortion.size.amount} ${selectedPortion.size.unit} → ${form.amount} ${form.unit}`
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
            form={form}
            onChange={(field, value) => {
              send(FoodPortionsEvents.ChangeForm({ field, value }));
            }}
          />
          {message === null ? null : <Notice message={message} tone="danger" />}
          <View style={styles.actions}>
            <Button
              disabled={saving || reviewing}
              onPress={() => {
                send(FoodPortionsEvents.Cancel());
              }}
              style={styles.action}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={!formIsValid}
              icon={Save}
              loading={saving || reviewing}
              onPress={() => {
                send(FoodPortionsEvents.Submit());
              }}
              style={styles.action}
            >
              {isNew ? "Add portion" : isUsed ? "Review changes" : "Save"}
            </Button>
          </View>
        </PortionPage>
        <ConfirmationDialog
          confirmLabel="Continue"
          message={`This portion is used in ${selectedUsage.mealEntryCount} meal ${selectedUsage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(selectedUsage)}. Any saved changes will apply to all of them.`}
          onCancel={() => {
            send(FoodPortionsEvents.Back());
          }}
          onConfirm={() => {
            send(FoodPortionsEvents.ConfirmChangeEverywhere());
          }}
          title="Change this portion everywhere?"
          visible={FoodPortionsStates.matches(snapshot, "Loaded.Edit.Warning")}
        />
        <ReviewDialog
          changes={changes}
          loading={FoodPortionsStates.matches(snapshot, "Loaded.Edit.Saving")}
          onCancel={() => {
            send(FoodPortionsEvents.Back());
          }}
          onConfirm={() => {
            send(FoodPortionsEvents.ConfirmChangeEverywhere());
          }}
          usage={selectedUsage}
          visible={
            FoodPortionsStates.matches(snapshot, "Loaded.Edit.Reviewing") ||
            FoodPortionsStates.matches(snapshot, "Loaded.Edit.Saving")
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
      topSafeAreaColor={color.header}
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
  readonly onChange: (field: PortionFormField, value: string) => void;
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogMessage: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.medium,
    lineHeight: tokens.type.lineHeight.md,
  },
});
