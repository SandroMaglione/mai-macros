import { FoodCatalogTransfer } from "@mai/nutrition";
import { FoodCatalogShare, QrCode as QrCodeService } from "@mai/services";
import { useSelector } from "@xstate/react";
import { DateTime, Effect, Array as EffectArray, Option, Schema } from "effect";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Copy,
  Download,
  FileJson,
  Loader2,
  QrCode,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import {
  assertEvent,
  assign,
  fromPromise,
  sendParent,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

import { RuntimeClient } from "../runtime-client.ts";

type FoodCatalogCandidate = FoodCatalogTransfer.FoodCatalogImportCandidate;
type FoodCatalogPreview = FoodCatalogTransfer.PreviewedFoodCatalogImport & {
  readonly catalogJson: string;
};
type FoodCatalogExport = FoodCatalogTransfer.ExportedFoodCatalog;
type FoodCatalogFoodId = FoodCatalogCandidate["food"]["id"];

type FoodCatalogNotice = {
  readonly message: string;
  readonly tone: "error" | "success";
};

type FoodCatalogExportResult = {
  readonly classification: FoodCatalogShare.FoodCatalogShareSizeAssessment;
  readonly exported: FoodCatalogExport;
  readonly fileNameBase: string;
  readonly qrCodeDataUrl: string | null;
  readonly shareText: string;
};

type FoodCatalogTextSource = {
  readonly sourceLabel: string;
  readonly text: () => Promise<string>;
};

type FoodCatalogCopySource = {
  readonly label: string;
  readonly text: string;
};

type FoodCatalogDownloadSource = {
  readonly fileName: string;
  readonly type: string;
  readonly text: string;
};

type FoodCatalogExportEvent =
  | {
      readonly result: FoodCatalogExportResult;
      readonly type: "setResult";
    }
  | {
      readonly type: "copyJson";
    }
  | {
      readonly type: "copyShareText";
    }
  | {
      readonly type: "downloadJson";
    }
  | {
      readonly type: "downloadShareText";
    };

type FoodCatalogTransferEvent =
  | {
      readonly importText: string;
      readonly type: "changeImportText";
    }
  | {
      readonly type: "exportCatalog";
    }
  | {
      readonly type: "importSelected";
    }
  | {
      readonly source: FoodCatalogTextSource;
      readonly type: "previewSource";
    }
  | {
      readonly type: "previewText";
    }
  | {
      readonly type: "selectAllSafe";
    }
  | {
      readonly type: "selectDefaults";
    }
  | {
      readonly checked: boolean;
      readonly foodId: FoodCatalogFoodId;
      readonly type: "toggleCandidate";
    };

export type FoodCatalogTransferImportedEvent = {
  readonly type: "foodCatalogImported";
};

const panelClassName =
  "grid gap-3 rounded-lg border border-[#29292d] bg-[#161618] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]";
const textareaClassName =
  "min-h-28 w-full resize-y rounded-md border border-[#37373b] bg-[#111113] px-3 py-2 text-sm font-bold leading-snug text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";

const FoodCatalogTransferErrorSchema = Schema.Struct({
  _tag: Schema.String,
  detail: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});

const copyTextActor = fromPromise<FoodCatalogNotice, FoodCatalogCopySource>(
  async ({ input }) => {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(input.text);
    } else {
      const textarea = document.createElement("textarea");

      textarea.value = input.text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand("copy");

      textarea.remove();

      if (!copied) {
        throw new Error("Copy command was rejected.");
      }
    }

    return {
      message: `Copied ${input.label}.`,
      tone: "success",
    };
  }
);

