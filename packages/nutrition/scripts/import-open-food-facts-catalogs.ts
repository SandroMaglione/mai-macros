import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Stats } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

import {
  Array as EffectArray,
  Data,
  DateTime,
  Effect,
  Option,
  Schema,
  Stream,
} from "effect";

import { FoodCatalogTransfer, Metadata } from "../src/index.ts";

type ImportErrorReason =
  | "catalog-config"
  | "catalog-output"
  | "cli-args"
  | "input-file"
  | "schema-validation"
  | "stream-read"
  | "tsv-header"
  | "tsv-row";

class OpenFoodFactsCatalogImportError extends Data.TaggedError(
  "OpenFoodFactsCatalogImportError"
)<{
  readonly cause?: unknown;
  readonly detail: string;
  readonly reason: ImportErrorReason;
}> {}

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

const PositiveInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);

const NonNegativeInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0)
);

const PauseCheckpoint = Schema.Literals([
  "before-write",
  "first-match",
  "header",
]);

const CatalogDefinitionSchema = Schema.Struct({
  countryTag: NonEmptyString,
  name: NonEmptyString,
  output: NonEmptyString,
  store: NonEmptyString,
});

const CatalogDefinitionsSchema = Schema.Array(CatalogDefinitionSchema);

const CliArgsSchema = Schema.Struct({
  catalogs: NonEmptyString,
  dryRun: Schema.Boolean,
  input: NonEmptyString,
  limit: Schema.optional(PositiveInteger),
  logEvery: PositiveInteger,
  maxInvalidFoods: NonNegativeInteger,
  maxMalformedRows: NonNegativeInteger,
  pauseAt: Schema.Array(PauseCheckpoint),
});

type CatalogDefinition = typeof CatalogDefinitionSchema.Type;
type CatalogFoodEncoded =
  FoodCatalogTransfer.MaiFoodCatalogEncoded["stores"]["foods"][number];
type CliArgs = typeof CliArgsSchema.Type;
type PauseCheckpoint = typeof PauseCheckpoint.Type;

type CliArgsInput = {
  readonly argv: readonly string[];
  readonly commandCwd: string;
};

type CatalogRun = {
  readonly definition: CatalogDefinition;
  readonly outputPath: string;
  readonly seenCodes: Set<string>;
  readonly stats: CatalogStats;
  readonly foods: CatalogFoodEncoded[];
};

type CatalogStats = {
  duplicateCodes: number;
  matchedRows: number;
  writtenFoods: number;
};

type Header = {
  readonly fields: readonly string[];
  readonly indexByName: ReadonlyMap<string, number>;
  readonly requiredFieldMaxIndex: number;
};

type ImportStats = {
  blankRows: number;
  columnMismatches: number;
  duplicateRows: number;
  invalidFoods: number;
  missingCode: number;
  missingName: number;
  missingRequiredMacros: number;
  rowsScanned: number;
  tsvMalformedRows: number;
  unmatchedRows: number;
};

type ImportState = {
  firstMatchPaused: boolean;
  header: Header | undefined;
  readonly runs: readonly CatalogRun[];
  readonly stats: ImportStats;
};

type OpenFoodFactsRow = {
  readonly cells: readonly string[];
  readonly header: Header;
};

type TsvParserState = {
  readonly field: string;
  readonly inQuotes: boolean;
  readonly pendingQuote: boolean;
  readonly row: readonly string[];
};

type TsvRecord =
  | {
      readonly _tag: "malformed";
      readonly detail: string;
    }
  | {
      readonly _tag: "row";
      readonly cells: readonly string[];
    };

type FoodConversion =
  | {
      readonly _tag: "converted";
      readonly code: string;
      readonly food: CatalogFoodEncoded;
    }
  | {
      readonly _tag: "skipped";
      readonly reason:
        | "missing-code"
        | "missing-name"
        | "missing-required-macros";
    };

const defaultInputPath =
  "data/open-food-facts/raw/en.openfoodfacts.org.products.csv.gz";

const defaultCatalogsPath = fileURLToPath(
  new URL("../open-food-facts-catalogs.json", import.meta.url)
);

const requiredHeaderFields = [
  "carbohydrates_100g",
  "code",
  "countries_tags",
  "fat_100g",
  "product_name",
  "proteins_100g",
  "stores",
];

