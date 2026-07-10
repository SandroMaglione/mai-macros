import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Stats } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

import { Array, Data, DateTime, Effect, Option, Schema, Stream } from "effect";

import { FoodCatalogTransfer, Metadata } from "../src/index.ts";

type ImportErrorReason =
  | "cache"
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

const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));

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
  buildCache: Schema.Boolean,
  cache: NonEmptyString,
  catalogs: NonEmptyString,
  dryRun: Schema.Boolean,
  fromCache: Schema.Boolean,
  input: NonEmptyString,
  limit: Schema.optional(PositiveInteger),
  logEvery: PositiveInteger,
  maxInvalidFoods: NonNegativeInteger,
  maxMalformedRows: NonNegativeInteger,
  maxMatchesPerCatalog: Schema.optional(PositiveInteger),
  pauseAt: Schema.Array(PauseCheckpoint),
  sleepMs: NonNegativeInteger,
  yieldEvery: Schema.optional(PositiveInteger),
});

const CatalogCacheInputSchema = Schema.Struct({
  mtimeMs: NonNegativeNumber,
  path: NonEmptyString,
  size: NonNegativeInteger,
});

const CatalogCacheMetadataSchema = Schema.Struct({
  catalogs: CatalogDefinitionsSchema,
  catalogsHash: NonEmptyString,
  createdAt: NonNegativeInteger,
  format: Schema.Literal("mai.open-food-facts-catalog-cache"),
  formatVersion: Schema.Literal(1),
  input: CatalogCacheInputSchema,
  kind: Schema.Literal("metadata"),
  limit: Schema.optional(PositiveInteger),
  maxMatchesPerCatalog: Schema.optional(PositiveInteger),
});

const CatalogCacheCandidateSchema = Schema.Struct({
  catalogs: Schema.Array(NonEmptyString),
  fields: Schema.Record(Schema.String, Schema.String),
  kind: Schema.Literal("candidate"),
});

type CatalogDefinition = typeof CatalogDefinitionSchema.Type;
type CatalogFoodEncoded =
  FoodCatalogTransfer.MaiFoodCatalogEncoded["stores"]["foods"][number];
type CliArgs = typeof CliArgsSchema.Type;
type CatalogCacheCandidate = typeof CatalogCacheCandidateSchema.Type;
type CatalogCacheMetadata = typeof CatalogCacheMetadataSchema.Type;
type PauseCheckpoint = typeof PauseCheckpoint.Type;

type CliArgsInput = {
  readonly argv: readonly string[];
  readonly commandCwd: string;
};

type CatalogRun = {
  readonly definition: CatalogDefinition;
  readonly outputPath: string;
  readonly seenCleanedIdentities: Map<string, CatalogIdentityMatch>;
  readonly seenCodes: Set<string>;
  readonly stats: CatalogStats;
  readonly foods: CatalogFoodEncoded[];
};

type CatalogStats = {
  cleanupChanges: CleanupChangeStats;
  cleanupWarnings: CleanupWarningStats;
  duplicateCodes: number;
  duplicateCleanedIdentities: number;
  matchedRows: number;
  rejectedFoods: CleanupSkipStats;
  replacedCleanedIdentities: number;
  writtenFoods: number;
};

type CatalogIdentityMatch = {
  readonly code: string;
  readonly index: number;
  readonly score: number;
};

type CleanupChangeReason =
  | "normalized-brand"
  | "normalized-name"
  | "removed-brand-duplicate"
  | "removed-brand-retailer"
  | "removed-name-brand"
  | "removed-name-retailer"
  | "title-cased-brand"
  | "title-cased-name";

type CleanupChangeStats = {
  normalizedBrand: number;
  normalizedName: number;
  removedBrandDuplicate: number;
  removedBrandRetailer: number;
  removedNameBrand: number;
  removedNameRetailer: number;
  titleCasedBrand: number;
  titleCasedName: number;
};

type CleanupSkipReason =
  | "contaminated-name"
  | "energy-too-high"
  | "foreign-name-low-confidence"
  | "macro-over-100g"
  | "macro-total-over-105g"
  | "name-is-brand"
  | "name-is-store"
  | "salt-too-high"
  | "unexpected-script";

type CleanupSkipStats = {
  contaminatedName: number;
  energyTooHigh: number;
  foreignNameLowConfidence: number;
  macroOver100g: number;
  macroTotalOver105g: number;
  nameIsBrand: number;
  nameIsStore: number;
  saltTooHigh: number;
  unexpectedScript: number;
};

type CleanupWarningReason = "energy-macro-mismatch" | "foreign-language-name";

type CleanupWarningStats = {
  energyMacroMismatch: number;
  foreignLanguageName: number;
};

type Header = {
  readonly fields: readonly string[];
  readonly indexByName: ReadonlyMap<string, number>;
  readonly requiredFieldMaxIndex: number;
};

