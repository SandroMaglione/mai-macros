import {
  AppHeader,
  AppScreen,
  Button,
  Field,
  IconButton,
  LoadingOverlay,
  Notice,
  PagerTabs,
  SectionCard,
  TextArea,
} from "@/components/ui";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { LocalDataResetMachine } from "@mai/machines";
import {
  Backup,
  FoodCatalogTransfer,
  LocalData as NutritionLocalData,
} from "@mai/nutrition";
import { FoodCatalogShare, QrCode as QrCodeService } from "@mai/services";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, DateTime, Effect } from "effect";
import { router } from "expo-router";
import {
  ChevronLeft,
  Download,
  Eye,
  QrCode,
  Share2,
  Square,
  SquareCheckBig,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type BackupRouteEvent =
  | {
      readonly index: BackupTabIndex;
      readonly type: "selectTab";
    }
  | {
      readonly backupName: string;
      readonly type: "changeBackupName";
    }
  | {
      readonly json: string;
      readonly type: "changeImportJson";
    }
  | {
      readonly type: "export";
    }
  | {
      readonly type: "import";
    };

type BackupTabIndex = 0 | 1 | 2 | 3;

type FoodCatalogImportCandidate =
  FoodCatalogTransfer.FoodCatalogImportCandidate;

type FoodCatalogFoodId = FoodCatalogImportCandidate["food"]["id"];

type MobileBackupExportResult = {
  readonly fileName: string;
  readonly json: string;
  readonly message: string;
};

type MobileBackupImportResult = {
  readonly message: string;
};

type CatalogTransferRouteEvent =
  | {
      readonly type: "changeCatalogImportText";
      readonly text: string;
    }
  | {
      readonly type: "exportCatalog";
    }
  | {
      readonly type: "previewCatalogImport";
    }
  | {
      readonly foodId: FoodCatalogFoodId;
      readonly type: "toggleCatalogFood";
    }
  | {
      readonly type: "importSelectedCatalogFoods";
    }
  | {
      readonly type: "shareCatalogText";
    };

type MobileCatalogQrResult =
  | {
      readonly byteLength: number;
      readonly dataUrl: string;
      readonly maxBytes: number;
      readonly status: "ready";
    }
  | {
      readonly byteLength: number;
      readonly maxBytes: number;
      readonly status: "too-large";
    }
  | {
      readonly byteLength: number;
      readonly maxBytes: number;
      readonly reason: string;
      readonly status: "unavailable";
    };

type MobileCatalogExportResult = {
  readonly foodCount: number;
  readonly message: string;
  readonly qr: MobileCatalogQrResult;
  readonly shareText: string;
};

type MobileCatalogPreviewResult = {
  readonly candidates: readonly FoodCatalogImportCandidate[];
  readonly message: string;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
};

type MobileCatalogImportResult = {
  readonly message: string;
};

type MobileCatalogShareResult = {
  readonly message: string;
};

const backupRouteMachine = setup({
  types: {
    context: {} as {
      readonly activeTab: BackupTabIndex;
      readonly backupName: string;
      readonly errorMessage: string | null;
      readonly exportedFileName: string | null;
      readonly exportedJson: string;
      readonly importJson: string;
      readonly successMessage: string | null;
    },
    events: {} as BackupRouteEvent,
  },
  actors: {
    exportBackup: fromPromise<MobileBackupExportResult, string>(({ input }) =>
      RuntimeClient.runPromise(exportMobileBackup({ backupName: input }))
    ),
    importBackup: fromPromise<MobileBackupImportResult, string>(({ input }) =>
      RuntimeClient.runPromise(importMobileBackup({ json: input }))
    ),
  },
}).createMachine({
  context: () => ({
    activeTab: 0,
    backupName: "Mai backup",
    errorMessage: null,
    exportedFileName: null,
    exportedJson: "",
    importJson: "",
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    changeBackupName: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeBackupName");

        return {
          backupName: event.backupName,
        };
      }),
    },
    changeImportJson: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeImportJson");

        return {
          importJson: event.json,
        };
      }),
    },
    selectTab: {
      actions: assign(({ event }) => {
        assertEvent(event, "selectTab");

        return {
          activeTab: event.index,
        };
      }),
    },
  },
  states: {
    Idle: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Exported: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ context }) => context.backupName,
        onDone: {
          target: "Exported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            exportedFileName: event.output.fileName,
            exportedJson: event.output.json,
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
    Failure: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Imported: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Importing: {
      invoke: {
        src: "importBackup",
        input: ({ context }) => context.importJson,
        onDone: {
          target: "Imported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            importJson: "",
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const catalogTransferMachine = setup({
  types: {
    context: {} as {
      readonly catalogImportText: string;
      readonly catalogShareText: string;
      readonly errorMessage: string | null;
      readonly exportedFoodCount: number | null;
      readonly previewCandidates: readonly FoodCatalogImportCandidate[];
      readonly qr: MobileCatalogQrResult | null;
      readonly selectedFoodIds: readonly FoodCatalogFoodId[];
      readonly successMessage: string | null;
    },
    events: {} as CatalogTransferRouteEvent,
  },
  actors: {
    exportCatalog: fromPromise<MobileCatalogExportResult>(() =>
      RuntimeClient.runPromise(exportMobileFoodCatalog())
    ),
    importSelectedCatalogFoods: fromPromise<
      MobileCatalogImportResult,
      {
        readonly selectedFoodIds: readonly FoodCatalogFoodId[];
        readonly shareText: string;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        importSelectedMobileFoodCatalog({
          selectedFoodIds: input.selectedFoodIds,
          shareText: input.shareText,
        })
      )
    ),
    previewCatalogImport: fromPromise<MobileCatalogPreviewResult, string>(
      ({ input }) =>
        RuntimeClient.runPromise(
          previewMobileFoodCatalogImport({ shareText: input })
        )
    ),
    shareCatalogText: fromPromise<MobileCatalogShareResult, string>(
      async ({ input }) => {
        await Share.share({
          message: input,
        });

        return {
          message: "Opened the system share sheet.",
        };
      }
    ),
  },
}).createMachine({
  context: () => ({
    catalogImportText: "",
    catalogShareText: "",
    errorMessage: null,
    exportedFoodCount: null,
    previewCandidates: [],
    qr: null,
    selectedFoodIds: [],
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    changeCatalogImportText: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeCatalogImportText");

        return {
          catalogImportText: event.text,
          errorMessage: null,
          successMessage: null,
        };
      }),
    },
    exportCatalog: {
      target: ".Exporting",
      actions: assign({
        errorMessage: null,
        successMessage: null,
      }),
    },
    importSelectedCatalogFoods: {
      guard: ({ context }) =>
        EffectArray.isReadonlyArrayNonEmpty(context.selectedFoodIds),
      target: ".Importing",
      actions: assign({
        errorMessage: null,
        successMessage: null,
      }),
    },
    previewCatalogImport: {
      guard: ({ context }) => context.catalogImportText.trim() !== "",
      target: ".Previewing",
      actions: assign({
        errorMessage: null,
        successMessage: null,
      }),
    },
    shareCatalogText: {
      guard: ({ context }) => context.catalogShareText !== "",
      target: ".Sharing",
      actions: assign({
        errorMessage: null,
        successMessage: null,
      }),
    },
    toggleCatalogFood: {
      actions: assign(({ context, event }) => {
        assertEvent(event, "toggleCatalogFood");

        const candidate = context.previewCandidates.find(
          (previewCandidate) => previewCandidate.food.id === event.foodId
        );

        if (candidate?.selection.selectable !== true) {
          return {};
        }

        const isSelected = context.selectedFoodIds.includes(event.foodId);

        return {
          selectedFoodIds: isSelected
            ? context.selectedFoodIds.filter(
                (selectedFoodId) => selectedFoodId !== event.foodId
              )
            : [...context.selectedFoodIds, event.foodId],
        };
      }),
    },
  },
  states: {
    Exported: {},
    Exporting: {
      invoke: {
        src: "exportCatalog",
        onDone: {
          target: "Exported",
          actions: assign(({ event }) => ({
            catalogShareText: event.output.shareText,
            errorMessage: null,
            exportedFoodCount: event.output.foodCount,
            qr: event.output.qr,
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
    Failure: {},
    Idle: {},
    Imported: {},
    Importing: {
      invoke: {
        src: "importSelectedCatalogFoods",
        input: ({ context }) => ({
          selectedFoodIds: context.selectedFoodIds,
          shareText: context.catalogImportText,
        }),
        onDone: {
          target: "Imported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            previewCandidates: [],
            selectedFoodIds: [],
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
    Previewed: {},
    Previewing: {
      invoke: {
        src: "previewCatalogImport",
        input: ({ context }) => context.catalogImportText,
        onDone: {
          target: "Previewed",
          actions: assign(({ event }) => ({
            errorMessage: null,
            previewCandidates: event.output.candidates,
            selectedFoodIds: event.output.selectedFoodIds,
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            previewCandidates: [],
            selectedFoodIds: [],
            successMessage: null,
          })),
        },
      },
    },
    Sharing: {
      invoke: {
        src: "shareCatalogText",
        input: ({ context }) => context.catalogShareText,
        onDone: {
          target: "Exported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const localDataResetMachine = LocalDataResetMachine.makeLocalDataResetMachine({
  restartApp: () => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.replace("/");
  },
  runtime: RuntimeClient,
});

export default function BackupScreen() {
  const [snapshot, send] = useMachine(backupRouteMachine);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const disabled = isExporting || isImporting;
  const {
    activeTab,
    backupName,
    errorMessage,
    exportedFileName,
    exportedJson,
    importJson,
  } = snapshot.context;
  const tabs = [
    {
      accessibilityLabel: "Export backup",
      key: "export",
      label: "Export",
    },
    {
      accessibilityLabel: "Import backup",
      key: "import",
      label: "Import",
    },
    {
      accessibilityLabel: "Share food catalog",
      key: "catalog",
      label: "Catalog",
    },
    {
      accessibilityLabel: "Reset local data",
      key: "reset",
      label: "Reset",
    },
  ] as const;

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

        {snapshot.context.successMessage === null ? null : (
          <Notice message={snapshot.context.successMessage} tone="success" />
        )}
        {errorMessage === null ? null : (
          <Notice
            message={errorMessage}
            title="Backup action failed"
            tone="danger"
          />
        )}

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={(index) => {
            send({
              index: index === 0 ? 0 : index === 1 ? 1 : index === 2 ? 2 : 3,
              type: "selectTab",
            });
          }}
          tabBarPosition="bottom"
          tabs={[
            {
              ...tabs[0],
              content: (
                <ExportBackupTab
                  backupName={backupName}
                  disabled={disabled}
                  exportedFileName={exportedFileName}
                  exportedJson={exportedJson}
                  onChangeBackupName={(value) => {
                    send({
                      backupName: value,
                      type: "changeBackupName",
                    });
                  }}
                  onExport={() => {
                    send({
                      type: "export",
                    });
                  }}
                />
              ),
            },
            {
              ...tabs[1],
              content: (
                <ImportBackupTab
                  disabled={disabled}
                  importJson={importJson}
                  onChangeImportJson={(json) => {
                    send({
                      json,
                      type: "changeImportJson",
                    });
                  }}
                  onImport={() => {
                    send({
                      type: "import",
                    });
                  }}
                />
              ),
            },
            {
              ...tabs[2],
              content: <CatalogTransferTab disabled={disabled} />,
            },
            {
              ...tabs[3],
              content: <ResetDataTab disabled={disabled} />,
            },
          ]}
        />
      </AppScreen>

      <LoadingOverlay
        message={isImporting ? "Importing backup" : "Exporting backup"}
        visible={disabled}
      />
    </View>
  );
}

function ExportBackupTab({
  backupName,
  disabled,
  exportedFileName,
  exportedJson,
  onChangeBackupName,
  onExport,
}: {
  readonly backupName: string;
  readonly disabled: boolean;
  readonly exportedFileName: string | null;
  readonly exportedJson: string;
  readonly onChangeBackupName: (value: string) => void;
  readonly onExport: () => void;
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Export">
        <View style={styles.sectionBody}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Name"
            onChangeText={onChangeBackupName}
            placeholder="Mai backup"
            value={backupName}
          />
          {exportedJson === "" ? null : (
            <TextArea
              editable={false}
              label={exportedFileName ?? "Exported JSON"}
              selectTextOnFocus
              value={exportedJson}
            />
          )}
          <Button
            disabled={disabled}
            icon={Download}
            loading={disabled}
            onPress={onExport}
          >
            Export JSON
          </Button>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function ImportBackupTab({
  disabled,
  importJson,
  onChangeImportJson,
  onImport,
}: {
  readonly disabled: boolean;
  readonly importJson: string;
  readonly onChangeImportJson: (json: string) => void;
  readonly onImport: () => void;
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Import">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Import replaces the current data on this device.
          </Text>
          <TextArea
            editable={!disabled}
            label="Backup JSON"
            onChangeText={onChangeImportJson}
            placeholder='{"format":"mai.backup"...}'
            value={importJson}
          />
          <Button
            disabled={disabled || importJson.trim() === ""}
            icon={Upload}
            loading={disabled}
            onPress={onImport}
            variant="danger"
          >
            Import JSON
          </Button>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function CatalogTransferTab({ disabled }: { readonly disabled: boolean }) {
  const [snapshot, send] = useMachine(catalogTransferMachine);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const isPreviewing = snapshot.matches("Previewing");
  const isSharing = snapshot.matches("Sharing");
  const isBusy = isExporting || isImporting || isPreviewing || isSharing;
  const transferDisabled = disabled || isBusy;
  const {
    catalogImportText,
    catalogShareText,
    errorMessage,
    exportedFoodCount,
    previewCandidates,
    qr,
    selectedFoodIds,
    successMessage,
  } = snapshot.context;

  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      {successMessage === null ? null : (
        <Notice message={successMessage} tone="success" />
      )}
      {errorMessage === null ? null : (
        <Notice
          message={errorMessage}
          title="Catalog action failed"
          tone="danger"
        />
      )}

      <SectionCard style={styles.card} title="Share catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={transferDisabled}
            icon={Download}
            loading={isExporting}
            onPress={() => {
              send({
                type: "exportCatalog",
              });
            }}
          >
            Export catalog
          </Button>

          {catalogShareText === "" || qr === null ? null : (
            <CatalogShareResult
              disabled={transferDisabled}
              foodCount={exportedFoodCount}
              onShare={() => {
                send({
                  type: "shareCatalogText",
                });
              }}
              qr={qr}
              shareText={catalogShareText}
              sharing={isSharing}
            />
          )}
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Import catalog">
        <View style={styles.sectionBody}>
          <TextArea
            autoCapitalize="none"
            autoCorrect={false}
            editable={!transferDisabled}
            label="Catalog share text"
            onChangeText={(text) => {
              send({
                text,
                type: "changeCatalogImportText",
              });
            }}
            placeholder='{"format":"mai.food-catalog-share"...}'
            value={catalogImportText}
          />
          <Button
            disabled={transferDisabled || catalogImportText.trim() === ""}
            icon={Eye}
            loading={isPreviewing}
            onPress={() => {
              send({
                type: "previewCatalogImport",
              });
            }}
          >
            Preview import
          </Button>
        </View>
      </SectionCard>

      {!EffectArray.isReadonlyArrayNonEmpty(previewCandidates) ? null : (
        <CatalogPreviewSection
          candidates={previewCandidates}
          disabled={transferDisabled}
          importing={isImporting}
          onImport={() => {
            send({
              type: "importSelectedCatalogFoods",
            });
          }}
          onToggleFood={(foodId) => {
            send({
              foodId,
              type: "toggleCatalogFood",
            });
          }}
          selectedFoodIds={selectedFoodIds}
        />
      )}

      <LoadingOverlay
        message={
          isImporting
            ? "Importing catalog"
            : isPreviewing
              ? "Previewing catalog"
              : isSharing
                ? "Opening share sheet"
                : "Exporting catalog"
        }
        visible={isBusy}
      />
    </ScrollView>
  );
}

function CatalogShareResult({
  disabled,
  foodCount,
  onShare,
  qr,
  shareText,
  sharing,
}: {
  readonly disabled: boolean;
  readonly foodCount: number | null;
  readonly onShare: () => void;
  readonly qr: MobileCatalogQrResult;
  readonly shareText: string;
  readonly sharing: boolean;
}) {
  return (
    <View style={styles.sectionBody}>
      <View style={styles.catalogMetricRow}>
        <Text style={styles.catalogMetricText}>{foodCount ?? 0} foods</Text>
        <Text style={styles.catalogMetricText}>{qr.byteLength} bytes</Text>
      </View>

      <CatalogQrPanel qr={qr} />

      <TextArea
        editable={false}
        label="Share text"
        selectTextOnFocus
        value={shareText}
      />
      <Button
        disabled={disabled}
        icon={Share2}
        loading={sharing}
        onPress={onShare}
        variant="secondary"
      >
        Share text
      </Button>
    </View>
  );
}

function CatalogQrPanel({ qr }: { readonly qr: MobileCatalogQrResult }) {
  if (qr.status === "ready") {
    return (
      <View style={styles.qrPanel}>
        <View style={styles.qrPanelHeader}>
          <QrCode color={color.textMuted} size={17} strokeWidth={3} />
          <Text style={styles.qrPanelTitle}>Single QR</Text>
        </View>
        <FoodCatalogQrCode dataUrl={qr.dataUrl} />
      </View>
    );
  }

  return (
    <Notice
      message={
        qr.status === "too-large"
          ? `Share text is ${qr.byteLength} bytes. Single QR limit is ${qr.maxBytes} bytes.`
          : qr.reason
      }
      title="Share text fallback"
      tone="warning"
    />
  );
}

function FoodCatalogQrCode({ dataUrl }: { readonly dataUrl: string }) {
  return (
    <View style={styles.qrCodeFrame}>
      <Image
        accessibilityLabel="Food catalog share QR"
        resizeMode="contain"
        source={{ uri: dataUrl }}
        style={styles.qrCodeImage}
      />
    </View>
  );
}

function CatalogPreviewSection({
  candidates,
  disabled,
  importing,
  onImport,
  onToggleFood,
  selectedFoodIds,
}: {
  readonly candidates: readonly FoodCatalogImportCandidate[];
  readonly disabled: boolean;
  readonly importing: boolean;
  readonly onImport: () => void;
  readonly onToggleFood: (foodId: FoodCatalogFoodId) => void;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
}) {
  return (
    <SectionCard style={styles.card} title="Preview">
      <View style={styles.sectionBody}>
        <View style={styles.catalogMetricRow}>
          <Text style={styles.catalogMetricText}>
            {candidates.length} candidates
          </Text>
          <Text style={styles.catalogMetricText}>
            {selectedFoodIds.length} selected
          </Text>
        </View>

        <View style={styles.catalogCandidateList}>
          {candidates.map((candidate) => (
            <CatalogCandidateRow
              candidate={candidate}
              disabled={disabled}
              key={candidate.food.id}
              onToggle={() => {
                onToggleFood(candidate.food.id);
              }}
              selected={selectedFoodIds.includes(candidate.food.id)}
            />
          ))}
        </View>

        <Button
          disabled={
            disabled || !EffectArray.isReadonlyArrayNonEmpty(selectedFoodIds)
          }
          icon={Upload}
          loading={importing}
          onPress={onImport}
        >
          Import selected
        </Button>
      </View>
    </SectionCard>
  );
}

function CatalogCandidateRow({
  candidate,
  disabled,
  onToggle,
  selected,
}: {
  readonly candidate: FoodCatalogImportCandidate;
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
          <CatalogBadge
            label={CatalogBasedOnStatusLabel[candidate.basedOnFoodIdStatus]}
            tone={CatalogBasedOnStatusTone[candidate.basedOnFoodIdStatus]}
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

function ResetDataTab({ disabled }: { readonly disabled: boolean }) {
  const [snapshot, send] = useMachine(localDataResetMachine);
  const isIdle = snapshot.matches("Idle");
  const isConfirming =
    snapshot.matches("Confirming") || snapshot.matches("Failure");
  const isResetting = snapshot.matches("Resetting");
  const resetDisabled = disabled || isResetting;
  const canReset =
    snapshot.context.confirmationText ===
    NutritionLocalData.LocalDataResetConfirmationText;

  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Reset">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Delete every plan, food, daily log, and meal entry on this device.
          </Text>

          {isIdle ? (
            <Button
              disabled={resetDisabled}
              icon={Trash2}
              onPress={() => {
                send({ type: "begin" });
              }}
              variant="danger"
            >
              Delete everything
            </Button>
          ) : null}

          {isConfirming ? (
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
                onChangeText={(confirmationText) => {
                  send({
                    confirmationText,
                    type: "changeConfirmationText",
                  });
                }}
                placeholder={NutritionLocalData.LocalDataResetConfirmationText}
                value={snapshot.context.confirmationText}
              />
              <View style={styles.inlineActions}>
                <Button
                  disabled={resetDisabled}
                  icon={X}
                  onPress={() => {
                    send({ type: "cancel" });
                  }}
                  style={styles.inlineAction}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  disabled={resetDisabled || !canReset}
                  icon={Trash2}
                  onPress={() => {
                    send({ type: "reset" });
                  }}
                  style={styles.inlineAction}
                  variant="danger"
                >
                  Delete data
                </Button>
              </View>
              {snapshot.context.errorMessage === null ? null : (
                <Text style={styles.resetErrorText}>
                  {snapshot.context.errorMessage}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </SectionCard>

      <LoadingOverlay message="Deleting local data" visible={isResetting} />
    </ScrollView>
  );
}

export function exportMobileBackup({
  backupName,
}: {
  readonly backupName: string;
}) {
  return Effect.gen(function* () {
    const backups = yield* Backup.Backups;
    const exportedBackup = yield* backups.exportToJson();
    const fileName = backupFileName({
      backup: exportedBackup.backup,
      backupName,
    });

    return {
      fileName,
      json: exportedBackup.json,
      message: `Exported ${fileName}. Select the JSON field to copy it.`,
    } satisfies MobileBackupExportResult;
  });
}

export function importMobileBackup({ json }: { readonly json: string }) {
  return Effect.gen(function* () {
    const backups = yield* Backup.Backups;
    const importedBackup = yield* backups.importFromJson({
      input: {
        json,
      },
    });

    return {
      message: backupImportMessage({ backup: importedBackup.backup }),
    } satisfies MobileBackupImportResult;
  });
}

export function exportMobileFoodCatalog() {
  return Effect.gen(function* () {
    const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
    const qrCodes = yield* QrCodeService.QrCode;
    const exportedCatalog = yield* transfers.exportToJson();
    const encodedShare = yield* FoodCatalogShare.encodeCatalogJson({
      catalogJson: exportedCatalog.json,
    });
    const shareText = encodedShare.shareText;

    const qr = encodedShare.size.tooLargeForSingleQr
      ? ({
          byteLength: encodedShare.size.encodedTextByteLength,
          maxBytes: encodedShare.size.singleQrTextByteLimit,
          status: "too-large",
        } satisfies MobileCatalogQrResult)
      : yield* Effect.matchEffect(qrCodes.generate(shareText), {
          onFailure: (error) =>
            Effect.succeed({
              byteLength: encodedShare.size.encodedTextByteLength,
              maxBytes: encodedShare.size.singleQrTextByteLimit,
              reason: backupErrorMessage({ error }),
              status: "unavailable",
            } satisfies MobileCatalogQrResult),
          onSuccess: (dataUrl) =>
            Effect.succeed({
              byteLength: encodedShare.size.encodedTextByteLength,
              dataUrl,
              maxBytes: encodedShare.size.singleQrTextByteLimit,
              status: "ready",
            } satisfies MobileCatalogQrResult),
        });

    return {
      foodCount: exportedCatalog.catalog.integrity.counts.foods,
      message: `Exported ${exportedCatalog.catalog.integrity.counts.foods} custom foods.`,
      qr,
      shareText,
    } satisfies MobileCatalogExportResult;
  });
}

export function previewMobileFoodCatalogImport({
  shareText,
}: {
  readonly shareText: string;
}) {
  return Effect.gen(function* () {
    const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
    const decodedShare = yield* FoodCatalogShare.decodeShareText({
      text: shareText,
    });
    const preview = yield* transfers.previewImportFromJson({
      input: {
        json: decodedShare.catalogJson,
      },
    });
    const selectedFoodIds = preview.candidates
      .filter(
        (candidate) =>
          candidate.selection.selectable &&
          candidate.selection.defaultSelected &&
          candidate.status !== "already-present" &&
          candidate.nameStatus !== "same-name-local"
      )
      .map((candidate) => candidate.food.id);

    return {
      candidates: preview.candidates,
      message: `Previewed ${preview.candidates.length} foods. ${selectedFoodIds.length} selected by default.`,
      selectedFoodIds,
    } satisfies MobileCatalogPreviewResult;
  });
}

export function importSelectedMobileFoodCatalog({
  selectedFoodIds,
  shareText,
}: {
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
  readonly shareText: string;
}) {
  return Effect.gen(function* () {
    const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
    const decodedShare = yield* FoodCatalogShare.decodeShareText({
      text: shareText,
    });
    const importedCatalog = yield* transfers.importSelectedFromJson({
      input: {
        json: decodedShare.catalogJson,
        selectedFoodIds,
      },
    });

    return {
      message: `Imported ${importedCatalog.importedFoods.length} foods.`,
    } satisfies MobileCatalogImportResult;
  });
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

const CatalogBasedOnStatusLabel: Record<
  FoodCatalogTransfer.FoodCatalogBasedOnFoodIdStatus,
  string
> = {
  "available-in-catalog": "Based-on catalog",
  "available-locally": "Based-on local",
  missing: "Based-on missing",
  none: "No base food",
};

const CatalogBasedOnStatusTone: Record<
  FoodCatalogTransfer.FoodCatalogBasedOnFoodIdStatus,
  "danger" | "neutral" | "success" | "warning"
> = {
  "available-in-catalog": "neutral",
  "available-locally": "neutral",
  missing: "warning",
  none: "neutral",
};

export function backupFileName({
  backup,
  backupName,
}: {
  readonly backup: Backup.MaiBackup;
  readonly backupName: string;
}) {
  const exportedAt = new Date(DateTime.toEpochMillis(backup.source.exportedAt));
  const baseName = backupName.trim() === "" ? "mai-backup" : backupName.trim();
  const sanitizedName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fileNamePrefix =
    sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;

  return `${fileNamePrefix}-format-v${backup.formatVersion}-db-v${backup.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.json`;
}

export function backupImportMessage({
  backup,
}: {
  readonly backup: Backup.MaiBackup;
}) {
  const totalRecords =
    backup.integrity.counts.dailyLogs +
    backup.integrity.counts.foods +
    backup.integrity.counts.mealEntries +
    backup.integrity.counts.plans;

  return `Imported backup. Format v${backup.formatVersion}, database v${backup.source.databaseVersion}, ${totalRecords} records restored.`;
}

export function backupErrorMessage({ error }: { readonly error: unknown }) {
  return error instanceof Error
    ? error.message
    : "The backup action could not finish.";
}

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
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionBody: {
    gap: spacing.md,
  },
  catalogMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catalogMetricText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  qrPanel: {
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 6,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  qrPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  qrPanelTitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  qrCodeFrame: {
    width: "100%",
    maxWidth: 260,
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: color.white,
  },
  qrCodeImage: {
    width: "100%",
    height: "100%",
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
    fontWeight: tokens.type.weight.black,
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
    fontWeight: tokens.type.weight.black,
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
    fontWeight: tokens.type.weight.black,
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
