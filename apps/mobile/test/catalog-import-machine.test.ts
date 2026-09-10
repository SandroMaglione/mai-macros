import assert from "node:assert/strict";
import { test } from "node:test";
import { Domain, FoodCatalogTransfer } from "@mai/nutrition";
import { BackupFileTransfer, Gzip } from "@mai/services";
import { Machine } from "@typeonce/effect-machine";
import { Deferred, Effect, Layer, Predicate, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import {
  catalogImportMachine,
  CatalogImportEvents,
} from "../src/lib/catalog-import-machine";

const id = "9535a059-a61f-42e1-a2e0-35ec87203c24";
const catalogJson = `{"format": "mai.food-catalog", "formatVersion": 1, "source": {"databaseName": "mai", "databaseVersion": 7, "exportedAt": 0}, "integrity": {"counts": {"foods": 1}}, "stores": {"foods": [{"id": "9535a059-a61f-42e1-a2e0-35ec87203c24", "name": "Rice", "origin": "user", "nutritionReference": {"amount": 100, "unit": "g"}, "energyKcal": 100, "proteinGrams": 4, "carbsGrams": 12, "fatGrams": 1, "portions": [], "createdAt": 0, "updatedAt": 0}]}}`;

const fixture = Schema.decodeEffect(
  Schema.fromJsonString(FoodCatalogTransfer.MaiFoodCatalogV1)
)(catalogJson);

const start = Machine.start(catalogImportMachine);
function _wait({
  ref,
  path,
}: {
  ref: Effect.Success<typeof start>;
  path:
    | "Idle"
    | "CatalogPreview.SelectFoods"
    | "CatalogPreview.Error"
    | "CatalogPreview.Success";
}) {
  return ref.changes.pipe(
    Stream.filter((snapshot) =>
      Machine.configuration(catalogImportMachine, snapshot.state).some(
        (node) => node.path === path
      )
    ),
    Stream.take(1),
    Stream.runDrain
  );
}

for (const canceled of [true, false]) {
  test(
    `catalog preview ${canceled ? "cancellation returns to Idle" : "enters nested selection; failed import retries and completes after timer"}`,
    { timeout: 10000 },
    async () => {
      const catalog = await Effect.runPromise(fixture);
      const foodId = await Effect.runPromise(
        Schema.decodeEffect(Domain.FoodId)(id)
      );
      const picked = await Effect.runPromise(Deferred.make<void>());
      let attempts = 0;
      let picks = 0;
      const importedInputs: FoodCatalogTransfer.ImportSelectedFoodCatalogJsonInput[] =
        [];
      const services = Layer.mergeAll(
        Gzip.Gzip.Default,
        Layer.succeed(BackupFileTransfer.BackupFileTransfer, {
          pickFile: () =>
            Effect.gen(function* () {
              picks++;
              yield* Deferred.succeed(picked, undefined);
              return yield* Effect.succeed(
                canceled
                  ? new BackupFileTransfer.BackupFilePickCanceled()
                  : new BackupFileTransfer.PickedBackupFile({
                      bytes: new TextEncoder().encode(catalogJson),
                      fileName: "catalog.json",
                      uri: "test://catalog",
                    })
              );
            }),
          shareFile: () => Effect.die("Unexpected share"),
        }),
        Layer.succeed(FoodCatalogTransfer.FoodCatalogTransfers, {
          exportToJson: () => Effect.die("Unexpected export"),
          previewImportFromJson: () =>
            Effect.succeed(
              new FoodCatalogTransfer.PreviewedFoodCatalogImport({
                catalog,
                candidates: catalog.stores.foods.map((food) => ({
                  food,
                  nameStatus: "unique",
                  sameNameLocalFoodIds: [],
                  status: "new",
                  selection: {
                    selectable: true,
                    defaultSelected: true,
                    reasons: [],
                  },
                })),
              })
            ),
          importSelectedFromJson: ({ input }) =>
            Effect.suspend(() => {
              importedInputs.push(input);
              attempts++;
              return attempts === 1
                ? Effect.fail(
                    new FoodCatalogTransfer.FoodCatalogImportSelectionError({
                      detail: "Retry this selection",
                      foodId: foodId,
                      reason: "selected-food-missing",
                    })
                  )
                : Effect.succeed(
                    new FoodCatalogTransfer.ImportedFoodCatalog({
                      catalog,
                      importedFoods: [],
                    })
                  );
            }),
        })
      );
      await Effect.runPromise(
        Effect.gen(function* () {
          const ref = yield* start;
          yield* ref.send(CatalogImportEvents.openPreviewCatalogImportFile());
          yield* Deferred.await(picked);
          if (canceled) {
            yield* _wait({ ref, path: "Idle" });
            assert.equal(picks, 1);
            assert.equal(attempts, 0);
            return;
          }
          yield* _wait({ ref, path: "CatalogPreview.SelectFoods" });
          const preview = yield* Machine.encodeSnapshot(
            catalogImportMachine,
            yield* ref.state
          );
          assert.deepEqual(
            preview.active.find((node) => node.path === ""),
            { path: "" }
          );
          yield* ref.send(CatalogImportEvents.importSelectedCatalogFoods());
          yield* _wait({ ref, path: "CatalogPreview.Error" });
          const failed = yield* Machine.encodeSnapshot(
            catalogImportMachine,
            yield* ref.state
          );
          assert.deepEqual(
            failed.active.find((node) => node.path === "CatalogPreview"),
            preview.active.find((node) => node.path === "CatalogPreview")
          );
          assert.deepEqual(
            failed.active.find((node) => node.path === "CatalogPreview.Error"),
            {
              path: "CatalogPreview.Error",
              value: { _tag: "Error", message: "Retry this selection" },
            }
          );
          yield* ref.send(CatalogImportEvents.importSelectedCatalogFoods());
          yield* _wait({ ref, path: "CatalogPreview.Success" });
          assert.equal(importedInputs.length, 2);
          for (const input of importedInputs) {
            assert.deepEqual(input.selectedFoodIds, [id]);
            const decoded = yield* Schema.decodeEffect(
              Schema.fromJsonString(FoodCatalogTransfer.MaiFoodCatalogV1)
            )(input.json);
            assert.deepEqual(decoded, catalog);
          }
          yield* TestClock.adjust(2999);
          assert.equal(
            Machine.configuration(catalogImportMachine, yield* ref.state).some(
              (node) => node.path === "CatalogPreview.Success"
            ),
            true
          );
          yield* TestClock.adjust(1);
          yield* _wait({ ref, path: "Idle" });
          const completed = yield* Machine.encodeSnapshot(
            catalogImportMachine,
            yield* ref.state
          );
          assert.deepEqual(completed.active, [{ path: "" }, { path: "Idle" }]);
        }).pipe(
          Effect.scoped,
          Effect.provide(services),
          Effect.provide(TestClock.layer())
        )
      );
    }
  );
}

test("selection updates retain the error child and ignore unknown foods", async () => {
  const catalog = await Effect.runPromise(fixture);
  const foodId = await Effect.runPromise(
    Schema.decodeEffect(Domain.FoodId)(id)
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* Machine.decodeSnapshot(catalogImportMachine, {
        version: 2,
        _tag: "MachineSnapshot",
        active: [
          { path: "" },
          {
            path: "CatalogPreview",
            value: {
              _tag: "CatalogPreview",
              catalogJson,
              selectedFoodIds: [id],
              previewCandidates: [
                {
                  food: (yield* Schema.encodeEffect(
                    FoodCatalogTransfer.MaiFoodCatalogV1
                  )(catalog)).stores.foods[0],
                  nameStatus: "unique",
                  sameNameLocalFoodIds: [],
                  status: "new",
                  selection: {
                    selectable: true,
                    defaultSelected: true,
                    reasons: [],
                  },
                },
              ],
            },
          },
          {
            path: "CatalogPreview.Error",
            value: { _tag: "Error", message: "Retry this selection" },
          },
        ],
      });
      const changed = yield* Machine.plan(
        catalogImportMachine,
        state,
        CatalogImportEvents.toggleCatalogFood({
          foodId: foodId,
        })
      );
      const encoded = yield* Machine.encodeSnapshot(
        catalogImportMachine,
        changed.next
      );
      assert.deepEqual(
        encoded.active.find((node) => node.path === "CatalogPreview.Error"),
        {
          path: "CatalogPreview.Error",
          value: { _tag: "Error", message: "Retry this selection" },
        }
      );
      const previewValue = encoded.active.find(
        (node) => node.path === "CatalogPreview"
      )?.value;
      assert.ok(Predicate.hasProperty(previewValue, "selectedFoodIds"));
      assert.deepEqual(previewValue.selectedFoodIds, []);
      const unknown = yield* Schema.decodeEffect(Domain.FoodId)(
        "9535a059-a61f-42e1-a2e0-35ec87203c25"
      );
      const ignored = yield* Machine.plan(
        catalogImportMachine,
        changed.next,
        CatalogImportEvents.toggleCatalogFood({ foodId: unknown })
      );
      assert.deepEqual(ignored.next, changed.next);
    })
  );
});
