import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain } from "../src/index.ts";

describe("event-tracking domain", () => {
  it("trims recordable event names while decoding", async () => {
    const name = await Effect.runPromise(
      Schema.decodeEffect(Domain.RecordableEventName)("  Morning walk  ")
    );

    assert.equal(name, "Morning walk");
  });

  it("accepts one emoji grapheme including composed emoji", async () => {
    const emojis = ["☕️", "👨‍👩‍👧‍👦", "🇮🇹", "👍🏽", "1️⃣", "🏳️‍🌈", "🫱🏽‍🫲🏿"];
    const decoded = await Effect.runPromise(
      Effect.forEach(emojis, (emoji) =>
        Schema.decodeEffect(Domain.EventEmoji)(emoji)
      )
    );

    assert.deepEqual(decoded, emojis);
  });

  it("rejects text, empty values, and multiple emoji graphemes", async () => {
    const invalidValues = ["", "A", "☕️👍", "walk 🚶"];
    const failures = await Effect.runPromise(
      Effect.forEach(invalidValues, (value) =>
        Schema.decodeEffect(Domain.EventEmoji)(value).pipe(Effect.flip)
      )
    );

    assert.equal(failures.length, invalidValues.length);
  });

  it("accepts leap days and rejects impossible calendar dates", async () => {
    const leapDay = await Effect.runPromise(
      Schema.decodeEffect(Domain.DateKey)("2024-02-29")
    );
    const invalidValues = [
      "0000-01-01",
      "2025-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-1-01",
    ];
    const failures = await Effect.runPromise(
      Effect.forEach(invalidValues, (value) =>
        Schema.decodeEffect(Domain.DateKey)(value).pipe(Effect.flip)
      )
    );

    assert.equal(leapDay, "2024-02-29");
    assert.equal(failures.length, invalidValues.length);
  });

  it("rejects negative and fractional positions", async () => {
    const failures = await Effect.runPromise(
      Effect.forEach([-1, 1.5], (value) =>
        Schema.decodeEffect(Domain.RecordableEventPosition)(value).pipe(
          Effect.flip
        )
      )
    );

    assert.equal(failures.length, 2);
  });
});