const foodCatalogExportMachine = setup({
  types: {
    context: {} as {
      readonly notice: FoodCatalogNotice | null;
      readonly result: FoodCatalogExportResult | null;
    },
    events: {} as FoodCatalogExportEvent,
    input: {} as {
      readonly result: FoodCatalogExportResult | null;
    },
  },
  actors: {
    copyText: copyTextActor,
  },
}).createMachine({
  context: ({ input }) => ({
    notice: null,
    result: input.result,
  }),
  initial: "Idle",
  on: {
    setResult: {
      actions: assign(({ event }) => {
        assertEvent(event, "setResult");

        return {
          notice: {
            message: `Exported ${event.result.exported.catalog.integrity.counts.foods} catalog foods.`,
            tone: "success",
          },
          result: event.result,
        };
      }),
      target: ".Idle",
    },
  },
  states: {
    CopyingJson: {
      invoke: {
        src: "copyText",
        input: ({ context }) => ({
          label: "catalog JSON",
          text: context.result?.exported.json ?? "",
        }),
        onDone: {
          actions: assign(({ event }) => ({
            notice: event.output,
          })),
          target: "Idle",
        },
        onError: {
          actions: assign({
            notice: {
              message: "Could not copy catalog JSON.",
              tone: "error",
            },
          }),
          target: "Idle",
        },
      },
    },
    CopyingShareText: {
      invoke: {
        src: "copyText",
        input: ({ context }) => ({
          label: "catalog share text",
          text: context.result?.shareText ?? "",
        }),
        onDone: {
          actions: assign(({ event }) => ({
            notice: event.output,
          })),
          target: "Idle",
        },
        onError: {
          actions: assign({
            notice: {
              message: "Could not copy catalog share text.",
              tone: "error",
            },
          }),
          target: "Idle",
        },
      },
    },
    Idle: {
      on: {
        copyJson: {
          guard: ({ context }) => context.result !== null,
          target: "CopyingJson",
        },
        copyShareText: {
          guard: ({ context }) => context.result !== null,
          target: "CopyingShareText",
        },
        downloadJson: {
          guard: ({ context }) => context.result !== null,
          actions: [
            ({ context }) => {
              const result = context.result;

              if (result !== null) {
                _downloadTextFile({
                  fileName: `${result.fileNameBase}.json`,
                  text: result.exported.json,
                  type: "application/json",
                });
              }
            },
            assign({
              notice: {
                message: "Downloaded catalog JSON.",
                tone: "success",
              },
            }),
          ],
        },
        downloadShareText: {
          guard: ({ context }) => context.result !== null,
          actions: [
            ({ context }) => {
              const result = context.result;

              if (result !== null) {
                _downloadTextFile({
                  fileName: `${result.fileNameBase}.txt`,
                  text: result.shareText,
                  type: "text/plain",
                });
              }
            },
            assign({
              notice: {
                message: "Downloaded catalog share text.",
                tone: "success",
              },
            }),
          ],
        },
      },
    },
  },
});

type FoodCatalogExportActorRef = ActorRefFrom<typeof foodCatalogExportMachine>;

