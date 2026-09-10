import { Domain, FoodCatalogTransfer } from "@mai/nutrition";
import { BackupFileTransfer, FoodCatalogShare, Gzip } from "@mai/services";
import { Machine } from "@typeonce/effect-machine";
import { Array, Data, Effect, HashSet, Match, Option, Schema } from "effect";

class CatalogImportDefect extends Data.TaggedError("CatalogImportDefect")<{
  readonly cause: unknown;
}> {}

const MobileCatalogFilePreviewResult = Schema.Union([
  Schema.TaggedStruct("Previewed", {
    catalogJson: Schema.String,
    candidates: Schema.Array(FoodCatalogTransfer.FoodCatalogImportCandidate),
    selectedFoodIds: Schema.Array(Domain.FoodId),
  }),
  Schema.TaggedStruct("Canceled", {}),
]);

type MobileCatalogFilePreviewResult =
  typeof MobileCatalogFilePreviewResult.Type;

export const CatalogImportEvents = Machine.events({
  openPreviewCatalogImportFile: {},
  importSelectedCatalogFoods: {},
  toggleCatalogFood: { foodId: Domain.FoodId },
});

const CatalogPreview = Schema.Struct({
  catalogJson: Schema.String,
  selectedFoodIds: Schema.HashSet(Domain.FoodId),
  previewCandidates: Schema.Array(
    FoodCatalogTransfer.FoodCatalogImportCandidate
  ),
});

const Root = Machine.state({
  states: {
    Idle: {},
    ImportingPreview: {},
    ImportingPreviewError: { fields: { message: Schema.String } },
    CatalogPreview: {
      fields: CatalogPreview.fields,
      states: {
        SelectFoods: {},
        ImportingCatalog: {},
        Error: { fields: { message: Schema.String } },
        Success: { fields: { message: Schema.String } },
        ImportCompleted: { type: "final" },
      },
    },
  },
});

const targets = Machine.targets(Root);

