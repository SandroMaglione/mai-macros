import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingOverlay } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useMachine, useMachineValue } from "@/hooks/use-machine";
import { BackupMachineAtoms } from "@/lib/backup-runtime-client";
import {
  AnalysisExportEvents,
  AnalysisExportMachine,
  BackupExportEvents,
  BackupExportMachine,
  BackupImportEvents,
  BackupImportMachine,
  CatalogExportEvents,
  CatalogExportMachine,
  CatalogImportEvents,
  CatalogImportMachine,
  CatalogImportStates,
} from "@/machines/backup-machine";
import { color, spacing, tokens } from "@/theme/tokens";
import { LocalDataResetMachine } from "@mai/machines";
import {
  FoodCatalogTransfer,
  LocalData as NutritionLocalData,
} from "@mai/nutrition";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { HashSet, Option } from "effect";
import { router } from "expo-router";
import {
  ChevronLeft,
  Download,
  Square,
  SquareCheckBig,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

const canResetProjection = AtomMachine.can(
  LocalDataResetMachine.LocalDataResetEvents.Reset()
);

export default function BackupScreen() {
  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
      >
        <AppHeader
          embedded
          eyebrow="Database"
          leading={
            <IconButton
              accessibilityLabel="Back"
              icon={ChevronLeft}
              onPress={() => {
                router.back();
              }}
              variant="ghost"
            />
          }
          shadow
          title="Backup"
        />

        <KeyboardAwareScrollView
          alwaysBounceVertical={false}
          bottomOffset={spacing.lg}
          contentContainerStyle={styles.settingsScrollContent}
          keyboardShouldPersistTaps="handled"
          style={styles.settingsScroll}
        >
          <ExportBackupSection />
          <AnalysisExportSection />
          <ImportBackupSection />
          <CatalogExportSection />
          <CatalogImportSection />
          <ResetDataSection />
        </KeyboardAwareScrollView>
      </AppScreen>
    </View>
  );
}

function AnalysisExportSection() {
  const [snapshot, send] = useMachine(() =>
    BackupMachineAtoms.make(AnalysisExportMachine)
  );
  const exporting = snapshot.state.path === "Exporting";
  return (
    <BackupSettingsSection divider title="Agent analysis">
      <View style={styles.sectionBody}>
        <Text style={styles.helperText}>
          Share your complete food diary, weight and events with an agent.
          Includes a queryable database, a reading guide and a restorable
          backup.
        </Text>
        <Button
          disabled={exporting}
          loading={exporting}
          icon={Download}
          onPress={() => send(AnalysisExportEvents.Export())}
        >
          Export for agent analysis
        </Button>
        {snapshot.state.path === "Failed" && (
          <Notice
            title="Export failed"
            message={snapshot.state.value.message}
            tone="danger"
          />
        )}
        {snapshot.state.path === "Success" && (
          <Notice message={snapshot.state.value.message} tone="success" />
        )}
      </View>
      <LoadingOverlay
        message="Preparing your analysis export"
        visible={exporting}
      />
    </BackupSettingsSection>
  );
}