type ImportStats = {
  blankRows: number;
  cachedCandidates: number;
  columnMismatches: number;
  duplicateRows: number;
  invalidFoods: number;
  cleanupChanges: CleanupChangeStats;
  cleanupWarnings: CleanupWarningStats;
  cleanupRejectedFoods: CleanupSkipStats;
  duplicateCleanedIdentities: number;
  missingCode: number;
  missingName: number;
  missingRequiredMacros: number;
  replacedCleanedIdentities: number;
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

type CacheBuildState = {
  header: Header | undefined;
  readonly lines: string[];
  readonly matchesByCatalogName: Map<string, number>;
  stats: {
    blankRows: number;
    candidateRows: number;
    columnMismatches: number;
    rowsScanned: number;
    tsvMalformedRows: number;
    unmatchedRows: number;
  };
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
      readonly changes: readonly CleanupChangeReason[];
      readonly cleanedIdentityKey: string;
      readonly food: CatalogFoodEncoded;
      readonly identityScore: number;
      readonly warnings: readonly CleanupWarningReason[];
    }
  | {
      readonly _tag: "skipped";
      readonly reason:
        | CleanupSkipReason
        | "missing-code"
        | "missing-name"
        | "missing-required-macros";
    };

const defaultInputPath =
  "data/open-food-facts/raw/en.openfoodfacts.org.products.csv.gz";

const defaultCachePath = "data/open-food-facts/cache/catalog-candidates.jsonl";

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

const cacheHeaderFields = [
  ...requiredHeaderFields,
  ...optionalHeaderFields,
] as const;

const titleCaseAcronyms = ["doc", "docg", "dop", "igp", "pgi", "stg", "uht"];

const lowercaseTitleCaseWords = [
  "a",
  "al",
  "alla",
  "con",
  "da",
  "del",
  "della",
  "di",
  "e",
  "il",
  "la",
  "le",
  "lo",
  "per",
  "senza",
];

const contaminatedNamePhrases = [
  "body lotion",
  "crema viso",
  "detergente",
  "intensive serum",
  "non mangiare",
  "q10 intensive serum",
  "shampoo",
];

const foreignLanguageHintWords = [
  "avec",
  "bautura",
  "baza",
  "bebida",
  "boisson",
  "brasnom",
  "cheese",
  "chevre",
  "chocolat",
  "cjelovitog",
  "doux",
  "dvopek",
  "džem",
  "dzem",
  "entier",
  "fins",
  "gerieben",
  "goats",
  "huile",
  "käse",
  "kaese",
  "kase",
  "lait",
  "liquide",
  "mandeln",
  "marelice",
  "mie",
  "miel",
  "mit",
  "od",
  "orez",
  "pain",
  "pâte",
  "pate",
  "petit",
  "petits",
  "pois",
  "sabor",
  "tartiner",
  "tres",
  "těstoviny",
  "testoviny",
  "und",
  "zrna",
];

const italianLanguageHintWords = [
  "al",
  "alla",
  "avena",
  "bevanda",
  "bianco",
  "cacao",
  "cioccolato",
  "con",
  "crema",
  "di",
  "fresco",
  "fresca",
  "grassi",
  "intero",
  "latte",
  "mirtillo",
  "olio",
  "pomodoro",
  "riso",
  "scremato",
  "senza",
  "sugo",
  "tonno",
  "uova",
  "yogurt",
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
    const exportedAt = DateTime.toEpochMillis(yield* DateTime.now);

    if (args.buildCache) {
      yield* buildCatalogCandidateCache({
        args,
        definitions,
        exportedAt,
        inputStat,
      });
      return;
    }

    const runs = buildCatalogRuns({ commandCwd, definitions });

    yield* Effect.logInfo("Starting Open Food Facts catalog import", {
      cache: args.fromCache ? args.cache : undefined,
      catalogs: definitions.map((definition) => definition.name),
      compressedBytes: inputStat.size,
      dryRun: args.dryRun,
      fromCache: args.fromCache,
      input: args.input,
    });

    const finalState = args.fromCache
      ? yield* importCatalogsFromCache({
          args,
          definitions,
          exportedAt,
          inputStat,
          runs,
        })
      : yield* importCatalogsFromRawInput({
          args,
          definitions,
          exportedAt,
          runs,
        });

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
      buildCache: cliBoolean({ name: "build-cache", values }),
      cache: resolve(
        commandCwd,
        lastCliValue({ name: "cache", values }) ?? defaultCachePath
      ),
      fromCache: cliBoolean({ name: "from-cache", values }),
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
      sleepMs: numberCliValue({ fallback: 0, name: "sleep-ms", values }),
      ...(lastCliValue({ name: "limit", values }) === undefined
        ? {}
        : { limit: numberCliValue({ fallback: 0, name: "limit", values }) }),
      ...(lastCliValue({ name: "max-matches-per-catalog", values }) ===
      undefined
        ? {}
        : {
            maxMatchesPerCatalog: numberCliValue({
              fallback: 0,
              name: "max-matches-per-catalog",
              values,
            }),
          }),
      ...(lastCliValue({ name: "yield-every", values }) === undefined
        ? {}
        : {
            yieldEvery: numberCliValue({
              fallback: 0,
              name: "yield-every",
              values,
            }),
          }),
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

    if (!Array.isReadonlyArrayNonEmpty(definitions)) {
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
    seenCleanedIdentities: new Map<string, CatalogIdentityMatch>(),
    seenCodes: new Set<string>(),
    stats: {
      cleanupChanges: emptyCleanupChangeStats(),
      cleanupWarnings: emptyCleanupWarningStats(),
      duplicateCodes: 0,
      duplicateCleanedIdentities: 0,
      matchedRows: 0,
      rejectedFoods: emptyCleanupSkipStats(),
      replacedCleanedIdentities: 0,
      writtenFoods: 0,
    },
  }));
}

function initialImportState({
  header,
  runs,
}: {
  readonly header: Header | undefined;
  readonly runs: readonly CatalogRun[];
}): ImportState {
  return {
    firstMatchPaused: false,
    header,
    runs,
    stats: {
      blankRows: 0,
      cachedCandidates: 0,
      columnMismatches: 0,
      cleanupChanges: emptyCleanupChangeStats(),
      cleanupRejectedFoods: emptyCleanupSkipStats(),
      cleanupWarnings: emptyCleanupWarningStats(),
      duplicateCleanedIdentities: 0,
      duplicateRows: 0,
      invalidFoods: 0,
      missingCode: 0,
      missingName: 0,
      missingRequiredMacros: 0,
      replacedCleanedIdentities: 0,
      rowsScanned: 0,
      tsvMalformedRows: 0,
      unmatchedRows: 0,
    },
  };
}

function importCatalogsFromRawInput({
  args,
  definitions,
  exportedAt,
  runs,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly exportedAt: number;
  readonly runs: readonly CatalogRun[];
}): Effect.Effect<ImportState, OpenFoodFactsCatalogImportError> {
  const records = rawRecordsForArgs({
    args,
    definitions,
    inputPath: args.input,
  });

  return records.pipe(
    Stream.runFoldEffect(
      () => initialImportState({ header: undefined, runs }),
      (state, record) => processRecord({ args, exportedAt, record, state })
    )
  );
}

function importCatalogsFromCache({
  args,
  definitions,
  exportedAt,
  inputStat,
  runs,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly exportedAt: number;
  readonly inputStat: Stats;
  readonly runs: readonly CatalogRun[];
}): Effect.Effect<ImportState, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const candidates = yield* readCatalogCandidateCache({
      args,
      definitions,
      inputStat,
    });
    const initialState = initialImportState({
      header: cacheHeader(),
      runs,
    });

    let state = initialState;

    for (const candidate of candidates) {
      state = yield* processCachedCandidate({
        args,
        candidate,
        exportedAt,
        state,
      });
    }

    return state;
  });
}

function rawRecordsForArgs({
  args,
  definitions,
  inputPath,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly inputPath: string;
}): Stream.Stream<TsvRecord, OpenFoodFactsCatalogImportError> {
  const records = recordStreamFromInput({ inputPath });
  const limitedRecords =
    args.limit === undefined
      ? records
      : records.pipe(Stream.take(args.limit + 1));

  if (args.maxMatchesPerCatalog === undefined) {
    return limitedRecords;
  }

  let header: Header | undefined;
  const matchCounts = new Map(
    definitions.map((definition) => [definition.name, 0])
  );

  return limitedRecords.pipe(
    Stream.takeUntilEffect((record) =>
      rawScanMatchCapReached({
        definitions,
        header,
        matchCounts,
        maxMatchesPerCatalog: args.maxMatchesPerCatalog ?? 1,
        record,
        setHeader: (decodedHeader) => {
          header = decodedHeader;
        },
      })
    )
  );
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
    state.field.length > 0 || Array.isReadonlyArrayNonEmpty(state.row);
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

    if (!Array.isArrayNonEmpty(matchingRuns)) {
      state.stats.unmatchedRows += 1;
      yield* logProgressIfNeeded({ args, state });
      yield* throttleIfNeeded({ args, state });
      return state;
    }

    return yield* processMatchedRow({
      args,
      exportedAt,
      matchingRuns,
      row,
      state,
    });
  });
}

