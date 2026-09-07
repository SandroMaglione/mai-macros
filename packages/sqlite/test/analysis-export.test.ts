import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteClient as NodeSqlite } from "@effect/sql-sqlite-node";
import { Crypto, Effect, Layer, Schema } from "effect";
import * as Sql from "effect/unstable/sql/SqlClient";
import { assert, describe, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { exportForAnalysis } from "@mai/services/services/analysis-export";
import { AnalysisDatabase } from "@mai/nutrition/services/analysis-database";
import {
  AnalysisExportError,
  makeAnalysisDocumentation,
} from "@mai/nutrition/services/analysis-documentation";
import { buildAnalysisData } from "@mai/nutrition/services/analysis-data";
import { AppDataStore } from "@mai/nutrition/services/app-data-store";
import { Backups, MaiBackupV1 } from "@mai/nutrition/services/backup";
import {
  loadAnalysisFixture,
  multiYearAnalysisFixture,
} from "../../nutrition/test/analysis-fixture.ts";
import { writeAnalysisDatabase } from "../src/layers/analysis-export.ts";

const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes,
    digest: (algorithm, bytes) =>
      Effect.succeed(
        new Uint8Array(
          createHash(algorithm.toLowerCase().replace("-", ""))
            .update(bytes)
            .digest()
        )
      ),
  })
);

