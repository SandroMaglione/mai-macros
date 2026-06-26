import { Context, Data, Effect, Layer } from "effect";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export class GzipError extends Data.TaggedError("GzipError")<{
  readonly detail: string;
  readonly error: unknown;
}> {}

export function isGzipBytes({
  bytes,
}: {
  readonly bytes: Uint8Array;
}): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export class Gzip extends Context.Service<Gzip>()("Gzip", {
  make: Effect.succeed({
    bytesToText: Effect.fn("Gzip.bytesToText")(function* ({
      bytes,
    }: {
      readonly bytes: Uint8Array;
    }) {
      return yield* Effect.try({
        try: () => strFromU8(bytes),
        catch: (error) =>
          new GzipError({
            detail: "The file contents could not be decoded as UTF-8 text.",
            error,
          }),
      });
    }),

    gzipText: Effect.fn("Gzip.gzipText")(function* ({
      text,
    }: {
      readonly text: string;
    }) {
      return yield* Effect.try({
        try: () => gzipSync(strToU8(text)),
        catch: (error) =>
          new GzipError({
            detail: "The backup JSON could not be compressed.",
            error,
          }),
      });
    }),

    gunzipText: Effect.fn("Gzip.gunzipText")(function* ({
      bytes,
    }: {
      readonly bytes: Uint8Array;
    }) {
      return yield* Effect.try({
        try: () => strFromU8(gunzipSync(bytes)),
        catch: (error) =>
          new GzipError({
            detail: "The selected backup file could not be decompressed.",
            error,
          }),
      });
    }),

    textToBytes: Effect.fn("Gzip.textToBytes")(function* ({
      text,
    }: {
      readonly text: string;
    }) {
      return yield* Effect.try({
        try: () => strToU8(text),
        catch: (error) =>
          new GzipError({
            detail: "The text could not be encoded as UTF-8 bytes.",
            error,
          }),
      });
    }),
  }),
}) {
  static readonly Default = Layer.effect(this)(this.make);
}