function processCachedCandidate({
  args,
  candidate,
  exportedAt,
  state,
}: {
  readonly args: CliArgs;
  readonly candidate: CatalogCacheCandidate;
  readonly exportedAt: number;
  readonly state: ImportState;
}): Effect.Effect<ImportState, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    state.stats.cachedCandidates += 1;
    state.stats.rowsScanned += 1;

    const matchingRuns = state.runs.filter((run) =>
      candidate.catalogs.includes(run.definition.name)
    );

    if (!Array.isArrayNonEmpty(matchingRuns)) {
      state.stats.unmatchedRows += 1;
      yield* logProgressIfNeeded({ args, state });
      yield* throttleIfNeeded({ args, state });
      return state;
    }

    return yield* processMatchedRow({
      args,
      exportedAt,
      matchingRuns,
      row: openFoodFactsRowFromCachedCandidate({ candidate }),
      state,
    });
  });
}

function processMatchedRow({
  args,
  exportedAt,
  matchingRuns,
  row,
  state,
}: {
  readonly args: CliArgs;
  readonly exportedAt: number;
  readonly matchingRuns: readonly CatalogRun[];
  readonly row: OpenFoodFactsRow;
  readonly state: ImportState;
}): Effect.Effect<ImportState, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    let wroteFirstMatch = false;

    for (const run of matchingRuns) {
      const conversion = foodFromRow({
        definition: run.definition,
        exportedAt,
        row,
      });

      if (conversion._tag === "skipped") {
        incrementSkipStats({
          reason: conversion.reason,
          runStats: run.stats,
          stats: state.stats,
        });

        continue;
      }

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

      const existingIdentity = run.seenCleanedIdentities.get(
        conversion.cleanedIdentityKey
      );

      if (existingIdentity !== undefined) {
        run.stats.duplicateCleanedIdentities += 1;
        state.stats.duplicateCleanedIdentities += 1;

        if (conversion.identityScore <= existingIdentity.score) {
          continue;
        }

        run.foods[existingIdentity.index] = encodedFood;
        run.seenCodes.add(conversion.code);
        run.seenCleanedIdentities.set(conversion.cleanedIdentityKey, {
          code: conversion.code,
          index: existingIdentity.index,
          score: conversion.identityScore,
        });
        run.stats.matchedRows += 1;
        run.stats.replacedCleanedIdentities += 1;
        state.stats.replacedCleanedIdentities += 1;
        incrementCleanupChangeStats({
          changes: conversion.changes,
          runStats: run.stats.cleanupChanges,
          stats: state.stats.cleanupChanges,
        });
        incrementCleanupWarningStats({
          runStats: run.stats.cleanupWarnings,
          stats: state.stats.cleanupWarnings,
          warnings: conversion.warnings,
        });
        wroteFirstMatch = true;
        continue;
      }

      run.seenCodes.add(conversion.code);
      run.seenCleanedIdentities.set(conversion.cleanedIdentityKey, {
        code: conversion.code,
        index: run.foods.length,
        score: conversion.identityScore,
      });
      run.foods.push(encodedFood);
      run.stats.matchedRows += 1;
      run.stats.writtenFoods += 1;
      incrementCleanupChangeStats({
        changes: conversion.changes,
        runStats: run.stats.cleanupChanges,
        stats: state.stats.cleanupChanges,
      });
      incrementCleanupWarningStats({
        runStats: run.stats.cleanupWarnings,
        stats: state.stats.cleanupWarnings,
        warnings: conversion.warnings,
      });
      wroteFirstMatch = true;
    }

    if (wroteFirstMatch && !state.firstMatchPaused) {
      state.firstMatchPaused = true;
      yield* checkpoint({ args, checkpoint: "first-match" });
    }

    yield* logProgressIfNeeded({ args, state });
    yield* throttleIfNeeded({ args, state });
    return state;
  });
}

function buildCatalogCandidateCache({
  args,
  definitions,
  exportedAt,
  inputStat,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly exportedAt: number;
  readonly inputStat: Stats;
}): Effect.Effect<void, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("Starting Open Food Facts candidate cache build", {
      cache: args.cache,
      catalogs: definitions.map((definition) => definition.name),
      compressedBytes: inputStat.size,
      input: args.input,
      maxMatchesPerCatalog: args.maxMatchesPerCatalog,
      sleepMs: args.sleepMs,
      yieldEvery: args.yieldEvery,
    });

    const records = rawRecordsForArgs({
      args,
      definitions,
      inputPath: args.input,
    });
    const initialState = initialCacheBuildState({ definitions });
    const finalState = yield* records.pipe(
      Stream.runFoldEffect(
        () => initialState,
        (state, record) =>
          processCacheBuildRecord({
            args,
            definitions,
            record,
            state,
          })
      )
    );

    if (finalState.header === undefined) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: "The Open Food Facts file did not contain a header row.",
        reason: "tsv-header",
      });
    }

    const metadata = catalogCacheMetadata({
      args,
      definitions,
      exportedAt,
      inputStat,
    });
    const jsonl = [JSON.stringify(metadata), ...finalState.lines, ""].join(
      "\n"
    );

    if (args.dryRun) {
      yield* Effect.logInfo("Dry run enabled; skipping candidate cache write", {
        cache: args.cache,
        candidateRows: finalState.stats.candidateRows,
      });
      return;
    }

    yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not create candidate cache directory ${dirname(args.cache)}.`,
          reason: "cache",
        }),
      try: () => mkdir(dirname(args.cache), { recursive: true }),
    });
    yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not write candidate cache ${args.cache}.`,
          reason: "cache",
        }),
      try: () => writeFile(args.cache, jsonl),
    });
    yield* Effect.logInfo("Wrote Open Food Facts candidate cache", {
      cache: args.cache,
      candidateRows: finalState.stats.candidateRows,
      matchesByCatalog: Object.fromEntries(finalState.matchesByCatalogName),
      stats: finalState.stats,
    });
  });
}

