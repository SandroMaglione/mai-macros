import * as SqliteClient from "@effect/sql-sqlite-react-native/SqliteClient";
import { Layer } from "effect";

import { SqliteLocalDataLayer } from "../local-data.ts";
import { runSqliteMigrations } from "../migrations/index.ts";
import { SqliteNutritionStoreLayer } from "../store.ts";

export const ReactNativeSqliteLayer = (config: {
  readonly encryptionKey?: string | undefined;
  readonly filename: string;
  readonly location?: string | undefined;
}) =>
  Layer.mergeAll(SqliteNutritionStoreLayer, SqliteLocalDataLayer).pipe(
    Layer.provideMerge(
      Layer.effectDiscard(runSqliteMigrations).pipe(
        Layer.provideMerge(SqliteClient.layer(config))
      )
    )
  );
