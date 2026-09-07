import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { buildAnalysisData } from "../src/services/analysis-data.ts";
import {
  makeAnalysisDocumentation,
  makeJsonSchema,
} from "../src/services/analysis-documentation.ts";
import { MaiBackupStores, MaiBackupV1 } from "../src/services/backup.ts";
import { TableSchemas } from "../src/services/analysis-schema.ts";
import { analysisFixture, loadAnalysisFixture } from "./analysis-fixture.ts";

describe("agent analysis data", () => {
  it("preserves every source record and calculates corrected quantities with uncertainty", async () => {
    const backup = await loadAnalysisFixture();
    const data = await Effect.runPromise(buildAnalysisData(backup));
    const encoded = await Effect.runPromise(
      Schema.encodeEffect(MaiBackupStores)(backup.stores)
    );
    for (const [collection, records] of Object.entries(encoded)) {
      assert.deepEqual(
        await Effect.runPromise(
          Effect.forEach(
            data.source_records.filter((row) => row.collection === collection),
            (row) =>
              Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
                row.recordJson
              )
          )
        ),
        [...records]
      );
    }
    assert.equal(data.entries[0]?.amountDescription, "2 × Original cup");
    assert.equal(
      data.entries[1]?.note,
      "Menu says 700 kcal.\nProtein unavailable."
    );
    assert.deepInclude(
      data.daily_nutrients.find(
        (row) => row.date === "2026-01-01" && row.nutrient === "energyKcal"
      ),
      {
        knownTotal: 940,
        recordedTotal: 700,
        estimatedTotal: 240,
        recordedEntryCount: 1,
        estimatedEntryCount: 1,
        missingEntryCount: 0,
      }
    );
    assert.deepInclude(
      data.daily_nutrients.find(
        (row) => row.date === "2026-01-01" && row.nutrient === "proteinGrams"
      ),
      { knownTotal: 20, estimatedTotal: 20, missingEntryCount: 1 }
    );
    assert.deepInclude(
      data.daily_nutrients.find(
        (row) => row.date === "2026-01-01" && row.nutrient === "saltGrams"
      ),
      { knownTotal: 0, recordedEntryCount: 1, missingEntryCount: 1 }
    );
    assert.deepInclude(data.recorded_events[0], { occurredAt: null });
    assert.equal(data.event_types[0]?.archivedAt, 3);
  });

  it("distinguishes absent, fasting, unrecorded, empty eating days, and water zero", async () => {
    const data = await Effect.runPromise(
      buildAnalysisData(await loadAnalysisFixture())
    );
    assert.deepEqual(
      data.days.map((day) => day.loggingStatus),
      ["eating", "absent", "fasting", "not-recorded", "eating", "absent"]
    );
    assert.deepEqual(
      data.days.map((day) => day.waterMl),
      [0, null, null, 500, null, null]
    );
    assert.isTrue(
      data.daily_nutrients
        .filter((row) => row.date !== "2026-01-01")
        .every((row) => row.knownTotal === null)
    );
    assert.equal(
      data.plan_targets.find((row) => row.nutrient === "energyKcal")?.amount,
      1740
    );
  });

  it("generates a description for every analysis table and column and keeps defaulted source annotations", async () => {
    const docs = await Effect.runPromise(makeAnalysisDocumentation());
    for (const schema of Object.values(TableSchemas)) {
      const row = makeJsonSchema(schema);
      assert.include(
        await Effect.runPromise(
          Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(row)
        ),
        '"description":'
      );
      for (const field of Object.values(schema.fields))
        assert.include(
          await Effect.runPromise(
            Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
              makeJsonSchema(field)
            )
          ),
          '"description":'
        );
    }
    const water = docs.backupSchema.$defs.DailyLogEncoded;
    assert.include(
      await Effect.runPromise(
        Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(water)
      ),
      "250 ml"
    );
    assert.include(
      await Effect.runPromise(
        Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
          docs.backupSchema
        )
      ),
      "Overrides take precedence"
    );
    assert.include(docs.guide, "not meal times");
  });

  it("handles empty exports without inventing a date range", async () => {
    const fixture = analysisFixture();
    const backup = await Effect.runPromise(
      Schema.decodeEffect(MaiBackupV1)({
        ...fixture,
        stores: {
          activeMealPlanSelections: [],
          bodyWeightEntries: [],
          dailyLogs: [],
          foods: [],
          mealEntries: [],
          plans: [],
          recordableEvents: [],
          recordedEvents: [],
        },
        integrity: {
          counts: {
            activeMealPlanSelections: 0,
            bodyWeightEntries: 0,
            dailyLogs: 0,
            foods: 0,
            mealEntries: 0,
            plans: 0,
            recordableEvents: 0,
            recordedEvents: 0,
          },
        },
      })
    );
    const data = await Effect.runPromise(buildAnalysisData(backup));
    assert.deepEqual(data.days, []);
    assert.deepEqual(data.source_records, []);
  });
});