function ExportBackupSection() {
  const [snapshot, send] = useMachine(() =>
    BackupMachineAtoms.make(BackupExportMachine)
  );
  const exporting = snapshot.state.path === "Exporting";
  return (
    <>
      <BackupSettingsSection divider={false} title="Export">
        <View style={styles.sectionBody}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!exporting}
            label="Name"
            placeholder="Mai backup"
            value={snapshot.value.backupName}
            onChangeText={(value) =>
              send(BackupExportEvents.ChangeBackupName({ backupName: value }))
            }
          />
          <Button
            disabled={exporting}
            icon={Download}
            loading={exporting}
            onPress={() => send(BackupExportEvents.ExportBackup())}
          >
            Export backup
          </Button>

          {snapshot.state.path === "Success" && (
            <Notice message={snapshot.state.value.message} tone="success" />
          )}

          {snapshot.state.path === "Failed" && (
            <Notice
              message={snapshot.state.value.message}
              title="Export failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting backup" visible={exporting} />
    </>
  );
}

function ImportBackupSection() {
  const [snapshot, send] = useMachine(() =>
    BackupMachineAtoms.make(BackupImportMachine)
  );
  const isImporting = snapshot.state.path === "ImportingFile";
  return (
    <>
      <BackupSettingsSection divider title="Import">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Import replaces the current data on this device.
          </Text>
          <Button
            disabled={isImporting}
            icon={Upload}
            loading={isImporting}
            onPress={() => send(BackupImportEvents.ImportFile())}
            variant="danger"
          >
            Choose backup file
          </Button>

          {snapshot.state.path === "Success" && (
            <Notice message={snapshot.state.value.message} tone="success" />
          )}

          {snapshot.state.path === "Failed" && (
            <Notice
              message={snapshot.state.value.message}
              title="Import failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Opening backup file" visible={isImporting} />
    </>
  );
}

function CatalogExportSection() {
  const [snapshot, send] = useMachine(() =>
    BackupMachineAtoms.make(CatalogExportMachine)
  );
  const isExporting = snapshot.state.path === "ExportingCatalog";
  return (
    <>
      <BackupSettingsSection divider title="Export catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isExporting}
            icon={Download}
            loading={isExporting}
            onPress={() => send(CatalogExportEvents.ExportCatalog())}
          >
            Export catalog file
          </Button>

          {snapshot.state.path === "Success" && (
            <Notice message={snapshot.state.value.message} tone="success" />
          )}

          {snapshot.state.path === "Failed" && (
            <Notice
              message={snapshot.state.value.message}
              title="Export catalog failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting catalog" visible={isExporting} />
    </>
  );
}

function CatalogImportSection() {
  const [snapshot, send] = useMachine(() =>
    BackupMachineAtoms.make(CatalogImportMachine)
  );
  const isImporting = CatalogImportStates.matches(
    snapshot,
    "CatalogPreview.ImportingCatalog"
  );
  const isPreviewing = snapshot.state.path === "ImportingPreview";
  const isPreviewReady =
    CatalogImportStates.matches(snapshot, "CatalogPreview.SelectFoods") ||
    isImporting;
  const isBusy = isImporting || isPreviewing;
  const preview = Option.filter(
    CatalogImportStates.get(snapshot, "CatalogPreview"),
    () => isPreviewReady
  );
  const importSuccess = CatalogImportStates.get(
    snapshot,
    "CatalogPreview.Success"
  );
  const importFailure = CatalogImportStates.get(
    snapshot,
    "CatalogPreview.Failed"
  );
  return (
    <>
      <BackupSettingsSection divider title="Import catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isBusy}
            icon={Upload}
            loading={isPreviewing}
            onPress={() =>
              send(CatalogImportEvents.OpenPreviewCatalogImportFile())
            }
          >
            Choose catalog file
          </Button>

          {Option.isSome(importSuccess) && (
            <Notice message={importSuccess.value.message} tone="success" />
          )}

          {Option.isSome(importFailure) && (
            <Notice
              message={importFailure.value.message}
              title="Import catalog failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      {Option.isSome(preview) && (
        <BackupSettingsSection divider title="Preview">
          <View style={styles.sectionBody}>
            <View style={styles.catalogMetricRow}>
              <Text style={styles.catalogMetricText}>
                {preview.value.previewCandidates.length} candidates
              </Text>
              <Text style={styles.catalogMetricText}>
                {HashSet.size(preview.value.selectedFoodIds)} selected
              </Text>
            </View>

            <View style={styles.catalogCandidateList}>
              {preview.value.previewCandidates.map(
                (candidate: FoodCatalogTransfer.FoodCatalogImportCandidate) => (
                  <CatalogCandidateRow
                    key={candidate.food.id}
                    candidate={candidate}
                    disabled={isBusy}
                    selected={HashSet.has(
                      preview.value.selectedFoodIds,
                      candidate.food.id
                    )}
                    onToggle={() =>
                      send(
                        CatalogImportEvents.ToggleCatalogFood({
                          foodId: candidate.food.id,
                        })
                      )
                    }
                  />
                )
              )}
            </View>

            <Button
              icon={Upload}
              loading={isImporting}
              onPress={() =>
                send(CatalogImportEvents.ImportSelectedCatalogFoods())
              }
              disabled={
                HashSet.isEmpty(preview.value.selectedFoodIds) || isBusy
              }
            >
              Import selected
            </Button>
          </View>
        </BackupSettingsSection>
      )}

      <LoadingOverlay
        message={isImporting ? "Importing catalog" : "Opening catalog file"}
        visible={isBusy}
      />
    </>
  );
}

function CatalogCandidateRow({
  candidate,
  disabled,
  onToggle,
  selected,
}: {
  readonly candidate: FoodCatalogTransfer.FoodCatalogImportCandidate;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly selected: boolean;
}) {
  const selectable = candidate.selection.selectable;
  const isDisabled = disabled || !selectable;
  const CheckboxIcon = selected ? SquareCheckBig : Square;

  return (
    <Pressable
      accessibilityLabel={candidate.food.name}
      accessibilityRole="checkbox"
      accessibilityState={{
        checked: selected,
        disabled: isDisabled,
      }}
      disabled={isDisabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.catalogCandidate,
        selected ? styles.catalogCandidateSelected : null,
        isDisabled ? styles.catalogCandidateDisabled : null,
        pressed && !isDisabled ? styles.pressed : null,
      ]}
    >
      <CheckboxIcon
        color={selected ? color.primary : color.textSubtle}
        size={22}
        strokeWidth={2.8}
      />
      <View style={styles.catalogCandidateContent}>
        <Text numberOfLines={1} style={styles.catalogCandidateName}>
          {candidate.food.name}
        </Text>
        {candidate.food.brand === undefined ? null : (
          <Text numberOfLines={1} style={styles.catalogCandidateBrand}>
            {candidate.food.brand}
          </Text>
        )}
        <View style={styles.catalogBadgeRow}>
          <CatalogBadge
            label={CatalogCandidateStatusLabel[candidate.status]}
            tone={CatalogCandidateStatusTone[candidate.status]}
          />
          {candidate.nameStatus === "same-name-local" ? (
            <CatalogBadge
              label={
                candidate.sameNameLocalFoodIds.length === 1
                  ? "Name conflict"
                  : `${candidate.sameNameLocalFoodIds.length} name conflicts`
              }
              tone="warning"
            />
          ) : (
            <CatalogBadge label="Unique name" tone="neutral" />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function CatalogBadge({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: "danger" | "neutral" | "success" | "warning";
}) {
  return (
    <View style={[styles.catalogBadge, catalogBadgeToneStyles[tone]]}>
      <Text style={[styles.catalogBadgeText, catalogBadgeTextStyles[tone]]}>
        {label}
      </Text>
    </View>
  );
}

function ResetDataSection() {
  const [snapshot, send, machine] = useMachine(() =>
    BackupMachineAtoms.make(LocalDataResetMachine.LocalDataResetMachine)
  );
  const canReset = useMachineValue(canResetProjection(machine));
  const isIdle = snapshot.state.path === "Idle";
  const confirming = Option.filter(
    LocalDataResetMachine.LocalDataResetStates.get(snapshot, "Confirming"),
    () =>
      LocalDataResetMachine.LocalDataResetStates.matches(
        snapshot,
        "Confirming.Prompting"
      )
  );
  const resetFailure = LocalDataResetMachine.LocalDataResetStates.get(
    snapshot,
    "Confirming.Prompting.Failed"
  );
  const isResetting = LocalDataResetMachine.LocalDataResetStates.matches(
    snapshot,
    "Confirming.Resetting"
  );
  const resetDisabled = isResetting;
  return (
    <>
      <BackupSettingsSection divider title="Reset">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Delete every plan, food, daily log, meal entry, and recorded event
            on this device.
          </Text>

          {isIdle ? (
            <Button
              disabled={resetDisabled}
              icon={Trash2}
              onPress={() =>
                send(LocalDataResetMachine.LocalDataResetEvents.Begin())
              }
              variant="danger"
            >
              Delete everything
            </Button>
          ) : null}

          {Option.isSome(confirming) ? (
            <View style={styles.sectionBody}>
              <Text style={styles.confirmationText}>
                Type{" "}
                <Text style={styles.confirmationPhrase}>
                  {NutritionLocalData.LocalDataResetConfirmationText}
                </Text>{" "}
                to confirm.
              </Text>
              <Field
                autoCapitalize="none"
                autoCorrect={false}
                editable={!resetDisabled}
                label="Confirmation"
                placeholder={NutritionLocalData.LocalDataResetConfirmationText}
                value={confirming.value.confirmationText}
                onChangeText={(confirmationText) =>
                  send(
                    LocalDataResetMachine.LocalDataResetEvents.ChangeConfirmationText(
                      { confirmationText }
                    )
                  )
                }
              />
              <View style={styles.inlineActions}>
                <Button
                  disabled={resetDisabled}
                  icon={X}
                  onPress={() =>
                    send(LocalDataResetMachine.LocalDataResetEvents.Cancel())
                  }
                  style={styles.inlineAction}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  disabled={resetDisabled || !canReset}
                  icon={Trash2}
                  onPress={() =>
                    send(LocalDataResetMachine.LocalDataResetEvents.Reset())
                  }
                  style={styles.inlineAction}
                  variant="danger"
                >
                  Delete data
                </Button>
              </View>

              {Option.isSome(resetFailure) && (
                <Text style={styles.resetErrorText}>
                  {resetFailure.value.message}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Deleting local data" visible={isResetting} />
    </>
  );
}

function BackupSettingsSection({
  children,
  divider,
  title,
}: {
  readonly children: ReactNode;
  readonly divider: boolean;
  readonly title: string;
}) {
  return (
    <View
      style={[
        styles.settingsSection,
        divider ? null : styles.settingsSectionWithoutDivider,
      ]}
    >
      <Text style={styles.settingsSectionTitle}>{title}</Text>
      <SectionCard style={styles.card}>{children}</SectionCard>
    </View>
  );
}

const CatalogCandidateStatusLabel: Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  string
> = {
  "already-present": "Already present",
  "id-conflict": "ID conflict",
  new: "New",
};

const CatalogCandidateStatusTone: Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  "danger" | "neutral" | "success" | "warning"
> = {
  "already-present": "neutral",
  "id-conflict": "danger",
  new: "success",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingBottom: 0,
  },
  card: {
    backgroundColor: color.surface,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsScrollContent: {
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  settingsSection: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.xl,
  },
  settingsSectionWithoutDivider: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  settingsSectionTitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  sectionBody: {
    gap: spacing.md,
  },
  helperText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
  },
  catalogMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catalogMetricText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  catalogCandidateList: {
    gap: spacing.sm,
  },
  catalogCandidate: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 6,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  catalogCandidateSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  catalogCandidateDisabled: {
    opacity: 0.62,
  },
  catalogCandidateContent: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  catalogCandidateName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  catalogCandidateBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  catalogBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  catalogBadge: {
    minHeight: 24,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  catalogBadgeText: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inlineAction: {
    flex: 1,
  },
  confirmationText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  confirmationPhrase: {
    color: color.dangerText,
    fontWeight: tokens.type.weight.semibold,
  },
  resetErrorText: {
    color: color.dangerText,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  warningText: {
    color: color.dangerText,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  pressed: {
    opacity: 0.86,
  },
});

const catalogBadgeToneStyles = StyleSheet.create({
  danger: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  neutral: {
    borderColor: color.divider,
    backgroundColor: color.statusNeutralSoft,
  },
  success: {
    borderColor: color.successBorder,
    backgroundColor: color.successBg,
  },
  warning: {
    borderColor: color.warningBorder,
    backgroundColor: color.warningBg,
  },
});

const catalogBadgeTextStyles = StyleSheet.create({
  danger: {
    color: color.dangerText,
  },
  neutral: {
    color: color.textMuted,
  },
  success: {
    color: color.successText,
  },
  warning: {
    color: color.warningText,
  },
});