function initialCacheBuildState({
  definitions,
}: {
  readonly definitions: readonly CatalogDefinition[];
}): CacheBuildState {
  return {
    header: undefined,
    lines: [],
    matchesByCatalogName: new Map(
      definitions.map((definition) => [definition.name, 0])
    ),
    stats: {
      blankRows: 0,
      candidateRows: 0,
      columnMismatches: 0,
      rowsScanned: 0,
      tsvMalformedRows: 0,
      unmatchedRows: 0,
    },
  };
}

function processCacheBuildRecord({
  args,
  definitions,
  record,
  state,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly record: TsvRecord;
  readonly state: CacheBuildState;
}): Effect.Effect<CacheBuildState, OpenFoodFactsCatalogImportError> {
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
      state.header = yield* decodeHeader({ cells: record.cells });
      yield* Effect.logInfo("Decoded Open Food Facts header for cache build", {
        columns: state.header.fields.length,
      });
      return state;
    }

    state.stats.rowsScanned += 1;

    if (record.cells.length !== state.header.fields.length) {
      state.stats.columnMismatches += 1;
    }

    const row = { cells: record.cells, header: state.header };
    const matchingDefinitions = definitions.filter((definition) =>
      rowMatchesCatalog({ definition, row })
    );

    if (!Array.isReadonlyArrayNonEmpty(matchingDefinitions)) {
      state.stats.unmatchedRows += 1;
      yield* logCacheBuildProgressIfNeeded({ args, state });
      yield* throttleCacheBuildIfNeeded({ args, state });
      return state;
    }

    state.stats.candidateRows += 1;

    for (const definition of matchingDefinitions) {
      state.matchesByCatalogName.set(
        definition.name,
        (state.matchesByCatalogName.get(definition.name) ?? 0) + 1
      );
    }

    state.lines.push(
      JSON.stringify({
        catalogs: matchingDefinitions.map((definition) => definition.name),
        fields: cacheFieldsFromRow({ row }),
        kind: "candidate",
      } satisfies CatalogCacheCandidate)
    );
    yield* logCacheBuildProgressIfNeeded({ args, state });
    yield* throttleCacheBuildIfNeeded({ args, state });

    return state;
  });
}

function readCatalogCandidateCache({
  args,
  definitions,
  inputStat,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly inputStat: Stats;
}): Effect.Effect<
  readonly CatalogCacheCandidate[],
  OpenFoodFactsCatalogImportError
> {
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      catch: (cause) =>
        new OpenFoodFactsCatalogImportError({
          cause,
          detail: `Could not read candidate cache ${args.cache}. Run with --build-cache first.`,
          reason: "cache",
        }),
      try: () => readFile(args.cache, "utf8"),
    });
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const metadataLine = lines[0];

    if (metadataLine === undefined) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Candidate cache is empty: ${args.cache}.`,
        reason: "cache",
      });
    }

    const metadata = yield* decodeCatalogCacheMetadata({ line: metadataLine });

    yield* validateCatalogCacheMetadata({
      args,
      definitions,
      inputStat,
      metadata,
    });

    const candidates: CatalogCacheCandidate[] = [];

    for (const line of lines.slice(1)) {
      candidates.push(yield* decodeCatalogCacheCandidate({ line }));
    }

    yield* Effect.logInfo("Loaded Open Food Facts candidate cache", {
      cache: args.cache,
      candidateRows: candidates.length,
      createdAt: metadata.createdAt,
    });

    return candidates;
  });
}

function decodeCatalogCacheMetadata({
  line,
}: {
  readonly line: string;
}): Effect.Effect<CatalogCacheMetadata, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const parsed = yield* parseCatalogCacheJsonLine({
      line,
      reason: "metadata",
    });

    return yield* Schema.decodeUnknownEffect(CatalogCacheMetadataSchema)(
      parsed,
      {
        errors: "all",
      }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: "Candidate cache contains invalid metadata.",
            reason: "cache",
          })
      )
    );
  });
}

function decodeCatalogCacheCandidate({
  line,
}: {
  readonly line: string;
}): Effect.Effect<CatalogCacheCandidate, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const parsed = yield* parseCatalogCacheJsonLine({
      line,
      reason: "candidate",
    });

    return yield* Schema.decodeUnknownEffect(CatalogCacheCandidateSchema)(
      parsed,
      {
        errors: "all",
      }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new OpenFoodFactsCatalogImportError({
            cause,
            detail: "Candidate cache contains an invalid candidate.",
            reason: "cache",
          })
      )
    );
  });
}

function parseCatalogCacheJsonLine({
  line,
  reason,
}: {
  readonly line: string;
  readonly reason: string;
}): Effect.Effect<unknown, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const parsed = Option.liftThrowable((value: string): unknown =>
      JSON.parse(value)
    )(line);

    if (Option.isNone(parsed)) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Candidate cache contains invalid JSON ${reason}.`,
        reason: "cache",
      });
    }

    return parsed.value;
  });
}

function validateCatalogCacheMetadata({
  args,
  definitions,
  inputStat,
  metadata,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly inputStat: Stats;
  readonly metadata: CatalogCacheMetadata;
}): Effect.Effect<void, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    const expectedMetadata = catalogCacheMetadata({
      args,
      definitions,
      exportedAt: metadata.createdAt,
      inputStat,
    });
    const problems = [
      metadata.input.path === expectedMetadata.input.path
        ? undefined
        : "input path",
      metadata.input.size === expectedMetadata.input.size
        ? undefined
        : "input size",
      metadata.input.mtimeMs === expectedMetadata.input.mtimeMs
        ? undefined
        : "input mtime",
      metadata.catalogsHash === expectedMetadata.catalogsHash
        ? undefined
        : "catalog definitions",
      metadata.limit === expectedMetadata.limit ? undefined : "limit",
      metadata.maxMatchesPerCatalog === expectedMetadata.maxMatchesPerCatalog
        ? undefined
        : "max matches per catalog",
    ].filter((problem) => problem !== undefined);

    if (Array.isReadonlyArrayNonEmpty(problems)) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: `Candidate cache is stale for ${problems.join(
          ", "
        )}. Rebuild with --build-cache.`,
        reason: "cache",
      });
    }
  });
}

function catalogCacheMetadata({
  args,
  definitions,
  exportedAt,
  inputStat,
}: {
  readonly args: CliArgs;
  readonly definitions: readonly CatalogDefinition[];
  readonly exportedAt: number;
  readonly inputStat: Stats;
}): CatalogCacheMetadata {
  return {
    catalogs: definitions,
    catalogsHash: catalogDefinitionsHash({ definitions }),
    createdAt: exportedAt,
    format: "mai.open-food-facts-catalog-cache",
    formatVersion: 1,
    input: {
      mtimeMs: inputStat.mtimeMs,
      path: args.input,
      size: inputStat.size,
    },
    kind: "metadata",
    ...(args.limit === undefined ? {} : { limit: args.limit }),
    ...(args.maxMatchesPerCatalog === undefined
      ? {}
      : { maxMatchesPerCatalog: args.maxMatchesPerCatalog }),
  };
}

