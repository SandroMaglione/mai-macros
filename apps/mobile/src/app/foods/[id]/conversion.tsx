import { MeasurementUnitSelect } from "@/components/nutrition/measurement-unit-select";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatNumber, formatShortDate } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-atoms";
import {
  conversionManagerMachine,
  ConversionEvents,
  ConversionForm,
  type ConversionValue,
  conversionFromForm,
} from "@/lib/conversion-manager-machine";
import {
  createMachineContext,
  MachineState,
} from "@typeonce/effect-machine-react";
import { useAtomSet, useAtomSuspense } from "@effect/atom-react";
import type { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Suspense } from "react";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { Domain, Foods, Measurements } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import {
  ChevronLeft,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react-native";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const RouteParams = Schema.Struct({ id: Domain.FoodId });

const ConversionManager = createMachineContext(
  MachineAtoms.factory(conversionManagerMachine)
);

export { ErrorBoundary } from "expo-router";

export default function FoodConversionRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodConversionScreen foodId={params.value.id} />
  );
}

function FoodConversionScreen({ foodId }: { readonly foodId: Domain.FoodId }) {
  return (
    <ConversionManager.Provider key={foodId} input={{ foodId }}>
      <Suspense
        fallback={
          <AppScreen contentStyle={styles.centered}>
            <LoadingView message="Loading conversion" />
          </AppScreen>
        }
      >
        <FoodConversionView />
      </Suspense>
    </ConversionManager.Provider>
  );
}

function FoodConversionView() {
  const machine = ConversionManager.useMachine();
  const send = useAtomSet(machine.send);
  return (
    <>
      <MachineState machine={machine} path="Loading">
        {() => (
          <AppScreen contentStyle={styles.centered}>
            <LoadingView message="Loading conversion" />
          </AppScreen>
        )}
      </MachineState>
      <MachineState machine={machine} path="LoadFailed">
        {() => (
          <AppScreen contentStyle={styles.centered}>
            <Notice
              message="Could not load this food conversion."
              tone="danger"
            />
            <Button
              icon={RotateCcw}
              onPress={() => send(ConversionEvents.retry())}
            >
              Try again
            </Button>
            <Button onPress={() => router.back()} variant="secondary">
              Back
            </Button>
          </AppScreen>
        )}
      </MachineState>
      <MachineState machine={machine} path="Loaded">
        {({ value }) => <FoodConversionEditor data={value} />}
      </MachineState>
    </>
  );
}

function FoodConversionEditor({
  data,
}: {
  readonly data: Machine.Value<typeof conversionManagerMachine, "Loaded">;
}) {
  const machine = ConversionManager.useMachine();
  const send = useAtomSet(machine.send);
  const saving = useAtomSuspense(
    AtomMachine.matches(machine, "Loaded.Saving")
  ).value;
  const previewing = useAtomSuspense(
    AtomMachine.matches(machine, "Loaded.Previewing")
  ).value;
  const reviewing = useAtomSuspense(
    AtomMachine.matches(machine, "Loaded.Reviewing")
  ).value;
  const { food, form, usage } = data;
  const busy = previewing || saving;
  const massBlank = form.massAmount.trim() === "";
  const volumeBlank = form.volumeAmount.trim() === "";
  const massAmount = Number(form.massAmount.replace(",", "."));
  const volumeAmount = Number(form.volumeAmount.replace(",", "."));
  const formIsValid =
    massBlank || volumeBlank
      ? massBlank && volumeBlank
      : Number.isFinite(massAmount) &&
        massAmount > 0 &&
        Number.isFinite(volumeAmount) &&
        volumeAmount > 0;
  const currentConversion = food.massVolumeConversion;
  const nextConversion = conversionFromForm(form);
  const hasChanges =
    currentConversion === undefined || nextConversion === undefined
      ? currentConversion !== nextConversion
      : currentConversion.mass.amount !== nextConversion.mass.amount ||
        currentConversion.mass.unit !== nextConversion.mass.unit ||
        currentConversion.volume.amount !== nextConversion.volume.amount ||
        currentConversion.volume.unit !== nextConversion.volume.unit;
  const conversionLabel = _conversionLabel(food.massVolumeConversion);

  return (
    <>
      <ConversionPage food={food}>
        <Notice
          message="Define one real weight-to-volume equivalence for this food. It will be used whenever logged quantities and prices use different measurement types."
          tone="neutral"
        />
        {usage.mealEntryCount === 0 ? null : (
          <Notice
            message={`Changing this conversion can recalculate ${usage.mealEntryCount} previous meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(usage)}.`}
            tone="warning"
          />
        )}
        <MachineState machine={machine} path="Loaded.Editing.Success">
          {({ value: { message } }) => (
            <Notice message={message} tone="success" />
          )}
        </MachineState>
        <MachineState machine={machine} path="Loaded.Editing.Failure">
          {({ value: { message } }) => (
            <Notice message={message} tone="danger" />
          )}
        </MachineState>
        <SectionCard
          subtitle={
            conversionLabel === null
              ? "No conversion has been defined yet."
              : `Current conversion: ${conversionLabel}`
          }
          title="Weight and volume conversion"
        >
          <View style={styles.stack}>
            <NumberField
              editable={!busy}
              label="Mass amount"
              onChangeText={(value) =>
                send(ConversionEvents.changeMassAmount({ value }))
              }
              placeholder="1.03"
              rightElement={
                <MeasurementUnitSelect
                  disabled={busy}
                  onSelect={(unit) => {
                    if (Measurements.isMassUnit(unit)) {
                      send(ConversionEvents.changeMassUnit({ unit }));
                    }
                  }}
                  selectedUnit={form.massUnit}
                  title="Mass unit"
                  units={["g", "kg", "oz", "lb"]}
                />
              }
              value={form.massAmount}
            />
            <NumberField
              editable={!busy}
              label="Equivalent volume"
              onChangeText={(value) =>
                send(ConversionEvents.changeVolumeAmount({ value }))
              }
              placeholder="1"
              rightElement={
                <MeasurementUnitSelect
                  disabled={busy}
                  onSelect={(unit) => {
                    if (Measurements.isVolumeUnit(unit)) {
                      send(ConversionEvents.changeVolumeUnit({ unit }));
                    }
                  }}
                  selectedUnit={form.volumeUnit}
                  title="Volume unit"
                  units={["ml", "l"]}
                />
              }
              value={form.volumeAmount}
            />
            <Text style={styles.helpText}>
              Example: for a density of 1.03 kg/L, enter 1.03 kg = 1 L.
            </Text>
          </View>
        </SectionCard>
        <Button
          disabled={busy || !formIsValid || !hasChanges}
          icon={Save}
          loading={busy}
          onPress={() => send(ConversionEvents.submit())}
        >
          Save conversion
        </Button>
        {food.massVolumeConversion === undefined ? null : (
          <Button
            disabled={busy}
            icon={Trash2}
            onPress={() => send(ConversionEvents.remove())}
            variant="danger"
          >
            Remove conversion
          </Button>
        )}
      </ConversionPage>
      <ReviewDialog
        food={food}
        form={form}
        loading={saving}
        onCancel={() => send(ConversionEvents.cancelReview())}
        onConfirm={() => send(ConversionEvents.confirm())}
        usage={usage}
        visible={reviewing || saving}
      />
    </>
  );
}