const optionalHeaderFields = [
  "brands",
  "energy-kcal_100g",
  "energy-kj_100g",
  "fiber_100g",
  "saturated-fat_100g",
  "sodium_100g",
  "sugars_100g",
];

const commandCwd = process.env.INIT_CWD ?? process.cwd();

function importOpenFoodFactsCatalogs({
  argv,
  commandCwd,
}: CliArgsInput): Effect.Effect<void, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const args = yield* decodeCliArgs({ argv, commandCwd });
    const inputStat = yield* statInputFile({ inputPath: args.input });
    const definitions = yield* readCatalogDefinitions({
      catalogPath: args.catalogs,
    });
    const runs = buildCatalogRuns({ commandCwd, definitions });
    const exportedAt = DateTime.toEpochMillis(yield* DateTime.now);

    yield* Effect.logInfo("Starting Open Food Facts catalog import", {
      catalogs: definitions.map((definition) => definition.name),
      compressedBytes: inputStat.size,
      dryRun: args.dryRun,
      input: args.input,
    });

    const initialState: ImportState = {
      firstMatchPaused: false,
      header: undefined,
      runs,
      stats: {
        blankRows: 0,
        columnMismatches: 0,
        duplicateRows: 0,
        invalidFoods: 0,
        missingCode: 0,
        missingName: 0,
        missingRequiredMacros: 0,
        rowsScanned: 0,
        tsvMalformedRows: 0,
        unmatchedRows: 0,
      },
    };

    const records = recordStreamFromInput({ inputPath: args.input });
    const limitedRecords =
      args.limit === undefined
        ? records
        : records.pipe(Stream.take(args.limit + 1));

    const finalState = yield* limitedRecords.pipe(
      Stream.runFoldEffect(
        () => initialState,
        (state, record) => processRecord({ args, exportedAt, record, state })
      )
    );

    if (finalState.header === undefined) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: "The Open Food Facts file did not contain a header row.",
        reason: "tsv-header",
      });
    }

    yield* checkpoint({ args, checkpoint: "before-write" });
    yield* writeCatalogs({ args, exportedAt, runs: finalState.runs });
    yield* logFinalSummary({ state: finalState });
  });
}

function decodeCliArgs({
  argv,
  commandCwd,
}: CliArgsInput): Effect.Effect<CliArgs, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const values = parseCliValues({ argv });
    const raw = {
      catalogs: resolve(
        commandCwd,
        lastCliValue({ name: "catalogs", values }) ?? defaultCatalogsPath
      ),
      dryRun: cliBoolean({ name: "dry-run", values }),
      input: resolve(
        commandCwd,
        lastCliValue({ name: "input", values }) ?? defaultInputPath
      ),
      logEvery: numberCliValue({
        fallback: 100_000,
        name: "log-every",
        values,
      }),
      maxInvalidFoods: numberCliValue({
        fallback: 100,
        name: "max-invalid-foods",
        values,
      }),
      maxMalformedRows: numberCliValue({
        fallback: 1_000,
        name: "max-malformed-rows",
        values,
      }),
      pauseAt: cliList({ name: "pause-at", values }),
      ...(lastCliValue({ name: "limit", values }) === undefined
        ? {}
        : { limit: numberCliValue({ fallback: 0, name: "limit", values }) }),
    };

    return yield* Schema.decodeUnknownEffect(CliArgsSchema)(raw, {
      errors: "all",
    }).pipe(
      Effect.mapError(
        (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: "Could not decode Open Food Facts import CLI arguments.",
            reason: "cli-args",
          })
      )
    );
  });
}