export const catalogImportMachine = Machine.make({
  id: "CatalogImport",
  root: Root,
  events: CatalogImportEvents,
  timers: { importCatalogSuccess: 3000 },
  effects: {
    previewCatalogImportFile: Effect.gen(function* () {
      const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
      const pickedFile = yield* fileTransfers.pickFile({
        mimeTypes: BackupImportMimeTypes,
      });

      return yield* Match.value(pickedFile).pipe(
        Match.tagsExhaustive({
          BackupFilePickCanceled: () =>
            Effect.succeed<MobileCatalogFilePreviewResult>({
              _tag: "Canceled",
            }),
          PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
            const json = yield* Effect.gen(function* () {
              const gzip = yield* Gzip.Gzip;
              return pickedFile.fileName.toLowerCase().endsWith(".gz") ||
                Gzip.isGzipBytes({ bytes: pickedFile.bytes })
                ? yield* gzip.gunzipText({ bytes: pickedFile.bytes })
                : yield* gzip.bytesToText({ bytes: pickedFile.bytes });
            });

            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const decodedCatalog = yield* FoodCatalogShare.decodeShareText({
              text: json,
            });
            const preview = yield* transfers.previewImportFromJson({
              input: {
                json: decodedCatalog.catalogJson,
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
              _tag: "Previewed" as const,
              catalogJson: decodedCatalog.catalogJson,
              candidates: preview.candidates,
              selectedFoodIds,
            };
          }),
        })
      );
    }).pipe(
      Effect.catchDefect((cause) =>
        Effect.fail(new CatalogImportDefect({ cause }))
      )
    ),
    importSelectedCatalogFoods: (input: {
      readonly catalogJson: string;
      readonly selectedFoodIds: readonly Domain.FoodId[];
    }) =>
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
        const importedCatalog = yield* transfers.importSelectedFromJson({
          input: {
            json: input.catalogJson,
            selectedFoodIds: input.selectedFoodIds,
          },
        });

        return {
          message: `Imported ${importedCatalog.importedFoods.length} foods.`,
        };
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new CatalogImportDefect({ cause }))
        )
      ),
  },
  branches: {
    preview: {
      canceled: { target: targets.root.Idle },
      previewed: { target: targets.root.CatalogPreview },
    },
    toggle: {
      selected: { update: targets.root.CatalogPreview },
      ignored: { none: true },
    },
  },
}).handle({
  initial: { target: targets.root.Idle },
  states: {
    Idle: {
      on: {
        openPreviewCatalogImportFile: { target: targets.root.ImportingPreview },
      },
    },
    ImportingPreview: {
      invoke: {
        src: "previewCatalogImportFile",
        onDone: {
          branches: "preview",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                Canceled: () => select.canceled(),
                Previewed: ({ catalogJson, candidates, selectedFoodIds }) =>
                  select.previewed({
                    data: {
                      catalogJson,
                      previewCandidates: candidates,
                      selectedFoodIds: HashSet.fromIterable(selectedFoodIds),
                    },
                    states: { SelectFoods: {} },
                  }),
              })
            ),
        },
        onFailure: {
          target: targets.root.ImportingPreviewError,
          data: ({ error }) => ({
            message: Match.value(error).pipe(
              Match.tagsExhaustive({
                BackupFileTransferError: (e) => e.detail,
                GzipError: (e) => e.detail,
                FoodCatalogShareDecodeError: (e) => e.detail,
                FoodCatalogIntegrityError: (e) => e.detail,
                SchemaError: () => "The catalog file is invalid.",
                NutritionStoreError: () => "Could not read your local catalog.",
                CatalogImportDefect: () =>
                  "The catalog preview could not finish.",
              })
            ),
          }),
        },
      },
    },
    ImportingPreviewError: {
      on: {
        openPreviewCatalogImportFile: { target: targets.root.ImportingPreview },
      },
    },
    CatalogPreview: {
      initial: { target: targets.root.CatalogPreview.SelectFoods },
      onDone: { target: targets.root.Idle },
      on: {
        toggleCatalogFood: {
          branches: "toggle",
          resolve: ({ state, event, select }) => {
            const candidate = Array.findFirst(
              state.previewCandidates,
              (candidate) => candidate.food.id === event.foodId
            );
            return Option.isSome(candidate) &&
              candidate.value.selection.selectable
              ? select.selected({
                  data: {
                    ...state,
                    selectedFoodIds: HashSet.has(
                      state.selectedFoodIds,
                      event.foodId
                    )
                      ? HashSet.remove(state.selectedFoodIds, event.foodId)
                      : HashSet.add(state.selectedFoodIds, event.foodId),
                  },
                })
              : select.ignored();
          },
        },
      },
      states: {
        SelectFoods: {
          on: {
            importSelectedCatalogFoods: {
              target: targets.root.CatalogPreview.ImportingCatalog,
            },
          },
        },
        ImportingCatalog: {
          invoke: {
            src: "importSelectedCatalogFoods",
            input: ({ containingState }) => ({
              catalogJson: containingState.catalogJson,
              selectedFoodIds: globalThis.Array.from(
                containingState.selectedFoodIds
              ),
            }),
            onDone: {
              target: targets.root.CatalogPreview.Success,
              data: ({ output }) => output,
            },
            onFailure: {
              target: targets.root.CatalogPreview.Error,
              data: ({ error }) => ({
                message: Match.value(error).pipe(
                  Match.tagsExhaustive({
                    FoodCatalogImportSelectionError: (e) => e.detail,
                    FoodCatalogIntegrityError: (e) => e.detail,
                    SchemaError: () => "The catalog selection is invalid.",
                    NutritionStoreError: () =>
                      "Could not save foods to your local catalog.",
                    CatalogImportDefect: () =>
                      "The catalog import could not finish.",
                  })
                ),
              }),
            },
          },
        },
        Error: {
          on: {
            importSelectedCatalogFoods: {
              target: targets.root.CatalogPreview.ImportingCatalog,
            },
          },
        },
        Success: {
          invoke: {
            src: "importCatalogSuccess",
            onDone: { target: targets.root.CatalogPreview.ImportCompleted },
          },
        },
        ImportCompleted: {},
      },
    },
  },
});

const BackupImportMimeTypes = [
  "application/gzip",
  "application/json",
  "application/octet-stream",
  "application/x-gzip",
  "text/plain",
] as const;
