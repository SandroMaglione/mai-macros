import { describe, expect, it } from "@effect/vitest";
import {
  AppDataStore,
  Backup,
  Domain,
  FoodCatalogTransfer,
  Store,
} from "@mai/nutrition";
import { AnalysisDatabase } from "@mai/nutrition/services/analysis-database";
import { AnalysisExportError } from "@mai/nutrition/services/analysis-documentation";
import { BackupFileTransfer, Gzip } from "@mai/services";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Array, Effect, Layer, Option, Schema } from "effect";
import { Digest, SecureRandom } from "effect/crypto";
import { TestClock } from "effect/testing";

import {
  AnalysisExportEvents,
  AnalysisExportMachine,
  AnalysisExportStates,
  BackupExportEvents,
  BackupExportMachine,
  BackupExportStates,
  BackupImportEvents,
  BackupImportMachine,
  BackupImportStates,
  CatalogExportEvents,
  CatalogExportMachine,
  CatalogExportStates,
  CatalogImportEvents,
  CatalogImportMachine,
  CatalogImportStates,
} from "@/machines/backup-machine";

type FakeDevice = {
  readonly foods: Domain.Food[];
  readonly picks: Effect.Effect<
    BackupFileTransfer.BackupFilePickResult,
    BackupFileTransfer.BackupFileTransferError
  >[];
  readonly replacedStores: AppDataStore.AppDataStores[];
  readonly shared: BackupFileTransfer.ShareBackupFileInput[];
  readonly upsertedFoods: Domain.Food[];
};

const _makeDevice = (): FakeDevice => ({
  foods: [],
  picks: [],
  replacedStores: [],
  shared: [],
  upsertedFoods: [],
});

const _food = Schema.decodeUnknownEffect(Domain.Food)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Overnight oats",
  origin: "user",
  energyKcal: 350,
  proteinGrams: 12,
  carbsGrams: 55,
  fatGrams: 8,
  createdAt: 100,
  updatedAt: 100,
});

const _emptyStores: AppDataStore.AppDataStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
  recordableEvents: [],
  recordedEvents: [],
};

const _backupServices = Layer.mergeAll(
  Backup.Backups.layer,
  FoodCatalogTransfer.FoodCatalogTransfers.layer
);

const _servicesLayer = ({
  device,
  readStores = Effect.succeed(_emptyStores),
}: {
  readonly device: FakeDevice;
  readonly readStores?: Effect.Effect<
    AppDataStore.AppDataStores,
    AppDataStore.AppDataStoreError
  >;
}) =>
  Layer.provideMerge(
    _backupServices,
    Layer.mergeAll(
      Layer.mock(AppDataStore.AppDataStore, {
        readStores,
        replaceStores: (stores) =>
          Effect.sync(() => device.replacedStores.push(stores)),
      }),
      Layer.mock(Store.NutritionStore, {
        listFoods: Effect.sync(() => [...device.foods]),
        upsertFoods: (foods) =>
          Effect.sync(() => device.upsertedFoods.push(...foods)),
      }),
      Layer.mock(BackupFileTransfer.BackupFileTransfer, {
        pickFile: () =>
          Effect.suspend(
            () =>
              device.picks.shift() ??
              Effect.succeed(new BackupFileTransfer.BackupFilePickCanceled())
          ),
        shareFile: (file) =>
          Effect.sync(() => {
            device.shared.push(file);

            return new BackupFileTransfer.SharedBackupFile({
              fileName: file.fileName,
            });
          }),
      }),
      Layer.mock(AnalysisDatabase, {
        render: () => Effect.succeed(new Uint8Array([1, 2, 3])),
      }),
      Layer.succeed(
        SecureRandom.SecureRandom,
        SecureRandom.make((size) =>
          crypto.getRandomValues(new Uint8Array(size))
        )
      ),
      Digest.layerWebCrypto,
      Gzip.Gzip.Default
    )
  );

const _misses = ({
  transitions,
}: {
  readonly transitions: {
    readonly definitions: {
      readonly misses: readonly {
        readonly source: string;
        readonly trigger: { readonly type: string };
      }[];
    };
  };
}) =>
  transitions.definitions.misses.map(
    ({ source, trigger }) => `${source}:${trigger.type}`
  );