function statInputFile({
  inputPath,
}: {
  readonly inputPath: string;
}): Effect.Effect<Stats, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const inputStat = yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not access input file ${inputPath}.`,
          reason: "input-file",
        }),
      try: () => stat(inputPath),
    });

    if (inputStat === undefined) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Could not stat input path: ${inputPath}.`,
        reason: "input-file",
      });
    }

    if (!inputStat.isFile()) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Expected input path to be a file: ${inputPath}.`,
        reason: "input-file",
      });
    }

    return inputStat;
  });
}

function readCatalogDefinitions({
  catalogPath,
}: {
  readonly catalogPath: string;
}): Effect.Effect<
  readonly CatalogDefinition[],
  OpenFoodFactsCatalogImportError
> {
  return Effect.gen(function* () {
    const json = yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not read catalog config ${catalogPath}.`,
          reason: "catalog-config",
        }),
      try: () => readFile(catalogPath, "utf8"),
    });
    const parsed = Option.liftThrowable((value: string): unknown =>
      JSON.parse(value)
    )(json);

    if (Option.isNone(parsed)) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Catalog config is not valid JSON: ${catalogPath}.`,
        reason: "catalog-config",
      });
    }

    const definitions = yield* Schema.decodeUnknownEffect(
      CatalogDefinitionsSchema
    )(parsed.value, { errors: "all" }).pipe(
      Effect.mapError(
        (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: `Catalog config does not match the expected schema: ${catalogPath}.`,
            reason: "catalog-config",
          })
      )
    );

    if (!EffectArray.isReadonlyArrayNonEmpty(definitions)) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Catalog config must contain at least one catalog: ${catalogPath}.`,
        reason: "catalog-config",
      });
    }

    return definitions;
  });
}

function buildCatalogRuns({
  commandCwd,
  definitions,
}: {
  readonly commandCwd: string;
  readonly definitions: readonly CatalogDefinition[];
}): readonly CatalogRun[] {
  return definitions.map((definition) => ({
    definition,
    foods: [],
    outputPath: resolve(commandCwd, definition.output),
    seenCodes: new Set<string>(),
    stats: {
      duplicateCodes: 0,
      matchedRows: 0,
      writtenFoods: 0,
    },
  }));
}