export const foodCatalogTransferMachine = setup({
  types: {
    context: {} as {
      readonly exportActor: FoodCatalogExportActorRef;
      readonly importText: string;
      readonly notice: FoodCatalogNotice | null;
      readonly preview: FoodCatalogPreview | null;
      readonly selectedFoodIds: readonly FoodCatalogFoodId[];
    },
    events: {} as FoodCatalogTransferEvent,
  },
  actors: {
    foodCatalogExport: foodCatalogExportMachine,
    exportCatalog: fromPromise<FoodCatalogExportResult>(() =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
          const qrCodes = yield* QrCodeService.QrCode;
          const exportedCatalog = yield* transfers.exportToJson();
          const encodedShare = yield* FoodCatalogShare.encodeCatalogJson({
            catalogJson: exportedCatalog.json,
          });
          const qrCodeDataUrl = encodedShare.size.canUseSingleQr
            ? yield* Effect.matchEffect(
                qrCodes.generate(encodedShare.shareText),
                {
                  onFailure: () => Effect.succeed(null),
                  onSuccess: (dataUrl) => Effect.succeed(dataUrl),
                }
              )
            : null;

          return {
            classification: encodedShare.size,
            exported: exportedCatalog,
            fileNameBase: _foodCatalogFileNameBase({
              exported: exportedCatalog,
            }),
            qrCodeDataUrl,
            shareText: encodedShare.shareText,
          } satisfies FoodCatalogExportResult;
        })
      )
    ),
    importSelected: fromPromise<
      {
        readonly nextPreview: FoodCatalogPreview;
        readonly notice: FoodCatalogNotice;
      },
      {
        readonly catalogJson: string;
        readonly selectedFoodIds: readonly FoodCatalogFoodId[];
      }
    >(async ({ input }) => {
      const imported = await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;

          return yield* transfers.importSelectedFromJson({
            input: {
              json: input.catalogJson,
              selectedFoodIds: input.selectedFoodIds,
            },
          });
        })
      );

      return {
        nextPreview: await RuntimeClient.runPromise(
          Effect.gen(function* () {
            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const preview = yield* transfers.previewImportFromJson({
              input: { json: input.catalogJson },
            });

            return {
              ...preview,
              catalogJson: input.catalogJson,
            };
          })
        ),
        notice: {
          message: `Imported ${imported.importedFoods.length} catalog foods.`,
          tone: "success",
        },
      };
    }),
    previewSource: fromPromise<
      {
        readonly defaultSelectedCount: number;
        readonly preview: FoodCatalogPreview;
        readonly selectedFoodIds: readonly FoodCatalogFoodId[];
        readonly sourceLabel: string;
      },
      FoodCatalogTextSource
    >(async ({ input }) => {
      const text = await input.text();
      const preview = await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const decoded = yield* FoodCatalogShare.decodeShareText({ text });
          const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
          const preview = yield* transfers.previewImportFromJson({
            input: {
              json: decoded.catalogJson,
            },
          });

          return {
            ...preview,
            catalogJson: decoded.catalogJson,
          };
        })
      );
      const { defaultSelectedCount, selectedFoodIds } =
        _selectedFoodIdsFromPreview({ preview });

      return {
        defaultSelectedCount,
        preview,
        selectedFoodIds,
        sourceLabel: input.sourceLabel,
      };
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    exportActor: spawn("foodCatalogExport", {
      id: "foodCatalogExport",
      input: {
        result: null,
      },
    }),
    importText: "",
    notice: null,
    preview: null,
    selectedFoodIds: [],
  }),
  initial: "Idle",
  on: {
    changeImportText: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeImportText");

        return {
          importText: event.importText,
        };
      }),
    },
    toggleCandidate: {
      actions: assign(({ context, event }) => {
        assertEvent(event, "toggleCandidate");

        const candidate = context.preview?.candidates.find(
          (previewCandidate) => previewCandidate.food.id === event.foodId
        );

        if (candidate?.selection.selectable !== true) {
          return {};
        }

        return {
          selectedFoodIds: event.checked
            ? context.selectedFoodIds.includes(event.foodId)
              ? context.selectedFoodIds
              : [...context.selectedFoodIds, event.foodId]
            : context.selectedFoodIds.filter(
                (selectedFoodId) => selectedFoodId !== event.foodId
              ),
        };
      }),
    },
  },
  states: {
    Exporting: {
      invoke: {
        src: "exportCatalog",
        onDone: {
          target: "Idle",
          actions: sendTo(
            ({ context }) => context.exportActor,
            ({ event }) =>
              ({
                result: event.output,
                type: "setResult",
              }) satisfies FoodCatalogExportEvent
          ),
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            notice: {
              message: _foodCatalogErrorMessage({
                action: "export",
                error: event.error,
              }),
              tone: "error",
            },
          })),
        },
      },
    },
    Idle: {
      on: {
        exportCatalog: {
          target: "Exporting",
          actions: assign({
            notice: null,
          }),
        },
        importSelected: {
          guard: ({ context }) =>
            context.preview !== null &&
            EffectArray.isReadonlyArrayNonEmpty(context.selectedFoodIds),
          target: "Importing",
          actions: assign({
            notice: null,
          }),
        },
        previewSource: {
          target: "Previewing",
          actions: assign({
            notice: null,
          }),
        },
        previewText: {
          guard: ({ context }) => context.importText.trim() !== "",
          target: "Previewing",
          actions: assign({
            notice: null,
          }),
        },
        selectAllSafe: {
          actions: assign(({ context }) => ({
            selectedFoodIds:
              context.preview?.candidates
                .filter(_shouldBulkSelectCandidate)
                .map((candidate) => candidate.food.id) ?? [],
          })),
        },
        selectDefaults: {
          actions: assign(({ context }) => ({
            selectedFoodIds:
              context.preview === null
                ? []
                : _selectedFoodIdsFromPreview({
                    preview: context.preview,
                  }).selectedFoodIds,
          })),
        },
      },
    },
    Importing: {
      invoke: {
        src: "importSelected",
        input: ({ context }) => ({
          catalogJson: context.preview?.catalogJson ?? "",
          selectedFoodIds: context.selectedFoodIds,
        }),
        onDone: {
          target: "Idle",
          actions: [
            assign(({ event }) => ({
              notice: event.output.notice,
              preview: event.output.nextPreview,
              selectedFoodIds: _selectedFoodIdsFromPreview({
                preview: event.output.nextPreview,
              }).selectedFoodIds,
            })),
            sendParent({
              type: "foodCatalogImported",
            } satisfies FoodCatalogTransferImportedEvent),
          ],
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            notice: {
              message: _foodCatalogErrorMessage({
                action: "import",
                error: event.error,
              }),
              tone: "error",
            },
          })),
        },
      },
    },
    Previewing: {
      invoke: {
        src: "previewSource",
        input: ({ context, event }) => {
          if (event.type === "previewSource") {
            return event.source;
          }

          return {
            sourceLabel: "pasted catalog",
            text: () => Promise.resolve(context.importText),
          };
        },
        onDone: {
          target: "Idle",
          actions: assign(({ event }) => ({
            notice: {
              message: `Previewed ${event.output.preview.candidates.length} foods from ${event.output.sourceLabel}. ${event.output.defaultSelectedCount} selected.`,
              tone: "success",
            },
            preview: event.output.preview,
            selectedFoodIds: event.output.selectedFoodIds,
          })),
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            notice: {
              message: _foodCatalogErrorMessage({
                action: "preview",
                error: event.error,
              }),
              tone: "error",
            },
            preview: null,
            selectedFoodIds: [],
          })),
        },
      },
    },
  },
});

