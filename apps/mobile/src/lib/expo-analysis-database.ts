import { Crypto, Effect, Layer } from "effect";
import * as SqliteClient from "@effect/sql-sqlite-react-native/SqliteClient";
import { Directory, File, Paths } from "expo-file-system";
import { AnalysisDatabase } from "@mai/nutrition/services/analysis-database";
import { AnalysisExportError } from "@mai/nutrition/services/analysis-documentation";
import { writeAnalysisDatabase } from "@mai/sqlite/layers/analysis-export";

export const ExpoAnalysisDatabaseLayer = Layer.effect(
  AnalysisDatabase,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    return AnalysisDatabase.of({
      render: (input) =>
        Effect.scoped(
          Effect.gen(function* () {
            const id = yield* crypto.randomUUIDv4;
            const directory = yield* Effect.acquireRelease(
              Effect.try({
                try: () => {
                  const directory = new Directory(
                    Paths.cache,
                    `mai-analysis-${id}`
                  );
                  directory.create();
                  return directory;
                },
                catch: (cause) =>
                  new AnalysisExportError({
                    detail: "Could not create a temporary export directory.",
                    cause,
                  }),
              }),
              (directory) =>
                Effect.try({
                  try: () => directory.delete(),
                  catch: (cause) =>
                    new AnalysisExportError({
                      detail: "Could not remove temporary export files.",
                      cause,
                    }),
                }).pipe(
                  Effect.catch((error) => Effect.logWarning(error.detail))
                )
            );
            yield* writeAnalysisDatabase(input).pipe(
              SqliteClient.withAsyncQuery,
              Effect.provide(
                SqliteClient.layer({
                  filename: "analysis.sqlite",
                  location: directory.uri.replace("file://", ""),
                })
              )
            );
            return yield* Effect.tryPromise({
              try: () => new File(directory, "analysis.sqlite").bytes(),
              catch: (cause) =>
                new AnalysisExportError({
                  detail: "Could not read the completed analysis database.",
                  cause,
                }),
            });
          })
        ).pipe(
          Effect.mapError((cause) =>
            cause instanceof AnalysisExportError
              ? cause
              : new AnalysisExportError({
                  detail:
                    "Could not build the analysis database. Your diary has not been changed.",
                  cause,
                })
          )
        ),
    });
  })
);
