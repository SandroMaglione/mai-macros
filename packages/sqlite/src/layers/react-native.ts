import { SqliteClient } from "@effect/sql-sqlite-react-native";
import { Layer } from "effect";

import { runSqliteMigrations } from "../migrations/index.ts";
import { SqliteNutritionStoreLayer } from "../store.ts";

export const ReactNativeSqliteLayer = (config: {
  readonly encryptionKey?: string | undefined;
  readonly filename: string;
  readonly location?: string | undefined;
}) =>
  SqliteNutritionStoreLayer.pipe(
    Layer.provideMerge(
      Layer.effectDiscard(runSqliteMigrations).pipe(
        Layer.provideMerge(SqliteClient.layer(config))
      )
    )
  );