export type FoodCatalogTransferActorRef = ActorRefFrom<
  typeof foodCatalogTransferMachine
>;

export function FoodCatalogTransferControls({
  actor,
}: {
  readonly actor: FoodCatalogTransferActorRef;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const snapshot = useSelector(actor, (state) => state);
  const { exportActor, importText, notice, preview, selectedFoodIds } =
    snapshot.context;
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const isPreviewing = snapshot.matches("Previewing");
  const disabled = !snapshot.matches("Idle");
  const selectedCount = selectedFoodIds.length;
  const canConfirmImport =
    preview !== null && selectedCount > 0 && snapshot.matches("Idle");

  return (
    <section className={panelClassName} aria-label="Food catalog transfers">
      <div className="grid gap-1">
        <h2 className="text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Food catalog
        </h2>
        <p className="text-xs font-bold leading-tight text-[#77777e]">
          User foods only / format v1 / preview before import
        </p>
      </div>

      <div className="grid gap-2">
        <button
          className="btn-primary"
          disabled={disabled}
          onClick={() => {
            actor.send({ type: "exportCatalog" });
          }}
          type="button"
        >
          {isExporting ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin"
              size={17}
              strokeWidth={3}
            />
          ) : (
            <QrCode aria-hidden="true" size={17} strokeWidth={3} />
          )}
          Export catalog
        </button>

        <FoodCatalogExportDetails actor={exportActor} />
      </div>

      <div className="grid gap-3 border-t border-[#29292d] pt-3">
        <div className="grid gap-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]">
            Import text
            <textarea
              className={textareaClassName}
              disabled={disabled}
              onChange={(event) => {
                actor.send({
                  importText: event.currentTarget.value,
                  type: "changeImportText",
                });
              }}
              placeholder="Paste Mai food catalog share text or JSON"
              value={importText}
            />
          </label>

          <input
            accept="application/json,text/plain,.json,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.item(0) ?? null;

              event.currentTarget.value = "";

              if (file !== null) {
                actor.send({
                  source: {
                    sourceLabel: file.name,
                    text: () => file.text(),
                  },
                  type: "previewSource",
                });
              }
            }}
            ref={fileInputRef}
            type="file"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secondary"
              disabled={disabled}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              type="button"
            >
              <Upload aria-hidden="true" size={17} strokeWidth={3} />
              Upload
            </button>
            <button
              className="btn-secondary"
              disabled={disabled || importText.trim() === ""}
              onClick={() => {
                actor.send({ type: "previewText" });
              }}
              type="button"
            >
              {isPreviewing ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                  strokeWidth={3}
                />
              ) : (
                <RefreshCw aria-hidden="true" size={17} strokeWidth={3} />
              )}
              Preview
            </button>
          </div>
        </div>

        {preview === null ? null : (
          <FoodCatalogPreviewDetails
            actor={actor}
            canConfirmImport={canConfirmImport}
            isImporting={isImporting}
            preview={preview}
            selectedCount={selectedCount}
            selectedFoodIds={selectedFoodIds}
          />
        )}
      </div>

      {notice === null ? null : <FoodCatalogNoticeView notice={notice} />}
    </section>
  );
}

