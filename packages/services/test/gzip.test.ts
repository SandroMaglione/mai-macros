import { Effect } from "effect";
import { assert, describe, it } from "vitest";

import { Gzip } from "../src/index.ts";

describe("Gzip", () => {
  it("compresses and decompresses text", async () => {
    const text = '{"format":"mai.backup","stores":{"foods":["yogurt"]}}';
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const gzip = yield* Gzip.Gzip;
        const compressed = yield* gzip.gzipText({ text });
        const decompressed = yield* gzip.gunzipText({ bytes: compressed });

        return {
          compressed,
          decompressed,
        };
      }).pipe(Effect.provide(Gzip.Gzip.Default))
    );

    assert.isTrue(Gzip.isGzipBytes({ bytes: result.compressed }));
    assert.equal(result.decompressed, text);
  });

  it("decodes plain UTF-8 bytes", async () => {
    const text = "Mai backup";
    const decoded = await Effect.runPromise(
      Effect.gen(function* () {
        const gzip = yield* Gzip.Gzip;
        const bytes = yield* gzip.textToBytes({ text });

        return yield* gzip.bytesToText({ bytes });
      }).pipe(Effect.provide(Gzip.Gzip.Default))
    );

    assert.equal(decoded, text);
  });

  it("rejects invalid gzip bytes", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const gzip = yield* Gzip.Gzip;

        return yield* gzip.gunzipText({
          bytes: new Uint8Array([0x6d, 0x61, 0x69]),
        });
      }).pipe(Effect.provide(Gzip.Gzip.Default), Effect.flip)
    );

    assert.instanceOf(failure, Gzip.GzipError);
  });
});
