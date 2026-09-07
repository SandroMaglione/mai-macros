import { Array, Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import {
  AnalysisData,
  TableSchemas,
} from "@mai/nutrition/services/analysis-schema";
import {
  AnalysisExportError,
  makeJsonSchema,
} from "@mai/nutrition/services/analysis-documentation";
import type { AnalysisDatabaseInput } from "@mai/nutrition/services/analysis-database";

const ColumnShape = Schema.Struct({
  type: Schema.optional(Schema.String),
  anyOf: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.String }))),
});
const json = Schema.fromJsonString(Schema.Unknown);

export const writeAnalysisDatabase = Effect.fn("writeAnalysisDatabase")(
  function* (input: AnalysisDatabaseInput) {
    const sql = yield* SqlClient.SqlClient;
    const data = yield* Schema.encodeEffect(AnalysisData)(input.data);
    const existing = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: Schema.Struct({ name: Schema.String }),
      execute: () =>
        sql`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    })(undefined);
    if (Array.isArrayNonEmpty(existing))
      return yield* new AnalysisExportError({
        detail: "Analysis export requires a new empty database.",
      });
    yield* sql`PRAGMA journal_mode = DELETE`;
    yield* sql`PRAGMA foreign_keys = ON`;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const [name, rowSchema] of Object.entries(TableSchemas)) {
          const metadata =
            Schema.resolveAnnotations(rowSchema)?.["x-mai-table"];
          if (metadata === undefined)
            return yield* new AnalysisExportError({
              detail: `Missing table metadata for ${name}.`,
            });
          const columns = [];
          const foreignKeys = [];
          for (const [column, field] of Object.entries(rowSchema.fields)) {
            const shape = yield* Schema.decodeUnknownEffect(ColumnShape)(
              makeJsonSchema(field)
            );
            const nullable =
              shape.anyOf?.some((item) => item.type === "null") ?? false;
            const type =
              shape.type ??
              shape.anyOf?.find((item) => item.type !== "null")?.type;
            const sqlType =
              type === "string"
                ? sql`TEXT`
                : type === "integer"
                  ? sql`INTEGER`
                  : type === "number"
                    ? sql`REAL`
                    : undefined;
            if (sqlType === undefined)
              return yield* new AnalysisExportError({
                detail: `Unsupported analysis column ${name}.${column}.`,
              });
            columns.push(
              sql`${sql(column)} ${sqlType} ${nullable ? sql`` : sql`NOT NULL`}`
            );
            const reference =
              Schema.resolveAnnotations(field)?.["x-mai-references"];
            if (reference !== undefined) {
              const [table, target] = reference.split(".");
              if (table === undefined || target === undefined)
                return yield* new AnalysisExportError({
                  detail: `Invalid reference on ${name}.${column}.`,
                });
              if (table !== name)
                foreignKeys.push(
                  sql`FOREIGN KEY (${sql(column)}) REFERENCES ${sql(table)} (${sql(target)})`
                );
            }
          }
          yield* sql`CREATE TABLE ${sql(name)} ${sql.join(", ")([...columns, ...foreignKeys, sql`PRIMARY KEY (${sql.join(", ", false)(metadata.primaryKey.map((key) => sql`${sql(key)}`))})`])} STRICT`;
          for (const [index, fields] of (metadata.indexes ?? []).entries()) {
            yield* sql`CREATE INDEX ${sql(`${name}_index_${index}`)} ON ${sql(name)} (${sql.join(", ", false)(fields.map((field) => sql`${sql(field)}`))})`;
          }
        }
        for (const [name, rows] of Object.entries(data)) {
          const values: readonly (typeof AnalysisData.Encoded)[keyof typeof AnalysisData.Encoded][number][] =
            rows;
          for (const batch of Array.chunksOf(values, 40)) {
            yield* sql`INSERT INTO ${sql(name)} ${sql.insert(batch)}`;
            yield* Effect.yieldNow;
          }
        }
        yield* sql`CREATE TABLE documentation (name TEXT PRIMARY KEY NOT NULL, content TEXT NOT NULL) STRICT`;
        const documents = [
          {
            name: "schema.json",
            content: yield* Schema.encodeEffect(json)(
              input.documentation.schema
            ),
          },
          {
            name: "backup.schema.json",
            content: yield* Schema.encodeEffect(json)(
              input.documentation.backupSchema
            ),
          },
          { name: "README.md", content: input.documentation.guide },
          {
            name: "queries.json",
            content: yield* Schema.encodeEffect(json)(
              input.documentation.queries
            ),
          },
          { name: "export.json", content: input.metadataJson },
        ];
        yield* sql`INSERT INTO documentation ${sql.insert(documents)}`;
      })
    );
    const result = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: Schema.Struct({ integrity_check: Schema.String }),
      execute: () => sql`PRAGMA integrity_check`,
    })(undefined);
    if (
      result.some((row) => row.integrity_check !== "ok") ||
      Array.isArrayEmpty(result)
    )
      return yield* new AnalysisExportError({
        detail: "The analysis database failed its integrity check.",
      });
  }
);
