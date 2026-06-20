import * as Migrator from "effect/unstable/sql/Migrator";

import migration001 from "./001-initial.ts";

export const SqliteMigrationLoader = Migrator.fromRecord({
  "001_initial": migration001,
});

export const runSqliteMigrations = Migrator.make({})({
  loader: SqliteMigrationLoader,
  table: "mai_migrations",
});