describe("AnalysisExportMachine", () => {
  it.effect("exports again from every settled state", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(AnalysisExportMachine, {
        events: [AnalysisExportEvents.Export(), AnalysisExportEvents.Export()],
      });

      yield* MachineTest.verify(AnalysisExportMachine, trace);
      expect(trace.finalConfiguration).toContain("Exporting");

      expect(
        _misses(MachineTest.coverage(AnalysisExportMachine, trace))
      ).toEqual([
        "Exporting:invoke",
        "Exporting:invoke",
        "Success:event",
        "Failed:event",
      ]);
    })
  );

  it.effect("shares the analysis archive and reports success", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      const machine = yield* Machine.start(AnalysisExportMachine);

      yield* machine.send(AnalysisExportEvents.Export());
      const success = yield* Machine.waitFor(machine, ({ state }) =>
        AnalysisExportStates.matches(state, "Success")
      );

      expect(
        Option.map(
          AnalysisExportStates.get(success.state, "Success"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Opened share options for your analysis export."));
      expect(device.shared.map(({ mimeType }) => mimeType)).toEqual([
        "application/zip",
      ]);
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });

  it.effect("shows the analysis export failure detail", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      const machine = yield* Machine.start(AnalysisExportMachine);

      yield* machine.send(AnalysisExportEvents.Export());
      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        AnalysisExportStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          AnalysisExportStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not render the analysis database."));
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          Layer.mock(AnalysisDatabase, {
            render: () =>
              Effect.fail(
                new AnalysisExportError({
                  detail: "Could not render the analysis database.",
                })
              ),
          }),
          _servicesLayer({ device })
        )
      ),
      Effect.scoped
    );
  });
});

describe("BackupExportMachine", () => {
  it.effect("keeps the backup name across states", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(BackupExportMachine, {
        events: [
          BackupExportEvents.ChangeBackupName({ backupName: "Weekly" }),
          BackupExportEvents.ExportBackup(),
          BackupExportEvents.ChangeBackupName({ backupName: "Weekly 2" }),
        ],
      });

      yield* MachineTest.verify(BackupExportMachine, trace);
      expect(trace.steps.map(({ after }) => after.state.path)).toEqual([
        "Idle",
        "Exporting",
        "Exporting",
      ]);
      expect(trace.final.value.backupName).toBe("Weekly 2");

      expect(_misses(MachineTest.coverage(BackupExportMachine, trace))).toEqual(
        [
          "Exporting:invoke",
          "Exporting:invoke",
          "Failed:event",
          "Success:invoke",
        ]
      );
    })
  );

  it.effect(
    "shares a gzip backup named after the input and hides the notice after 3 seconds",
    () => {
      const device = _makeDevice();

      return Effect.gen(function* () {
        const machine = yield* Machine.start(BackupExportMachine);

        yield* machine.send(
          BackupExportEvents.ChangeBackupName({ backupName: " My Backup! " })
        );
        yield* machine.send(BackupExportEvents.ExportBackup());
        const success = yield* Machine.waitFor(machine, ({ state }) =>
          BackupExportStates.matches(state, "Success")
        );
        const [shared] = device.shared;

        expect(shared?.fileName).toMatch(
          /^my-backup-format-v1-db-v\d+-1970-01-01\.json\.gz$/
        );
        expect(shared?.mimeType).toBe("application/gzip");
        expect(
          Option.map(
            BackupExportStates.get(success.state, "Success"),
            ({ message }) => message
          )
        ).toEqual(
          Option.some(`Opened share options for ${shared?.fileName ?? ""}.`)
        );

        yield* TestClock.adjust("2999 millis");
        expect(
          BackupExportStates.matches(yield* machine.state, "Success")
        ).toBe(true);
        yield* TestClock.adjust("1 millis");
        yield* Machine.waitFor(machine, ({ state }) =>
          BackupExportStates.matches(state, "Idle")
        );
      }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
    }
  );

  it.effect("falls back to a generic message for errors without detail", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      const machine = yield* Machine.start(BackupExportMachine);

      yield* machine.send(BackupExportEvents.ExportBackup());
      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        BackupExportStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          BackupExportStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("The backup action could not finish."));

      yield* machine.send(BackupExportEvents.ExportBackup());
      yield* Machine.waitFor(machine, ({ state }) =>
        BackupExportStates.matches(state, "Failed")
      );
    }).pipe(
      Effect.provide(
        _servicesLayer({
          device,
          readStores: Effect.fail(
            new AppDataStore.AppDataStoreError({ cause: "locked" })
          ),
        })
      ),
      Effect.scoped
    );
  });
});