function ConversionPage({
  children,
  food,
}: {
  readonly children: React.ReactNode;
  readonly food: Domain.Food;
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
        title="Manage conversion"
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

function ReviewDialog({
  food,
  form,
  loading,
  onCancel,
  onConfirm,
  usage,
  visible,
}: {
  readonly food: Domain.Food;
  readonly form: ConversionForm;
  readonly loading: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly usage: Foods.FoodEditUsage;
  readonly visible: boolean;
}) {
  const previousLabel = _conversionLabel(food.massVolumeConversion);
  const nextLabel = _conversionLabel(conversionFromForm(form));
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <Pressable onPress={onCancel} style={styles.dialogBackdrop}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.dialogHeader}>
            <ShieldAlert
              color={color.warningText}
              size={26}
              strokeWidth={2.5}
            />
            <Text style={styles.dialogTitle}>Review conversion change</Text>
            <IconButton
              accessibilityLabel="Close review"
              icon={X}
              iconColor={color.textMuted}
              iconSize={20}
              onPress={onCancel}
              variant="ghost"
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>
              This will recalculate {usage.mealEntryCount} previous meal{" "}
              {usage.mealEntryCount === 1 ? "entry" : "entries"}
              {_usageDateRange(usage)}.
            </Text>
            <Text style={styles.dialogChange}>
              {previousLabel ?? "No conversion"} →{" "}
              {nextLabel ?? "No conversion"}
            </Text>
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
              Back
            </Button>
            <Button
              loading={loading}
              onPress={onConfirm}
              style={styles.action}
              variant="danger"
            >
              Confirm change
            </Button>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function _conversionLabel(conversion: ConversionValue | undefined) {
  return conversion === undefined
    ? null
    : `${formatNumber({ maximumFractionDigits: 3, value: conversion.mass.amount })} ${conversion.mass.unit} = ${formatNumber({ maximumFractionDigits: 3, value: conversion.volume.amount })} ${conversion.volume.unit}`;
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

const styles = StyleSheet.create({
  action: { minWidth: 0, flex: 1 },
  actions: { flexDirection: "row", gap: spacing.md },
  body: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxHeight: "88%",
    maxWidth: 480,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: color.warningBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: color.sheet,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  dialogChange: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  dialogHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dialogMessage: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  dialogScroll: { flexShrink: 1 },
  dialogScrollContent: { gap: spacing.lg },
  dialogTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.lg,
  },
  foodBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
  },
  foodHeading: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  foodName: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.semibold,
  },
  helpText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  pageContent: { gap: spacing.lg, paddingHorizontal: 0 },
  stack: { gap: spacing.md },
});
