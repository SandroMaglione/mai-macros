import { DateTime, Effect, Schema } from "effect";
import { Digest, SecureRandom } from "effect/crypto";
import { strToU8, zipSync } from "fflate";
import { Backups } from "@mai/nutrition/services/backup";
import { buildAnalysisData } from "@mai/nutrition/services/analysis-data";
import { AnalysisDatabase } from "@mai/nutrition/services/analysis-database";
import {
  AnalysisExportError,
  makeAnalysisDocumentation,
} from "@mai/nutrition/services/analysis-documentation";
import { AnalysisVersion } from "@mai/nutrition/services/analysis-schema";

const json = Schema.fromJsonString(Schema.Unknown);

export const exportForAnalysis = Effect.fn("exportForAnalysis")(function* () {
  const backups = yield* Backups;
  const database = yield* AnalysisDatabase;
  const crypto = yield* SecureRandom.SecureRandom;
  const digester = yield* Digest.Digest;
  const snapshot = yield* backups.exportToJson();
  const data = yield* buildAnalysisData(snapshot.backup);
  const documentation = yield* makeAnalysisDocumentation();
  const metadata = {
    format: "mai.analysis",
    formatVersion: AnalysisVersion,
    calculationVersion: AnalysisVersion,
    exportId: yield* crypto.uuidV4(),
    exportedAt: DateTime.formatIso(snapshot.backup.source.exportedAt),
    backupFormatVersion: snapshot.backup.formatVersion,
    sourceDatabaseVersion: snapshot.backup.source.databaseVersion,
    dateRange: {
      start: data.days[0]?.date ?? null,
      end: data.days[data.days.length - 1]?.date ?? null,
    },
    sourceCounts: snapshot.backup.integrity.counts,
    analysisCounts: Object.fromEntries(
      Object.entries(data).map(([name, rows]) => [name, rows.length])
    ),
    calculationBasis:
      "MAI export-time catalog and plans; stored entry multipliers and nutrient corrections. No reconstruction of earlier catalog versions.",
  };
  const metadataJson = yield* Schema.encodeEffect(json)(metadata);
  const sqlite = yield* database.render({ data, documentation, metadataJson });
  const files: Record<string, Uint8Array> = {
    "analysis.sqlite": sqlite,
    "backup.json": strToU8(snapshot.json),
    "schema.json": strToU8(
      yield* Schema.encodeEffect(json)(documentation.schema)
    ),
    "backup.schema.json": strToU8(
      yield* Schema.encodeEffect(json)(documentation.backupSchema)
    ),
    "README.md": strToU8(documentation.guide),
  };
  const checksums: {
    readonly name: string;
    readonly bytes: number;
    readonly sha256: string;
  }[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    checksums.push({
      name,
      bytes: bytes.byteLength,
      sha256: yield* digester.digestHex(Digest.sha256, bytes),
    });
  }
  files["manifest.json"] = strToU8(
    yield* Schema.encodeEffect(json)({ ...metadata, files: checksums })
  );
  yield* Effect.yieldNow;
  const bytes = yield* Effect.try({
    try: () => zipSync(files, { level: 1 }),
    catch: (cause) =>
      new AnalysisExportError({
        detail: "Could not package the analysis export.",
        cause,
      }),
  });
  return {
    bytes,
    fileName: `mai-analysis-${metadata.exportedAt.slice(0, 10)}-${metadata.exportId}.zip`,
  };
});