function FoodCatalogExportDetails({
  actor,
}: {
  readonly actor: FoodCatalogExportActorRef;
}) {
  const snapshot = useSelector(actor, (state) => state);
  const { notice, result } = snapshot.context;

  if (result === null) {
    return null;
  }

  const disabled = !snapshot.matches("Idle");
  const exportedAt = new Date(
    DateTime.toEpochMillis(result.exported.catalog.source.exportedAt)
  );

  return (
    <div className="grid gap-3 rounded-md border border-[#343438] bg-[#111113] p-3">
      <div className="grid gap-1">
        <p className="text-sm font-black leading-tight text-[#f0f0f2]">
          {result.exported.catalog.integrity.counts.foods} foods ready
        </p>
        <p className="text-xs font-bold leading-snug text-[#aaaab1]">
          Format v{result.exported.catalog.formatVersion}, database v
          {result.exported.catalog.source.databaseVersion},{" "}
          {exportedAt.toLocaleString()}.
        </p>
      </div>

      {result.qrCodeDataUrl === null ? (
        <div className="flex min-w-0 items-start gap-2 rounded-md border border-[#4b3a24] bg-[#201b12] p-3 text-xs font-bold leading-snug text-[#ffd28a]">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={16}
            strokeWidth={3}
          />
          <p className="min-w-0">
            {result.classification.status === "too-large-for-single-qr"
              ? `Share text is ${result.classification.encodedTextByteLength} bytes, above the ${result.classification.singleQrTextByteLimit} byte single-QR limit.`
              : "QR rendering is unavailable for this export."}
          </p>
        </div>
      ) : (
        <div className="grid justify-items-center rounded-md bg-white p-3">
          <img
            alt="Food catalog share QR"
            aria-label="Food catalog share QR"
            className="h-auto w-full max-w-[280px]"
            src={result.qrCodeDataUrl}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary"
          disabled={disabled}
          onClick={() => {
            actor.send({ type: "copyShareText" });
          }}
          type="button"
        >
          <Copy aria-hidden="true" size={16} strokeWidth={3} />
          Copy text
        </button>
        <button
          className="btn-secondary"
          disabled={disabled}
          onClick={() => {
            actor.send({ type: "copyJson" });
          }}
          type="button"
        >
          <Clipboard aria-hidden="true" size={16} strokeWidth={3} />
          Copy JSON
        </button>
        <button
          className="btn-secondary"
          disabled={disabled}
          onClick={() => {
            actor.send({ type: "downloadShareText" });
          }}
          type="button"
        >
          <Download aria-hidden="true" size={16} strokeWidth={3} />
          Text file
        </button>
        <button
          className="btn-secondary"
          disabled={disabled}
          onClick={() => {
            actor.send({ type: "downloadJson" });
          }}
          type="button"
        >
          <FileJson aria-hidden="true" size={16} strokeWidth={3} />
          JSON file
        </button>
      </div>

      {notice === null ? null : <FoodCatalogNoticeView notice={notice} />}
    </div>
  );
}

function FoodCatalogPreviewDetails({
  actor,
  canConfirmImport,
  isImporting,
  preview,
  selectedCount,
  selectedFoodIds,
}: {
  readonly actor: FoodCatalogTransferActorRef;
  readonly canConfirmImport: boolean;
  readonly isImporting: boolean;
  readonly preview: FoodCatalogPreview;
  readonly selectedCount: number;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
}) {
  const importableCount = preview.candidates.filter(
    (candidate) => candidate.selection.selectable
  ).length;
  const bulkSelectableCount = preview.candidates.filter(
    _shouldBulkSelectCandidate
  ).length;

  return (
    <div className="grid gap-3 rounded-md border border-[#343438] bg-[#111113] p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-black leading-tight text-[#f0f0f2]">
            Import preview
          </p>
          <p className="text-xs font-bold leading-snug text-[#aaaab1]">
            {selectedCount} selected / {importableCount} importable /{" "}
            {preview.candidates.length} total
          </p>
        </div>
        <FoodCatalogStatusBadge tone="neutral">Preview</FoodCatalogStatusBadge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary"
          disabled={isImporting}
          onClick={() => {
            actor.send({ type: "selectDefaults" });
          }}
          type="button"
        >
          <Check aria-hidden="true" size={16} strokeWidth={3} />
          Defaults
        </button>
        <button
          className="btn-secondary"
          disabled={isImporting || bulkSelectableCount === 0}
          onClick={() => {
            actor.send({ type: "selectAllSafe" });
          }}
          type="button"
        >
          <Check aria-hidden="true" size={16} strokeWidth={3} />
          All safe
        </button>
      </div>

      <div className="grid max-h-[340px] gap-2 overflow-y-auto pr-1">
        {preview.candidates.map((candidate) => (
          <FoodCatalogCandidateRow
            actor={actor}
            candidate={candidate}
            checked={selectedFoodIds.includes(candidate.food.id)}
            key={candidate.food.id}
          />
        ))}
      </div>

      <button
        className="btn-primary"
        disabled={!canConfirmImport}
        onClick={() => {
          actor.send({ type: "importSelected" });
        }}
        type="button"
      >
        {isImporting ? (
          <Loader2
            aria-hidden="true"
            className="animate-spin"
            size={17}
            strokeWidth={3}
          />
        ) : (
          <Upload aria-hidden="true" size={17} strokeWidth={3} />
        )}
        Import selected
      </button>
    </div>
  );
}

function FoodCatalogCandidateRow({
  actor,
  candidate,
  checked,
}: {
  readonly actor: FoodCatalogTransferActorRef;
  readonly candidate: FoodCatalogCandidate;
  readonly checked: boolean;
}) {
  const disabled = !candidate.selection.selectable;

  return (
    <label
      className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 ${
        disabled
          ? "cursor-not-allowed border-[#74322f] bg-[#201717] opacity-85"
          : "cursor-pointer border-[#29292d] bg-[#161618]"
      }`}
    >
      <input
        checked={checked}
        className="mt-1 size-4 accent-[#ff5a51]"
        disabled={disabled}
        onChange={(event) => {
          actor.send({
            checked: event.currentTarget.checked,
            foodId: candidate.food.id,
            type: "toggleCandidate",
          });
        }}
        type="checkbox"
      />
      <span className="grid min-w-0 gap-2">
        <span className="grid min-w-0 gap-1">
          <span className="min-w-0 wrap-break-word text-sm font-black leading-tight text-[#f0f0f2]">
            {candidate.food.name}
          </span>
          <span className="min-w-0 wrap-break-word text-xs font-bold leading-snug text-[#aaaab1]">
            {candidate.food.brand ?? candidate.food.category ?? "Food"} /{" "}
            {_formatNumber(candidate.food.energyKcalPer100g)} kcal /{" "}
            {_formatNumber(candidate.food.proteinGramsPer100g)}g protein /{" "}
            {_formatNumber(candidate.food.carbsGramsPer100g)}g carbs /{" "}
            {_formatNumber(candidate.food.fatGramsPer100g)}g fat
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap gap-1.5">
          <FoodCatalogStatusBadge tone={candidateStatusTones[candidate.status]}>
            {candidateStatusLabels[candidate.status]}
          </FoodCatalogStatusBadge>
          {candidate.nameStatus === "same-name-local" ? (
            <FoodCatalogStatusBadge tone="warning">
              Same name
            </FoodCatalogStatusBadge>
          ) : null}
        </span>
      </span>
    </label>
  );
}

function FoodCatalogStatusBadge({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: "danger" | "neutral" | "success" | "warning";
}) {
  const toneClassName = {
    danger: "border-[#74322f] bg-[#201717] text-[#ff8f88]",
    neutral: "border-[#343438] bg-[#202024] text-[#c8c8ce]",
    success: "border-[#26492f] bg-[#132017] text-[#8be09a]",
    warning: "border-[#4b3a24] bg-[#201b12] text-[#ffd28a]",
  } satisfies Record<"danger" | "neutral" | "success" | "warning", string>;

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2 text-[11px] font-black leading-none ${toneClassName[tone]}`}
    >
      {children}
    </span>
  );
}

function FoodCatalogNoticeView({
  notice,
}: {
  readonly notice: FoodCatalogNotice;
}) {
  const isError = notice.tone === "error";

  return (
    <div
      className={`flex min-w-0 items-start gap-2 rounded-md border p-3 text-sm font-bold leading-snug ${
        isError
          ? "border-[#74322f] bg-[#201717] text-[#ff8f88]"
          : "border-[#26492f] bg-[#132017] text-[#8be09a]"
      }`}
      role={isError ? "alert" : "status"}
    >
      {isError ? (
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          size={17}
          strokeWidth={3}
        />
      ) : (
        <Check
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          size={17}
          strokeWidth={3}
        />
      )}
      <p className="min-w-0">{notice.message}</p>
    </div>
  );
}

const candidateStatusLabels = {
  "already-present": "Already present",
  "id-conflict": "ID conflict",
  new: "New",
} satisfies Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  string
>;

const candidateStatusTones = {
  "already-present": "neutral",
  "id-conflict": "danger",
  new: "success",
} satisfies Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  "danger" | "neutral" | "success" | "warning"
>;

function _selectedFoodIdsFromPreview({
  preview,
}: {
  readonly preview: FoodCatalogTransfer.PreviewedFoodCatalogImport;
}) {
  const defaultSelectedCandidates = preview.candidates.filter(
    _shouldSelectCandidateByDefault
  );

  return {
    defaultSelectedCount: defaultSelectedCandidates.length,
    selectedFoodIds: defaultSelectedCandidates.map(
      (candidate) => candidate.food.id
    ),
  };
}

function _shouldSelectCandidateByDefault(
  candidate: FoodCatalogCandidate
): boolean {
  return (
    candidate.selection.selectable &&
    candidate.selection.defaultSelected &&
    candidate.status !== "already-present" &&
    candidate.nameStatus !== "same-name-local"
  );
}

function _shouldBulkSelectCandidate(candidate: FoodCatalogCandidate): boolean {
  return _shouldSelectCandidateByDefault(candidate);
}

function _formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}