function recordStreamFromInput({
  inputPath,
}: {
  readonly inputPath: string;
}): Stream.Stream<TsvRecord, OpenFoodFactsCatalogImportError> {
  return Stream.suspend(() => {
    const inputStream = createReadStream(inputPath);
    const readable = inputPath.endsWith(".gz")
      ? inputStream.pipe(createGunzip())
      : inputStream;

    return Stream.fromAsyncIterable(
      chunksFromReadable(readable),
      (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not stream input file ${inputPath}.`,
          reason: "stream-read",
        })
    ).pipe(
      Stream.decodeText({ encoding: "utf-8" }),
      Stream.mapAccumArrayEffect(
        () => initialTsvParserState,
        (state, chunks) => Effect.succeed(parseTsvChunks({ chunks, state })),
        { onHalt: flushTsvParserState }
      )
    );
  });
}

async function* chunksFromReadable(
  readable: AsyncIterable<unknown>
): AsyncIterable<Uint8Array> {
  for await (const chunk of readable) {
    if (chunk instanceof Uint8Array) {
      yield chunk;
      continue;
    }

    if (typeof chunk === "string") {
      yield Buffer.from(chunk);
      continue;
    }

    yield Buffer.from(String(chunk));
  }
}

const initialTsvParserState: TsvParserState = {
  field: "",
  inQuotes: false,
  pendingQuote: false,
  row: [],
};

function parseTsvChunks({
  chunks,
  state,
}: {
  readonly chunks: readonly string[];
  readonly state: TsvParserState;
}): readonly [TsvParserState, readonly TsvRecord[]] {
  let field = state.field;
  let inQuotes = state.inQuotes;
  let pendingQuote = state.pendingQuote;
  let row = [...state.row];
  const records: TsvRecord[] = [];

  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index] ?? "";
      let processCharacter = true;

      while (processCharacter) {
        processCharacter = false;

        if (pendingQuote) {
          pendingQuote = false;

          if (character === '"') {
            field += '"';
            continue;
          }

          inQuotes = false;
          processCharacter = true;
          continue;
        }

        if (inQuotes) {
          if (character === '"') {
            pendingQuote = true;
            continue;
          }

          field += character;
          continue;
        }

        if (character === '"' && field.length === 0) {
          inQuotes = true;
          continue;
        }

        if (character === "\t") {
          row.push(field);
          field = "";
          continue;
        }

        if (character === "\n") {
          row.push(field);
          records.push({ _tag: "row", cells: row });
          field = "";
          row = [];
          continue;
        }

        if (character === "\r") {
          continue;
        }

        field += character;
      }
    }
  }

  return [
    {
      field,
      inQuotes,
      pendingQuote,
      row,
    },
    records,
  ];
}

function flushTsvParserState(state: TsvParserState): readonly TsvRecord[] {
  const records: TsvRecord[] = [];
  const hasPartialRow =
    state.field.length > 0 || EffectArray.isReadonlyArrayNonEmpty(state.row);
  const unterminatedQuote = state.inQuotes && !state.pendingQuote;

  if (unterminatedQuote) {
    records.push({
      _tag: "malformed",
      detail: "The input ended while a quoted TSV field was still open.",
    });
  }

  if (hasPartialRow) {
    records.push({
      _tag: "row",
      cells: [...state.row, state.field],
    });
  }

  return records;
}

function processRecord({
  args,
  exportedAt,
  record,
  state,
}: {
  readonly args: CliArgs;
  readonly exportedAt: number;
  readonly record: TsvRecord;
  readonly state: ImportState;
}): Effect.Effect<ImportState, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    if (record._tag === "malformed") {
      state.stats.tsvMalformedRows += 1;

      if (state.stats.tsvMalformedRows > args.maxMalformedRows) {
        return yield* new OpenFoodFactsCatalogImportError({
          detail: `Exceeded max malformed TSV rows (${args.maxMalformedRows}). Latest issue: ${record.detail}`,
          reason: "tsv-row",
        });
      }

      return state;
    }

    if (isBlankRecord({ cells: record.cells })) {
      state.stats.blankRows += 1;
      return state;
    }

    if (state.header === undefined) {
      const header = yield* decodeHeader({ cells: record.cells });

      state.header = header;
      yield* Effect.logInfo("Decoded Open Food Facts header", {
        columns: header.fields.length,
        optionalColumnsPresent: optionalHeaderFields.filter((field) =>
          header.indexByName.has(field)
        ),
        requiredColumnsPresent: requiredHeaderFields,
      });
      yield* checkpoint({ args, checkpoint: "header" });

      return state;
    }

    state.stats.rowsScanned += 1;

    if (record.cells.length !== state.header.fields.length) {
      state.stats.columnMismatches += 1;
    }

    const row = {
      cells: record.cells,
      header: state.header,
    };
    const matchingRuns = state.runs.filter((run) =>
      rowMatchesCatalog({ definition: run.definition, row })
    );

    if (!EffectArray.isArrayNonEmpty(matchingRuns)) {
      state.stats.unmatchedRows += 1;
      yield* logProgressIfNeeded({ args, state });
      return state;
    }

    const conversion = foodFromRow({ exportedAt, row });

    if (conversion._tag === "skipped") {
      incrementSkipStats({ reason: conversion.reason, stats: state.stats });
      yield* logProgressIfNeeded({ args, state });
      return state;
    }

    let wroteFirstMatch = false;

    for (const run of matchingRuns) {
      if (run.seenCodes.has(conversion.code)) {
        run.stats.duplicateCodes += 1;
        state.stats.duplicateRows += 1;
        continue;
      }

      const decodedFood = yield* Schema.decodeEffect(
        FoodCatalogTransfer.FoodCatalogFood
      )(conversion.food, { errors: "all" }).pipe(
        Effect.mapError(
          (cause) =>
            new OpenFoodFactsCatalogImportError({
              cause,
              detail: `Generated food did not match the MAI catalog schema for barcode ${conversion.code}.`,
              reason: "schema-validation",
            })
        )
      );
      const encodedFood = yield* Schema.encodeEffect(
        FoodCatalogTransfer.FoodCatalogFood
      )(decodedFood).pipe(
        Effect.mapError(
          (cause) =>
            new OpenFoodFactsCatalogImportError({
              cause,
              detail: `Could not encode generated food for barcode ${conversion.code}.`,
              reason: "schema-validation",
            })
        )
      );

      run.seenCodes.add(conversion.code);
      run.foods.push(encodedFood);
      run.stats.matchedRows += 1;
      run.stats.writtenFoods += 1;
      wroteFirstMatch = true;
    }

    if (wroteFirstMatch && !state.firstMatchPaused) {
      state.firstMatchPaused = true;
      yield* checkpoint({ args, checkpoint: "first-match" });
    }

    yield* logProgressIfNeeded({ args, state });
    return state;
  });
}

function decodeHeader({
  cells,
}: {
  readonly cells: readonly string[];
}): Effect.Effect<Header, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const fields = cells.map((cell, index) =>
      index === 0 ? cell.replace(/^\uFEFF/, "") : cell
    );
    const indexByName = new Map<string, number>();

    for (const [index, field] of fields.entries()) {
      if (!indexByName.has(field)) {
        indexByName.set(field, index);
      }
    }

    const missingRequiredFields = requiredHeaderFields.filter(
      (field) => !indexByName.has(field)
    );
    const hasEnergyField =
      indexByName.has("energy-kcal_100g") || indexByName.has("energy-kj_100g");

    if (
      EffectArray.isReadonlyArrayNonEmpty(missingRequiredFields) ||
      !hasEnergyField
    ) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: [
          EffectArray.isReadonlyArrayNonEmpty(missingRequiredFields)
            ? `Missing required columns: ${missingRequiredFields.join(", ")}`
            : undefined,
          hasEnergyField
            ? undefined
            : "Missing one of energy-kcal_100g or energy-kj_100g.",
        ]
          .filter((detail) => detail !== undefined)
          .join(" "),
        reason: "tsv-header",
      });
    }

    const requiredFieldIndexes = requiredHeaderFields
      .map((field) => indexByName.get(field) ?? 0)
      .concat([
        indexByName.get("energy-kcal_100g") ??
          indexByName.get("energy-kj_100g") ??
          0,
      ]);

    return {
      fields,
      indexByName,
      requiredFieldMaxIndex: Math.max(...requiredFieldIndexes),
    };
  });
}

function rowMatchesCatalog({
  definition,
  row,
}: {
  readonly definition: CatalogDefinition;
  readonly row: OpenFoodFactsRow;
}): boolean {
  const countries = splitOpenFoodFactsList(
    fieldValue({ field: "countries_tags", row })
  ).map(normalizeTag);
  const stores = splitOpenFoodFactsList(
    fieldValue({ field: "stores", row })
  ).map(normalizeStoreName);

  return (
    countries.includes(normalizeTag(definition.countryTag)) &&
    stores.includes(normalizeStoreName(definition.store))
  );
}

function foodFromRow({
  exportedAt,
  row,
}: {
  readonly exportedAt: number;
  readonly row: OpenFoodFactsRow;
}): FoodConversion {
  const code = fieldValue({ field: "code", row }).trim();
  const name = fieldValue({ field: "product_name", row }).trim();
  const brand = fieldValue({ field: "brands", row }).trim();
  const energyKcal = energyKcalFromRow({ row });
  const protein = parseNonNegativeNumber(
    fieldValue({ field: "proteins_100g", row })
  );
  const carbs = parseNonNegativeNumber(
    fieldValue({ field: "carbohydrates_100g", row })
  );
  const fat = parseNonNegativeNumber(fieldValue({ field: "fat_100g", row }));

  if (code.length === 0) {
    return { _tag: "skipped", reason: "missing-code" };
  }

  if (name.length === 0) {
    return { _tag: "skipped", reason: "missing-name" };
  }

  if (
    energyKcal === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return { _tag: "skipped", reason: "missing-required-macros" };
  }

  const fiber = parseNonNegativeNumber(
    fieldValue({ field: "fiber_100g", row })
  );
  const sugars = parseNonNegativeNumber(
    fieldValue({ field: "sugars_100g", row })
  );
  const saturatedFat = parseNonNegativeNumber(
    fieldValue({ field: "saturated-fat_100g", row })
  );
  const sodium = parseNonNegativeNumber(
    fieldValue({ field: "sodium_100g", row })
  );
  const salt = sodium === undefined ? undefined : roundNumber(sodium * 2.5);
  const food = {
    id: stableFoodIdFromOpenFoodFactsCode({ code }),
    name,
    origin: "import",
    energyKcalPer100g: roundNumber(energyKcal),
    proteinGramsPer100g: roundNumber(protein),
    carbsGramsPer100g: roundNumber(carbs),
    fatGramsPer100g: roundNumber(fat),
    createdAt: exportedAt,
    updatedAt: exportedAt,
    ...(brand.length === 0 ? {} : { brand }),
    ...(fiber === undefined ? {} : { fiberGramsPer100g: roundNumber(fiber) }),
    ...(sugars === undefined ? {} : { sugarGramsPer100g: roundNumber(sugars) }),
    ...(saturatedFat === undefined
      ? {}
      : { saturatedFatGramsPer100g: roundNumber(saturatedFat) }),
    ...(salt === undefined ? {} : { saltGramsPer100g: salt }),
  } satisfies CatalogFoodEncoded;

  return {
    _tag: "converted",
    code,
    food,
  };
}

function energyKcalFromRow({
  row,
}: {
  readonly row: OpenFoodFactsRow;
}): number | undefined {
  const energyKcal = parseNonNegativeNumber(
    fieldValue({ field: "energy-kcal_100g", row })
  );

  if (energyKcal !== undefined) {
    return energyKcal;
  }

  const energyKj = parseNonNegativeNumber(
    fieldValue({ field: "energy-kj_100g", row })
  );

  return energyKj === undefined ? undefined : energyKj / 4.184;
}

function fieldValue({
  field,
  row,
}: {
  readonly field: string;
  readonly row: OpenFoodFactsRow;
}): string {
  const index = row.header.indexByName.get(field);

  if (index === undefined) {
    return "";
  }

  return row.cells[index] ?? "";
}

function splitOpenFoodFactsList(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeStoreName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseNonNegativeNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");

  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function roundNumber(value: number): number {
  const precision = 10_000;

  return Math.round(value * precision) / precision;
}

function stableFoodIdFromOpenFoodFactsCode({
  code,
}: {
  readonly code: string;
}): CatalogFoodEncoded["id"] {
  const bytes = createHash("sha256")
    .update(`open-food-facts:${code}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function incrementSkipStats({
  reason,
  stats,
}: {
  readonly reason: FoodConversion extends infer Conversion
    ? Conversion extends {
        readonly _tag: "skipped";
        readonly reason: infer Reason;
      }
      ? Reason
      : never
    : never;
  readonly stats: ImportStats;
}): void {
  if (reason === "missing-code") {
    stats.missingCode += 1;
    return;
  }

  if (reason === "missing-name") {
    stats.missingName += 1;
    return;
  }

  stats.missingRequiredMacros += 1;
}

function logProgressIfNeeded({
  args,
  state,
}: {
  readonly args: CliArgs;
  readonly state: ImportState;
}): Effect.Effect<void> {
  if (
    state.stats.rowsScanned === 0 ||
    state.stats.rowsScanned % args.logEvery !== 0
  ) {
    return Effect.void;
  }

  return Effect.logInfo("Open Food Facts import progress", {
    catalogMatches: state.runs.map((run) => ({
      foods: run.foods.length,
      name: run.definition.name,
    })),
    rowsScanned: state.stats.rowsScanned,
    skippedMissingMacros: state.stats.missingRequiredMacros,
  });
}

function checkpoint({
  args,
  checkpoint,
}: {
  readonly args: CliArgs;
  readonly checkpoint: PauseCheckpoint;
}): Effect.Effect<void, OpenFoodFactsCatalogImportError> {
  if (!args.pauseAt.includes(checkpoint)) {
    return Effect.void;
  }

  return Effect.gen(function* () {
    yield* Effect.logInfo(
      `Paused at ${checkpoint}. Press Enter to continue the importer.`
    );
    yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not pause at checkpoint ${checkpoint}.`,
          reason: "cli-args",
        }),
      try: () => {
        const terminal = createInterface({ input: stdin, output: stdout });

        return terminal.question("").finally(() => terminal.close());
      },
    });
  });
}

function writeCatalogs({
  args,
  exportedAt,
  runs,
}: {
  readonly args: CliArgs;
  readonly exportedAt: number;
  readonly runs: readonly CatalogRun[];
}): Effect.Effect<void, OpenFoodFactsCatalogImportError> {
  return Effect.forEach(runs, (run) =>
    Effect.gen(function* () {
      const encodedCatalog = {
        format: "mai.food-catalog",
        formatVersion: 1,
        integrity: {
          counts: {
            foods: run.foods.length,
          },
        },
        source: {
          databaseName: Metadata.DatabaseName,
          databaseVersion: Metadata.CurrentDatabaseVersion,
          exportedAt,
        },
        stores: {
          foods: run.foods,
        },
      } satisfies FoodCatalogTransfer.MaiFoodCatalogEncoded;
      const catalog = yield* Schema.decodeEffect(
        FoodCatalogTransfer.MaiFoodCatalogV1
      )(encodedCatalog, { errors: "all" }).pipe(
        Effect.mapError(
          (cause) =>
            new OpenFoodFactsCatalogImportError({
              cause,
              detail: `Generated catalog did not match the MAI schema: ${run.definition.name}.`,
              reason: "schema-validation",
            })
        )
      );
      const json = yield* Schema.encodeEffect(
        FoodCatalogTransfer.MaiFoodCatalogJson
      )(catalog).pipe(
        Effect.mapError(
          (cause) =>
            new OpenFoodFactsCatalogImportError({
              cause,
              detail: `Could not encode generated catalog: ${run.definition.name}.`,
              reason: "schema-validation",
            })
        )
      );

      yield* Effect.logInfo("Validated generated catalog", {
        foods: run.foods.length,
        name: run.definition.name,
        output: run.outputPath,
      });

      if (args.dryRun) {
        yield* Effect.logInfo("Dry run enabled; skipping catalog write", {
          output: run.outputPath,
        });
        return;
      }

      yield* Effect.tryPromise({
        catch: (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: `Could not create output directory ${dirname(run.outputPath)}.`,
            reason: "catalog-output",
          }),
        try: () => mkdir(dirname(run.outputPath), { recursive: true }),
      });
      yield* Effect.tryPromise({
        catch: (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: `Could not write generated catalog ${run.outputPath}.`,
            reason: "catalog-output",
          }),
        try: () => writeFile(run.outputPath, json),
      });
      yield* Effect.logInfo("Wrote generated catalog", {
        foods: run.foods.length,
        output: run.outputPath,
      });
    })
  ).pipe(Effect.asVoid);
}

function logFinalSummary({
  state,
}: {
  readonly state: ImportState;
}): Effect.Effect<void> {
  return Effect.logInfo("Finished Open Food Facts catalog import", {
    catalogs: state.runs.map((run) => ({
      duplicates: run.stats.duplicateCodes,
      foods: run.foods.length,
      matchedRows: run.stats.matchedRows,
      name: run.definition.name,
      output: run.outputPath,
    })),
    stats: state.stats,
  });
}

function isBlankRecord({
  cells,
}: {
  readonly cells: readonly string[];
}): boolean {
  return cells.length === 1 && (cells[0] ?? "").trim().length === 0;
}

function parseCliValues({
  argv,
}: {
  readonly argv: readonly string[];
}): ReadonlyMap<string, readonly string[]> {
  const entries = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined || !arg.startsWith("--")) {
      continue;
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const valueFromEquals =
      equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
    const nextArg = argv[index + 1];
    const value =
      valueFromEquals ??
      (nextArg === undefined || nextArg.startsWith("--") ? "true" : nextArg);

    if (
      valueFromEquals === undefined &&
      nextArg !== undefined &&
      !nextArg.startsWith("--")
    ) {
      index += 1;
    }

    const existing = entries.get(name) ?? [];

    existing.push(value);
    entries.set(name, existing);
  }

  return entries;
}

function lastCliValue({
  name,
  values,
}: {
  readonly name: string;
  readonly values: ReadonlyMap<string, readonly string[]>;
}): string | undefined {
  const entries = values.get(name);

  return entries === undefined ? undefined : entries[entries.length - 1];
}

function numberCliValue({
  fallback,
  name,
  values,
}: {
  readonly fallback: number;
  readonly name: string;
  readonly values: ReadonlyMap<string, readonly string[]>;
}): number {
  const value = lastCliValue({ name, values });

  return value === undefined ? fallback : Number(value);
}

function cliBoolean({
  name,
  values,
}: {
  readonly name: string;
  readonly values: ReadonlyMap<string, readonly string[]>;
}): boolean {
  const value = lastCliValue({ name, values });

  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized !== "false" && normalized !== "0" && normalized !== "no";
}

function cliList({
  name,
  values,
}: {
  readonly name: string;
  readonly values: ReadonlyMap<string, readonly string[]>;
}): readonly string[] {
  return (values.get(name) ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof OpenFoodFactsCatalogImportError) {
    return `${error.reason}: ${error.detail}`;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

const program = importOpenFoodFactsCatalogs({
  argv: process.argv.slice(2),
  commandCwd,
}).pipe(Effect.withLogSpan("open-food-facts-catalog-import"));

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(formatUnknownError(error));
  process.exitCode = 1;
});