describe("BackupImportMachine", () => {
  it.effect("starts importing from idle and retries after failure", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(BackupImportMachine, {
        events: [
          BackupImportEvents.ImportFile(),
          BackupImportEvents.ImportFile(),
        ],
      });

      yield* MachineTest.verify(BackupImportMachine, trace);
      expect(trace.finalConfiguration).toContain("ImportingFile");
      expect(_misses(MachineTest.coverage(BackupImportMachine, trace))).toEqual(
        [
          "ImportingFile:invoke",
          "ImportingFile:invoke",
          "Failed:event",
          "Success:invoke",
        ]
      );
    })
  );

  it.effect(
    "restores a picked backup file and reports the record count",
    () => {
      const device = _makeDevice();

      return Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const gzip = yield* Gzip.Gzip;
        const exported = yield* backups.exportToJson();
        const bytes = yield* gzip.gzipText({ text: exported.json });

        device.picks.push(
          Effect.succeed(
            new BackupFileTransfer.PickedBackupFile({
              bytes,
              fileName: "weekly.json.gz",
              uri: "file:///weekly.json.gz",
            })
          )
        );

        const machine = yield* Machine.start(BackupImportMachine);

        yield* machine.send(BackupImportEvents.ImportFile());
        const success = yield* Machine.waitFor(machine, ({ state }) =>
          BackupImportStates.matches(state, "Success")
        );

        expect(
          Option.map(
            BackupImportStates.get(success.state, "Success"),
            ({ message }) => message
          )
        ).toEqual(
          Option.some(
            `Imported weekly.json.gz. Imported backup. Format v1, database v${exported.backup.source.databaseVersion}, 0 records restored.`
          )
        );
        expect(device.replacedStores).toHaveLength(1);

        yield* TestClock.adjust("3 seconds");
        yield* Machine.waitFor(machine, ({ state }) =>
          BackupImportStates.matches(state, "Idle")
        );
      }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
    }
  );

  it.effect("reports a canceled pick as a success notice", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      const machine = yield* Machine.start(BackupImportMachine);

      yield* machine.send(BackupImportEvents.ImportFile());
      const success = yield* Machine.waitFor(machine, ({ state }) =>
        BackupImportStates.matches(state, "Success")
      );

      expect(
        Option.map(
          BackupImportStates.get(success.state, "Success"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Import canceled"));
      expect(device.replacedStores).toEqual([]);
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });

  it.effect("shows the file transfer failure detail", () => {
    const device = _makeDevice();

    device.picks.push(
      Effect.fail(
        new BackupFileTransfer.BackupFileTransferError({
          detail: "Could not open the file picker.",
          reason: "file-pick-failed",
        })
      )
    );

    return Effect.gen(function* () {
      const machine = yield* Machine.start(BackupImportMachine);

      yield* machine.send(BackupImportEvents.ImportFile());
      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        BackupImportStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          BackupImportStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not open the file picker."));
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });
});

describe("CatalogExportMachine", () => {
  it.effect("starts exporting from idle and retries after failure", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(CatalogExportMachine, {
        events: [CatalogExportEvents.ExportCatalog()],
      });

      yield* MachineTest.verify(CatalogExportMachine, trace);
      expect(trace.finalConfiguration).toContain("ExportingCatalog");
      expect(
        _misses(MachineTest.coverage(CatalogExportMachine, trace))
      ).toEqual([
        "ExportingCatalog:invoke",
        "ExportingCatalog:invoke",
        "Failed:event",
        "Success:invoke",
      ]);
    })
  );

  it.effect("shares the user food catalog and clears the notice", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      device.foods.push(yield* _food);

      const machine = yield* Machine.start(CatalogExportMachine);

      yield* machine.send(CatalogExportEvents.ExportCatalog());
      const success = yield* Machine.waitFor(machine, ({ state }) =>
        CatalogExportStates.matches(state, "Success")
      );
      const [shared] = device.shared;

      expect(shared?.fileName).toMatch(
        /^mai-food-catalog-format-v1-db-v\d+-1970-01-01\.json\.gz$/
      );
      expect(
        Option.map(
          CatalogExportStates.get(success.state, "Success"),
          ({ message }) => message
        )
      ).toEqual(
        Option.some(`Opened share options for ${shared?.fileName ?? ""}.`)
      );

      yield* TestClock.adjust("3 seconds");
      yield* Machine.waitFor(machine, ({ state }) =>
        CatalogExportStates.matches(state, "Idle")
      );
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });
});

const _selectedFoodIds = ({
  state,
}: {
  readonly state: Machine.Machine.Snapshot<
    Machine.Machine.States<typeof CatalogImportMachine>
  >;
}) =>
  Option.match(CatalogImportStates.get(state, "CatalogPreview"), {
    onNone: () => [],
    onSome: ({ selectedFoodIds }) => Array.fromIterable(selectedFoodIds),
  });