function catalogDefinitionsHash({
  definitions,
}: {
  readonly definitions: readonly CatalogDefinition[];
}): string {
  return createHash("sha256").update(JSON.stringify(definitions)).digest("hex");
}

function cacheFieldsFromRow({
  row,
}: {
  readonly row: OpenFoodFactsRow;
}): Readonly<Record<string, string>> {
  return Object.fromEntries(
    cacheHeaderFields.map((field) => [field, fieldValue({ field, row })])
  );
}

function openFoodFactsRowFromCachedCandidate({
  candidate,
}: {
  readonly candidate: CatalogCacheCandidate;
}): OpenFoodFactsRow {
  return {
    cells: cacheHeaderFields.map((field) => candidate.fields[field] ?? ""),
    header: cacheHeader(),
  };
}

function cacheHeader(): Header {
  return {
    fields: cacheHeaderFields,
    indexByName: new Map(
      cacheHeaderFields.map((field, index) => [field, index])
    ),
    requiredFieldMaxIndex: cacheHeaderFields.length - 1,
  };
}

function rawScanMatchCapReached({
  definitions,
  header,
  matchCounts,
  maxMatchesPerCatalog,
  record,
  setHeader,
}: {
  readonly definitions: readonly CatalogDefinition[];
  readonly header: Header | undefined;
  readonly matchCounts: Map<string, number>;
  readonly maxMatchesPerCatalog: number;
  readonly record: TsvRecord;
  readonly setHeader: (header: Header) => void;
}): Effect.Effect<boolean, OpenFoodFactsCatalogImportError> {
  return Effect.gen(function* () {
    if (record._tag === "malformed" || isBlankRecord({ cells: record.cells })) {
      return false;
    }

    if (header === undefined) {
      setHeader(yield* decodeHeader({ cells: record.cells }));
      return false;
    }

    const row = {
      cells: record.cells,
      header,
    };

    for (const definition of definitions) {
      if (
        (matchCounts.get(definition.name) ?? 0) < maxMatchesPerCatalog &&
        rowMatchesCatalog({ definition, row })
      ) {
        matchCounts.set(
          definition.name,
          (matchCounts.get(definition.name) ?? 0) + 1
        );
      }
    }

    return definitions.every(
      (definition) =>
        (matchCounts.get(definition.name) ?? 0) >= maxMatchesPerCatalog
    );
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
      Array.isReadonlyArrayNonEmpty(missingRequiredFields) ||
      !hasEnergyField
    ) {
      return yield* new OpenFoodFactsCatalogImportError({
        detail: [
          Array.isReadonlyArrayNonEmpty(missingRequiredFields)
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
  definition,
  exportedAt,
  row,
}: {
  readonly definition: CatalogDefinition;
  readonly exportedAt: number;
  readonly row: OpenFoodFactsRow;
}): FoodConversion {
  const code = fieldValue({ field: "code", row }).trim();
  const rawName = fieldValue({ field: "product_name", row });
  const rawBrand = fieldValue({ field: "brands", row });
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

  if (normalizeText({ value: rawName }).length === 0) {
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
  const nutritionSkipReason = nutritionSkipReasonFromValues({
    carbs,
    energyKcal,
    fat,
    fiber,
    protein,
    salt,
    saturatedFat,
    sugars,
  });

  if (nutritionSkipReason !== undefined) {
    return { _tag: "skipped", reason: nutritionSkipReason };
  }

  const brandCleanup = cleanBrand({ definition, value: rawBrand });
  const nameCleanup = cleanProductName({
    brandTokens: brandCleanup.tokens,
    definition,
    value: rawName,
  });

  if (nameCleanup.name.length === 0) {
    return { _tag: "skipped", reason: "missing-name" };
  }

  const identitySkipReason = cleanupSkipReasonFromIdentity({
    brandTokens: brandCleanup.tokens,
    definition,
    name: nameCleanup.name,
  });

  if (identitySkipReason !== undefined) {
    return { _tag: "skipped", reason: identitySkipReason };
  }

  const warnings = cleanupWarningsFromIdentity({
    brandTokens: brandCleanup.tokens,
    carbs,
    definition,
    energyKcal,
    fat,
    name: nameCleanup.name,
    protein,
  });
  const food = {
    id: stableFoodIdFromOpenFoodFactsCode({ code }),
    name: nameCleanup.name,
    origin: "import",
    nutritionReference: { amount: 100, unit: "g" },
    energyKcal: roundNumber(energyKcal),
    proteinGrams: roundNumber(protein),
    carbsGrams: roundNumber(carbs),
    fatGrams: roundNumber(fat),
    portions: [],
    createdAt: exportedAt,
    updatedAt: exportedAt,
    ...(brandCleanup.brand === undefined ? {} : { brand: brandCleanup.brand }),
    ...(fiber === undefined ? {} : { fiberGrams: roundNumber(fiber) }),
    ...(sugars === undefined ? {} : { sugarGrams: roundNumber(sugars) }),
    ...(saturatedFat === undefined
      ? {}
      : { saturatedFatGrams: roundNumber(saturatedFat) }),
    ...(salt === undefined ? {} : { saltGrams: salt }),
  } satisfies CatalogFoodEncoded;

  return {
    _tag: "converted",
    changes: [...brandCleanup.changes, ...nameCleanup.changes],
    cleanedIdentityKey: cleanedIdentityKeyFromFood({ food }),
    code,
    food,
    identityScore: identityScoreFromFood({ food, warnings }),
    warnings,
  };
}

function cleanBrand({
  definition,
  value,
}: {
  readonly definition: CatalogDefinition;
  readonly value: string;
}): {
  readonly brand: string | undefined;
  readonly changes: readonly CleanupChangeReason[];
  readonly tokens: readonly string[];
} {
  const changes: CleanupChangeReason[] = [];
  const tokens: string[] = [];
  const seenComparableTokens = new Set<string>();

  for (const rawToken of splitBrandTokens({ value })) {
    const normalizedToken = normalizeText({ value: rawToken });

    if (normalizedToken !== rawToken.trim()) {
      changes.push("normalized-brand");
    }

    const withoutRetailer = removeRetailerReferences({
      definition,
      value: normalizedToken,
    });

    if (withoutRetailer.value !== normalizedToken) {
      changes.push("removed-brand-retailer");
    }

    if (withoutRetailer.value.length === 0) {
      continue;
    }

    const titleCasedToken = shouldTitleCaseText({
      value: withoutRetailer.value,
    })
      ? titleCaseText({ value: withoutRetailer.value })
      : withoutRetailer.value;

    if (titleCasedToken !== withoutRetailer.value) {
      changes.push("title-cased-brand");
    }

    const comparableToken = normalizeComparableText({ value: titleCasedToken });

    if (comparableToken.length === 0) {
      continue;
    }

    if (seenComparableTokens.has(comparableToken)) {
      changes.push("removed-brand-duplicate");
      continue;
    }

    seenComparableTokens.add(comparableToken);
    tokens.push(titleCasedToken);
  }

  return {
    brand: Array.isReadonlyArrayNonEmpty(tokens)
      ? tokens.join(", ")
      : undefined,
    changes,
    tokens,
  };
}

function cleanProductName({
  brandTokens,
  definition,
  value,
}: {
  readonly brandTokens: readonly string[];
  readonly definition: CatalogDefinition;
  readonly value: string;
}): {
  readonly changes: readonly CleanupChangeReason[];
  readonly name: string;
} {
  const changes: CleanupChangeReason[] = [];
  const normalizedName = normalizeText({ value });

  if (normalizedName !== value.trim()) {
    changes.push("normalized-name");
  }

  const titleCasedName = shouldTitleCaseText({ value: normalizedName })
    ? titleCaseText({ value: normalizedName })
    : normalizedName;

  if (titleCasedName !== normalizedName) {
    changes.push("title-cased-name");
  }

  const withoutRetailer = removeTrailingRetailerReferences({
    definition,
    value: titleCasedName,
  });

  if (withoutRetailer.value !== titleCasedName) {
    changes.push("removed-name-retailer");
  }

  const withoutBrand = removeTrailingBrandReferences({
    brandTokens,
    value: withoutRetailer.value,
  });

  if (withoutBrand.value !== withoutRetailer.value) {
    changes.push("removed-name-brand");
  }

  return {
    changes,
    name: withoutBrand.value,
  };
}

function splitBrandTokens({
  value,
}: {
  readonly value: string;
}): readonly string[] {
  return value
    .split(/[,;]|\s+-\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeText({ value }: { readonly value: string }): string {
  return trimTextSeparators({
    value: value
      .normalize("NFKC")
      .replace(/[\p{Control}\p{Format}]/gu, "")
      .replace(/[’`´]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " "),
  });
}

function trimTextSeparators({ value }: { readonly value: string }): string {
  return value
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[\s,;/\-]+/g, "")
    .replace(/[\s,;/\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldTitleCaseText({ value }: { readonly value: string }): boolean {
  const letters = globalThis.Array.from(value).filter((character) =>
    isCasedLetter({ value: character })
  );

  if (letters.length < 4) {
    return false;
  }

  const uppercaseLetters = letters.filter(
    (character) => character === character.toLocaleUpperCase("it-IT")
  );

  return uppercaseLetters.length / letters.length >= 0.85;
}

function isCasedLetter({ value }: { readonly value: string }): boolean {
  return (
    /\p{L}/u.test(value) &&
    value.toLocaleUpperCase("it-IT") !== value.toLocaleLowerCase("it-IT")
  );
}

function titleCaseText({ value }: { readonly value: string }): string {
  let wordIndex = 0;

  return value.replace(/\p{L}[\p{L}'’]*/gu, (word) => {
    const lowercaseWord = word.toLocaleLowerCase("it-IT");
    const comparableWord = normalizeComparableText({ value: lowercaseWord });
    const isFirstWord = wordIndex === 0;

    wordIndex += 1;

    if (titleCaseAcronyms.includes(comparableWord)) {
      return comparableWord.toLocaleUpperCase("it-IT");
    }

    if (
      !isFirstWord &&
      (lowercaseTitleCaseWords.includes(comparableWord) ||
        /^[dl]'/.test(lowercaseWord))
    ) {
      return lowercaseWord;
    }

    const characters = globalThis.Array.from(lowercaseWord);
    const firstCharacter = characters[0];

    if (firstCharacter === undefined) {
      return lowercaseWord;
    }

    return [
      firstCharacter.toLocaleUpperCase("it-IT"),
      characters.slice(1).join(""),
    ].join("");
  });
}

function removeRetailerReferences({
  definition,
  value,
}: {
  readonly definition: CatalogDefinition;
  readonly value: string;
}): { readonly value: string } {
  let cleaned = value;

  for (const pattern of retailerReferencePatterns({ definition })) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return { value: trimTextSeparators({ value: cleaned }) };
}

function removeTrailingRetailerReferences({
  definition,
  value,
}: {
  readonly definition: CatalogDefinition;
  readonly value: string;
}): { readonly value: string } {
  let cleaned = value;

  for (const token of retailerDisplayTokens({ definition })) {
    const escapedToken = escapeRegExp({ value: token });
    const parenthesizedPattern = new RegExp(
      `\\s*\\(${escapedToken}\\)\\s*$`,
      "iu"
    );
    const suffixPattern = new RegExp(
      `\\s*(?:-|,)\\s*${escapedToken}\\s*$`,
      "iu"
    );

    cleaned = cleaned.replace(parenthesizedPattern, " ");

    if (
      normalizeComparableText({ value: cleaned }) !==
      normalizeComparableText({ value: token })
    ) {
      cleaned = cleaned.replace(suffixPattern, " ");
    }
  }

  return { value: trimTextSeparators({ value: cleaned }) };
}

function removeTrailingBrandReferences({
  brandTokens,
  value,
}: {
  readonly brandTokens: readonly string[];
  readonly value: string;
}): { readonly value: string } {
  let cleaned = value;

  for (const brandToken of brandTokens) {
    const escapedToken = escapeRegExp({ value: brandToken });
    const pattern = new RegExp(`\\s*(?:-|,)?\\s+${escapedToken}\\s*$`, "iu");
    const nextValue = trimTextSeparators({
      value: cleaned.replace(pattern, " "),
    });

    if (
      nextValue !== cleaned &&
      wordCount({ value: nextValue }) >= 2 &&
      normalizeComparableText({ value: nextValue }).length > 0
    ) {
      cleaned = nextValue;
    }
  }

  return { value: cleaned };
}

function retailerReferencePatterns({
  definition,
}: {
  readonly definition: CatalogDefinition;
}): readonly RegExp[] {
  const normalizedStore = normalizeComparableText({ value: definition.store });

  if (normalizedStore === "lidl") {
    return [
      /\blidl\s+stiftung\s*(?:&|and)?\s*co\.?\s*kg\b/giu,
      /\bprodotto\s+lidl\b/giu,
      /\bproduit\s+lidl\b/giu,
      /\blidl(?=\p{L})/giu,
      /(?<=\p{L})lidl\b/giu,
      /\blidl\b/giu,
    ];
  }

  if (normalizedStore === "bennet") {
    return [/\bbennet\b/giu];
  }

  return [
    new RegExp(`\\b${escapeRegExp({ value: definition.store })}\\b`, "giu"),
  ];
}

function retailerDisplayTokens({
  definition,
}: {
  readonly definition: CatalogDefinition;
}): readonly string[] {
  const normalizedStore = normalizeComparableText({ value: definition.store });

  if (normalizedStore === "lidl") {
    return ["Lidl", "LIDL"];
  }

  if (normalizedStore === "bennet") {
    return ["Bennet", "bennet"];
  }

  return [definition.store];
}

function cleanupSkipReasonFromIdentity({
  brandTokens,
  definition,
  name,
}: {
  readonly brandTokens: readonly string[];
  readonly definition: CatalogDefinition;
  readonly name: string;
}): CleanupSkipReason | undefined {
  const comparableName = normalizeComparableText({ value: name });

  if (
    containsComparablePhrase({ phrases: contaminatedNamePhrases, value: name })
  ) {
    return "contaminated-name";
  }

  if (
    comparableName === normalizeComparableText({ value: definition.store }) ||
    retailerDisplayTokens({ definition }).some(
      (token) => comparableName === normalizeComparableText({ value: token })
    )
  ) {
    return "name-is-store";
  }

  if (
    brandTokens.some(
      (brandToken) =>
        comparableName === normalizeComparableText({ value: brandToken })
    )
  ) {
    return "name-is-brand";
  }

  if (unexpectedScriptRatio({ value: name }) > 0.25) {
    return "unexpected-script";
  }

  const foreignHintCount = foreignLanguageHintCount({ value: name });
  const italianHintCount = italianLanguageHintCount({ value: name });

  if (
    isItalianCatalog({ definition }) &&
    italianHintCount === 0 &&
    (foreignHintCount >= 2 ||
      (foreignHintCount >= 1 && hasNonItalianLatinDiacritic({ value: name })))
  ) {
    return "foreign-name-low-confidence";
  }

  return undefined;
}

function cleanupWarningsFromIdentity({
  carbs,
  definition,
  energyKcal,
  fat,
  name,
  protein,
}: {
  readonly brandTokens: readonly string[];
  readonly carbs: number;
  readonly definition: CatalogDefinition;
  readonly energyKcal: number;
  readonly fat: number;
  readonly name: string;
  readonly protein: number;
}): readonly CleanupWarningReason[] {
  const warnings: CleanupWarningReason[] = [];

  if (
    isItalianCatalog({ definition }) &&
    foreignLanguageHintCount({ value: name }) >= 2
  ) {
    warnings.push("foreign-language-name");
  }

  if (
    energyKcal > 50 &&
    Math.abs(energyKcal - (protein * 4 + carbs * 4 + fat * 9)) / energyKcal >
      0.45
  ) {
    warnings.push("energy-macro-mismatch");
  }

  return warnings;
}

function nutritionSkipReasonFromValues({
  carbs,
  energyKcal,
  fat,
  fiber,
  protein,
  salt,
  saturatedFat,
  sugars,
}: {
  readonly carbs: number;
  readonly energyKcal: number;
  readonly fat: number;
  readonly fiber: number | undefined;
  readonly protein: number;
  readonly salt: number | undefined;
  readonly saturatedFat: number | undefined;
  readonly sugars: number | undefined;
}): CleanupSkipReason | undefined {
  const gramValues = [protein, carbs, fat, fiber, sugars, saturatedFat].filter(
    (value) => value !== undefined
  );

  if (gramValues.some((value) => value > 100)) {
    return "macro-over-100g";
  }

  if (protein + carbs + fat > 105) {
    return "macro-total-over-105g";
  }

  if (energyKcal > 950) {
    return "energy-too-high";
  }

  if (salt !== undefined && salt > 20) {
    return "salt-too-high";
  }

  return undefined;
}

function cleanedIdentityKeyFromFood({
  food,
}: {
  readonly food: CatalogFoodEncoded;
}): string {
  return [
    normalizeComparableText({ value: food.brand ?? "" }),
    normalizeComparableText({ value: food.name }),
    roundedIdentityMacro({ value: food.energyKcal }),
    roundedIdentityMacro({ value: food.proteinGrams }),
    roundedIdentityMacro({ value: food.carbsGrams }),
    roundedIdentityMacro({ value: food.fatGrams }),
  ].join("|");
}

function identityScoreFromFood({
  food,
  warnings,
}: {
  readonly food: CatalogFoodEncoded;
  readonly warnings: readonly CleanupWarningReason[];
}): number {
  return (
    100 +
    (food.brand === undefined ? 0 : 20) +
    Math.min(wordCount({ value: food.name }), 6) * 2 -
    warnings.length * 10
  );
}

function roundedIdentityMacro({ value }: { readonly value: number }): string {
  return String(Math.round(value * 10) / 10);
}

function normalizeComparableText({
  value,
}: {
  readonly value: string;
}): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsComparablePhrase({
  phrases,
  value,
}: {
  readonly phrases: readonly string[];
  readonly value: string;
}): boolean {
  const comparableValue = normalizeComparableText({ value });

  return phrases.some((phrase) =>
    comparableValue.includes(normalizeComparableText({ value: phrase }))
  );
}

function unexpectedScriptRatio({ value }: { readonly value: string }): number {
  const letters = globalThis.Array.from(value).filter((character) =>
    /\p{L}/u.test(character)
  );

  if (!Array.isReadonlyArrayNonEmpty(letters)) {
    return 0;
  }

  const unexpectedLetters = letters.filter(
    (character) =>
      /\p{Script=Cyrillic}/u.test(character) ||
      /\p{Script=Greek}/u.test(character)
  );

  return unexpectedLetters.length / letters.length;
}

function hasNonItalianLatinDiacritic({
  value,
}: {
  readonly value: string;
}): boolean {
  return (
    /[^\x00-\x7F]/u.test(value) &&
    /[^A-Za-z0-9\s.,;:'’%()\-àèéìòùÀÈÉÌÒÙ]/u.test(value)
  );
}

function foreignLanguageHintCount({
  value,
}: {
  readonly value: string;
}): number {
  return wordMatchesFromList({ words: foreignLanguageHintWords, value });
}

function italianLanguageHintCount({
  value,
}: {
  readonly value: string;
}): number {
  return wordMatchesFromList({ words: italianLanguageHintWords, value });
}

function wordMatchesFromList({
  value,
  words,
}: {
  readonly value: string;
  readonly words: readonly string[];
}): number {
  const normalizedWords = comparableWords({ value });
  let count = 0;

  for (const word of normalizedWords) {
    if (words.includes(word)) {
      count += 1;
    }
  }

  return count;
}

function comparableWords({
  value,
}: {
  readonly value: string;
}): readonly string[] {
  const comparable = normalizeComparableText({ value });

  return comparable.length === 0 ? [] : comparable.split(" ");
}

function wordCount({ value }: { readonly value: string }): number {
  return comparableWords({ value }).length;
}

function isItalianCatalog({
  definition,
}: {
  readonly definition: CatalogDefinition;
}): boolean {
  return normalizeTag(definition.countryTag) === "en:italy";
}

function escapeRegExp({ value }: { readonly value: string }): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function emptyCleanupChangeStats(): CleanupChangeStats {
  return {
    normalizedBrand: 0,
    normalizedName: 0,
    removedBrandDuplicate: 0,
    removedBrandRetailer: 0,
    removedNameBrand: 0,
    removedNameRetailer: 0,
    titleCasedBrand: 0,
    titleCasedName: 0,
  };
}

function emptyCleanupSkipStats(): CleanupSkipStats {
  return {
    contaminatedName: 0,
    energyTooHigh: 0,
    foreignNameLowConfidence: 0,
    macroOver100g: 0,
    macroTotalOver105g: 0,
    nameIsBrand: 0,
    nameIsStore: 0,
    saltTooHigh: 0,
    unexpectedScript: 0,
  };
}

function emptyCleanupWarningStats(): CleanupWarningStats {
  return {
    energyMacroMismatch: 0,
    foreignLanguageName: 0,
  };
}

function incrementCleanupChangeStats({
  changes,
  runStats,
  stats,
}: {
  readonly changes: readonly CleanupChangeReason[];
  readonly runStats: CleanupChangeStats;
  readonly stats: CleanupChangeStats;
}): void {
  for (const change of changes) {
    incrementCleanupChangeStat({ change, stats });
    incrementCleanupChangeStat({ change, stats: runStats });
  }
}

function incrementCleanupChangeStat({
  change,
  stats,
}: {
  readonly change: CleanupChangeReason;
  readonly stats: CleanupChangeStats;
}): void {
  if (change === "normalized-brand") {
    stats.normalizedBrand += 1;
    return;
  }

  if (change === "normalized-name") {
    stats.normalizedName += 1;
    return;
  }

  if (change === "removed-brand-duplicate") {
    stats.removedBrandDuplicate += 1;
    return;
  }

  if (change === "removed-brand-retailer") {
    stats.removedBrandRetailer += 1;
    return;
  }

  if (change === "removed-name-brand") {
    stats.removedNameBrand += 1;
    return;
  }

  if (change === "removed-name-retailer") {
    stats.removedNameRetailer += 1;
    return;
  }

  if (change === "title-cased-brand") {
    stats.titleCasedBrand += 1;
    return;
  }

  stats.titleCasedName += 1;
}

function incrementCleanupWarningStats({
  runStats,
  stats,
  warnings,
}: {
  readonly runStats: CleanupWarningStats;
  readonly stats: CleanupWarningStats;
  readonly warnings: readonly CleanupWarningReason[];
}): void {
  for (const warning of warnings) {
    incrementCleanupWarningStat({ stats, warning });
    incrementCleanupWarningStat({ stats: runStats, warning });
  }
}

function incrementCleanupWarningStat({
  stats,
  warning,
}: {
  readonly stats: CleanupWarningStats;
  readonly warning: CleanupWarningReason;
}): void {
  if (warning === "energy-macro-mismatch") {
    stats.energyMacroMismatch += 1;
    return;
  }

  stats.foreignLanguageName += 1;
}

function incrementSkipStats({
  reason,
  runStats,
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
  readonly runStats: CatalogStats;
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

  if (reason === "missing-required-macros") {
    stats.missingRequiredMacros += 1;
    return;
  }

  stats.invalidFoods += 1;
  incrementCleanupSkipStat({ reason, stats: stats.cleanupRejectedFoods });
  incrementCleanupSkipStat({ reason, stats: runStats.rejectedFoods });
}

function incrementCleanupSkipStat({
  reason,
  stats,
}: {
  readonly reason: CleanupSkipReason;
  readonly stats: CleanupSkipStats;
}): void {
  if (reason === "contaminated-name") {
    stats.contaminatedName += 1;
    return;
  }

  if (reason === "energy-too-high") {
    stats.energyTooHigh += 1;
    return;
  }

  if (reason === "foreign-name-low-confidence") {
    stats.foreignNameLowConfidence += 1;
    return;
  }

  if (reason === "macro-over-100g") {
    stats.macroOver100g += 1;
    return;
  }

  if (reason === "macro-total-over-105g") {
    stats.macroTotalOver105g += 1;
    return;
  }

  if (reason === "name-is-brand") {
    stats.nameIsBrand += 1;
    return;
  }

  if (reason === "name-is-store") {
    stats.nameIsStore += 1;
    return;
  }

  if (reason === "salt-too-high") {
    stats.saltTooHigh += 1;
    return;
  }

  stats.unexpectedScript += 1;
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
    cachedCandidates: state.stats.cachedCandidates,
    rowsScanned: state.stats.rowsScanned,
    skippedMissingMacros: state.stats.missingRequiredMacros,
  });
}

function logCacheBuildProgressIfNeeded({
  args,
  state,
}: {
  readonly args: CliArgs;
  readonly state: CacheBuildState;
}): Effect.Effect<void> {
  if (
    state.stats.rowsScanned === 0 ||
    state.stats.rowsScanned % args.logEvery !== 0
  ) {
    return Effect.void;
  }

  return Effect.logInfo("Open Food Facts candidate cache build progress", {
    candidateRows: state.stats.candidateRows,
    matchesByCatalog: Object.fromEntries(state.matchesByCatalogName),
    rowsScanned: state.stats.rowsScanned,
  });
}

function throttleIfNeeded({
  args,
  state,
}: {
  readonly args: CliArgs;
  readonly state: ImportState;
}): Effect.Effect<void> {
  return throttleRowsIfNeeded({
    args,
    rowsScanned: state.stats.rowsScanned,
  });
}

function throttleCacheBuildIfNeeded({
  args,
  state,
}: {
  readonly args: CliArgs;
  readonly state: CacheBuildState;
}): Effect.Effect<void> {
  return throttleRowsIfNeeded({
    args,
    rowsScanned: state.stats.rowsScanned,
  });
}

function throttleRowsIfNeeded({
  args,
  rowsScanned,
}: {
  readonly args: CliArgs;
  readonly rowsScanned: number;
}): Effect.Effect<void> {
  if (
    args.yieldEvery === undefined ||
    rowsScanned === 0 ||
    rowsScanned % args.yieldEvery !== 0
  ) {
    return Effect.void;
  }

  return Effect.sleep(args.sleepMs);
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