function _foodCatalogFileNameBase({
  exported,
}: {
  readonly exported: FoodCatalogExport;
}): string {
  const exportedAt = new Date(
    DateTime.toEpochMillis(exported.catalog.source.exportedAt)
  );
  const isoDate = Number.isNaN(exportedAt.getTime())
    ? "unknown-date"
    : exportedAt.toISOString().slice(0, 10);

  return `mai-food-catalog-format-v${exported.catalog.formatVersion}-db-v${exported.catalog.source.databaseVersion}-${isoDate}`;
}

function _downloadTextFile({
  fileName,
  text,
  type,
}: FoodCatalogDownloadSource) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function _foodCatalogErrorMessage({
  action,
  error,
}: {
  readonly action: "export" | "import" | "preview";
  readonly error: unknown;
}): string {
  const decodedError = Schema.decodeUnknownOption(
    FoodCatalogTransferErrorSchema
  )(error).pipe(Option.getOrNull);

  if (decodedError?._tag === "FoodCatalogShareDecodeError") {
    return decodedError.detail ?? "Could not decode the catalog share text.";
  }

  if (decodedError?._tag === "FoodCatalogIntegrityError") {
    return decodedError.detail ?? "The food catalog failed validation.";
  }

  if (decodedError?._tag === "FoodCatalogImportSelectionError") {
    return decodedError.detail ?? "The selected foods cannot be imported.";
  }

  if (decodedError?._tag === "SchemaError") {
    return action === "export"
      ? "Could not export the catalog. The current foods could not be encoded."
      : "Choose valid Mai food catalog share text or JSON.";
  }

  if (decodedError?.message !== undefined) {
    return decodedError.message;
  }

  return {
    export: "Could not export the food catalog.",
    import: "Could not import the selected foods.",
    preview: "Could not preview the food catalog.",
  }[action];
}