describe("CatalogImportMachine", () => {
  it.effect("opens the file picker from idle", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(CatalogImportMachine, {
        events: [
          CatalogImportEvents.OpenPreviewCatalogImportFile(),
          CatalogImportEvents.ImportSelectedCatalogFoods(),
        ],
      });

      yield* MachineTest.verify(CatalogImportMachine, trace);
      expect(trace.finalConfiguration).toContain("ImportingPreview");
      expect(
        _misses(MachineTest.coverage(CatalogImportMachine, trace))
      ).toEqual([
        "ImportingPreview:invoke",
        "ImportingPreview:invoke",
        "PreviewFailed:event",
        "CatalogPreview:event",
        "CatalogPreview.SelectFoods:event",
        "CatalogPreview.ImportingCatalog:invoke",
        "CatalogPreview.ImportingCatalog:invoke",
        "CatalogPreview.Failed:event",
        "CatalogPreview.Success:invoke",
      ]);
    })
  );

  it.effect("returns to idle when the pick is canceled", () => {
    const device = _makeDevice();

    return Effect.gen(function* () {
      const machine = yield* Machine.start(CatalogImportMachine);

      yield* machine.send(CatalogImportEvents.OpenPreviewCatalogImportFile());
      yield* Machine.waitFor(machine, ({ state }) =>
        CatalogImportStates.matches(state, "ImportingPreview")
      );
      yield* Machine.waitFor(machine, ({ state }) =>
        CatalogImportStates.matches(state, "Idle")
      );
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });

  it.effect(
    "previews a catalog file, toggles selectable foods and imports the selection",
    () => {
      const device = _makeDevice();

      return Effect.gen(function* () {
        const food = yield* _food;
        const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
        const gzip = yield* Gzip.Gzip;

        device.foods.push(food);
        const exported = yield* transfers.exportToJson();
        const bytes = yield* gzip.gzipText({ text: exported.json });

        device.foods.length = 0;
        device.picks.push(
          Effect.succeed(
            new BackupFileTransfer.PickedBackupFile({
              bytes,
              fileName: "catalog.json.gz",
              uri: "file:///catalog.json.gz",
            })
          )
        );

        const machine = yield* Machine.start(CatalogImportMachine);
        yield* machine.send(CatalogImportEvents.OpenPreviewCatalogImportFile());
        const preview = yield* Machine.waitFor(machine, ({ state }) =>
          CatalogImportStates.matches(state, "CatalogPreview.SelectFoods")
        );

        expect(
          Option.map(
            CatalogImportStates.get(preview.state, "CatalogPreview"),
            ({ previewCandidates }) =>
              previewCandidates.map((candidate) => candidate.food.id)
          )
        ).toEqual(Option.some([food.id]));
        expect(_selectedFoodIds(preview)).toEqual([food.id]);

        yield* machine.send(
          CatalogImportEvents.ToggleCatalogFood({ foodId: food.id })
        );
        yield* Machine.waitFor(
          machine,
          (snapshot) =>
            !Array.isReadonlyArrayNonEmpty(_selectedFoodIds(snapshot))
        );

        yield* machine.send(
          CatalogImportEvents.ToggleCatalogFood({
            foodId: Domain.FoodId.make("22222222-2222-4222-8222-222222222222"),
          })
        );
        yield* machine.send(
          CatalogImportEvents.ToggleCatalogFood({ foodId: food.id })
        );
        const reselected = yield* Machine.waitFor(machine, (snapshot) =>
          Array.isReadonlyArrayNonEmpty(_selectedFoodIds(snapshot))
        );

        expect(_selectedFoodIds(reselected)).toEqual([food.id]);

        yield* machine.send(CatalogImportEvents.ImportSelectedCatalogFoods());
        const success = yield* Machine.waitFor(machine, ({ state }) =>
          CatalogImportStates.matches(state, "CatalogPreview.Success")
        );

        expect(
          Option.map(
            CatalogImportStates.get(success.state, "CatalogPreview.Success"),
            ({ message }) => message
          )
        ).toEqual(Option.some("Imported 1 foods."));
        expect(device.upsertedFoods.map(({ id }) => id)).toEqual([food.id]);

        yield* TestClock.adjust("3 seconds");
        yield* Machine.waitFor(machine, ({ state }) =>
          CatalogImportStates.matches(state, "Idle")
        );
      }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
    }
  );

  it.effect("shows the preview failure detail for an invalid file", () => {
    const device = _makeDevice();

    device.picks.push(
      Effect.succeed(
        new BackupFileTransfer.PickedBackupFile({
          bytes: new TextEncoder().encode("not a catalog"),
          fileName: "catalog.txt",
          uri: "file:///catalog.txt",
        })
      )
    );

    return Effect.gen(function* () {
      const machine = yield* Machine.start(CatalogImportMachine);

      yield* machine.send(CatalogImportEvents.OpenPreviewCatalogImportFile());
      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        CatalogImportStates.matches(state, "PreviewFailed")
      );

      expect(
        Option.map(
          CatalogImportStates.get(failed.state, "PreviewFailed"),
          ({ message }) => message.startsWith("The text is not a supported")
        )
      ).toEqual(Option.some(true));
    }).pipe(Effect.provide(_servicesLayer({ device })), Effect.scoped);
  });
});