describe("analysis SQLite archive", () => {
  it("exports five years of daily logs without losing entries or changing totals", async () => {
    const backup = await Effect.runPromise(
      Schema.decodeEffect(MaiBackupV1)(multiYearAnalysisFixture())
    );
    const data = await Effect.runPromise(buildAnalysisData(backup));
    const documentation = await Effect.runPromise(makeAnalysisDocumentation());
    assert.equal(data.days.length, 1827);
    assert.equal(data.entries.length, 9135);
    assert.equal(data.entry_nutrients.length, 73080);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeAnalysisDatabase({
          data,
          documentation,
          metadataJson: "{}",
        });
        const sql = yield* Sql.SqlClient;
        assert.deepEqual(yield* sql`SELECT COUNT(*) AS n FROM entries`, [
          { n: 9135 },
        ]);
        assert.deepEqual(
          yield* sql`SELECT MIN(knownTotal) AS minimum, MAX(knownTotal) AS maximum FROM daily_nutrients WHERE nutrient = 'energyKcal'`,
          [{ minimum: 1660, maximum: 1660 }]
        );
      }).pipe(
        Effect.provide(
          NodeSqlite.layer({ filename: ":memory:", disableWAL: true })
        )
      )
    );
  }, 30000);

  it("exports one snapshot, verifies checksums, reopens standalone SQLite, and executes documented queries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mai-analysis-test-"));
    await Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.succeed(directory),
        () =>
          Effect.tryPromise(async () => {
            const filename = join(directory, "analysis.sqlite");
            const backup = await loadAnalysisFixture();
            let reads = 0;
            const store = Layer.succeed(
              AppDataStore,
              AppDataStore.of({
                readStores: Effect.sync(() => {
                  reads++;
                  return backup.stores;
                }),
                replaceStores: () =>
                  Effect.die("Export must never write source stores"),
              })
            );
            const renderer = Layer.succeed(
              AnalysisDatabase,
              AnalysisDatabase.of({
                render: (input) =>
                  writeAnalysisDatabase(input).pipe(
                    Effect.provide(
                      NodeSqlite.layer({ filename, disableWAL: true })
                    ),
                    Effect.andThen(Effect.tryPromise(() => readFile(filename))),
                    Effect.mapError(
                      (cause) =>
                        new AnalysisExportError({
                          detail: "Test rendering failed",
                          cause,
                        })
                    )
                  ),
              })
            );
            const exported = await Effect.runPromise(
              exportForAnalysis().pipe(
                Effect.provide(Backups.layer),
                Effect.provide(Layer.mergeAll(store, renderer, cryptoLayer))
              )
            );
            assert.equal(reads, 1);
            const files = unzipSync(exported.bytes);
            assert.deepEqual(Object.keys(files).sort(), [
              "README.md",
              "analysis.sqlite",
              "backup.json",
              "backup.schema.json",
              "manifest.json",
              "schema.json",
            ]);
            const bytesFor = (name: string) => {
              const bytes = files[name];
              if (bytes === undefined) throw new Error(`Missing ${name}`);
              return bytes;
            };
            const manifest = await Effect.runPromise(
              Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    exportId: Schema.String,
                    files: Schema.Array(
                      Schema.Struct({
                        name: Schema.String,
                        bytes: Schema.Number,
                        sha256: Schema.String,
                      })
                    ),
                  })
                )
              )(strFromU8(bytesFor("manifest.json")))
            );
            for (const file of manifest.files) {
              assert.equal(bytesFor(file.name).byteLength, file.bytes);
              assert.equal(
                createHash("sha256").update(bytesFor(file.name)).digest("hex"),
                file.sha256
              );
            }
            const reopenedPath = join(directory, "reopened.sqlite");
            await writeFile(reopenedPath, bytesFor("analysis.sqlite"));
            const reopened = new DatabaseSync(reopenedPath, { readOnly: true });
            await Effect.runPromise(
              Effect.acquireUseRelease(
                Effect.succeed(reopened),
                () =>
                  Effect.tryPromise(async () => {
                    assert.equal(
                      reopened.prepare("PRAGMA integrity_check").get()
                        ?.integrity_check,
                      "ok"
                    );
                    const docs = await Effect.runPromise(
                      makeAnalysisDocumentation()
                    );
                    for (const query of docs.queries)
                      assert.isArray(reopened.prepare(query.sql).all());
                    const monthly = reopened.prepare(docs.queries[0].sql).get();
                    assert.equal(monthly?.calendar_days, 6);
                    assert.equal(monthly?.days_with_entries, 1);
                    assert.equal(monthly?.eating_days_without_entries, 1);
                    assert.equal(monthly?.days_with_known_logged_energy, 1);
                    assert.equal(monthly?.mean_known_logged_energy_kcal, 940);
                    assert.deepEqual(
                      reopened.prepare("PRAGMA foreign_key_check").all(),
                      []
                    );
                    assert.equal(
                      reopened
                        .prepare("SELECT COUNT(*) AS n FROM source_records")
                        .get()?.n,
                      12
                    );
                    assert.equal(
                      reopened
                        .prepare(
                          "SELECT content FROM documentation WHERE name = 'schema.json'"
                        )
                        .get()?.content,
                      strFromU8(bytesFor("schema.json"))
                    );
                    assert.include(
                      String(
                        reopened
                          .prepare(
                            "SELECT content FROM documentation WHERE name = 'export.json'"
                          )
                          .get()?.content
                      ),
                      manifest.exportId
                    );
                    const restored = await Effect.runPromise(
                      Schema.decodeEffect(Schema.fromJsonString(MaiBackupV1))(
                        strFromU8(bytesFor("backup.json"))
                      )
                    );
                    assert.deepEqual(restored.stores, backup.stores);
                  }),
                () => Effect.sync(() => reopened.close())
              )
            );
          }),
        () =>
          Effect.promise(() => rm(directory, { recursive: true, force: true }))
      )
    );
  });

  it("refuses to write into an existing database and leaves its records unchanged", async () => {
    const backup = await loadAnalysisFixture();
    const data = await Effect.runPromise(buildAnalysisData(backup));
    const documentation = await Effect.runPromise(makeAnalysisDocumentation());
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* Sql.SqlClient;
        yield* sql`CREATE TABLE diary (value TEXT)`;
        yield* sql`INSERT INTO diary VALUES ('keep me')`;
        const error = yield* writeAnalysisDatabase({
          data,
          documentation,
          metadataJson: "{}",
        }).pipe(Effect.flip);
        return { error, rows: yield* sql`SELECT * FROM diary` };
      }).pipe(
        Effect.provide(
          NodeSqlite.layer({ filename: ":memory:", disableWAL: true })
        )
      )
    );
    assert.instanceOf(result.error, AnalysisExportError);
    assert.deepEqual(result.rows, [{ value: "keep me" }]);
  });

  it("rolls back a failed export and can retry on the same empty temporary database", async () => {
    const data = await Effect.runPromise(
      buildAnalysisData(await loadAnalysisFixture())
    );
    const documentation = await Effect.runPromise(makeAnalysisDocumentation());
    const first = data.entries[0];
    assert.isDefined(first);
    if (first === undefined) return;
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* Sql.SqlClient;
        yield* writeAnalysisDatabase({
          data: { ...data, entries: [...data.entries, first] },
          documentation,
          metadataJson: "{}",
        }).pipe(Effect.flip);
        const tables =
          yield* sql`SELECT name FROM sqlite_schema WHERE type = 'table'`;
        assert.deepEqual(tables, []);
        yield* writeAnalysisDatabase({
          data,
          documentation,
          metadataJson: "{}",
        });
        const count = yield* sql`SELECT COUNT(*) AS n FROM entries`;
        assert.deepEqual(count, [{ n: 2 }]);
      }).pipe(
        Effect.provide(
          NodeSqlite.layer({ filename: ":memory:", disableWAL: true })
        )
      )
    );
  });
});
