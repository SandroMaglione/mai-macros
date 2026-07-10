import { FoodCatalogTransfer } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { FoodCatalogShare, QrCode } from "../src/index.ts";

describe("FoodCatalogShare", () => {
  it("encodes catalog JSON into a schema-backed share envelope", async () => {
    const catalogJson = await Effect.runPromise(testCatalogJson);
    const encoded = await Effect.runPromise(
      FoodCatalogShare.encodeCatalogJson({ catalogJson })
    );
    const envelope = await Effect.runPromise(
      Schema.decodeEffect(FoodCatalogShare.FoodCatalogShareEnvelopeJson)(
        encoded.shareText
      )
    );

    assert.equal(envelope.format, "mai.food-catalog-share");
    assert.equal(envelope.formatVersion, 1);
    assert.equal(envelope.payload.kind, "plain-catalog-json");
    assert.equal(envelope.payload.catalog.format, "mai.food-catalog");
    assert.isTrue(encoded.size.canUseSingleQr);
  });

  it("decodes a share envelope back to canonical catalog JSON", async () => {
    const catalogJson = await Effect.runPromise(testCatalogJson);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const encoded = yield* FoodCatalogShare.encodeCatalogJson({
          catalogJson,
        });

        return yield* FoodCatalogShare.decodeShareText({
          text: encoded.shareText,
        });
      })
    );

    assert.equal(result.source, "share-envelope");
    assert.equal(result.catalogJson, catalogJson);
    assert.equal(result.catalog.stores.foods[0]?.name, "Greek yogurt");
    assert.isDefined(result.envelope);
  });

  it("accepts raw mai.food-catalog JSON as fallback input", async () => {
    const catalogJson = await Effect.runPromise(testCatalogJson);
    const result = await Effect.runPromise(
      FoodCatalogShare.decodeShareText({ text: catalogJson })
    );

    assert.equal(result.source, "raw-catalog-json");
    assert.equal(result.catalogJson, catalogJson);
    assert.equal(result.catalog.integrity.counts.foods, 1);
    assert.isUndefined(result.envelope);
  });

  it("rejects invalid share payloads", async () => {
    const failure = await Effect.runPromise(
      FoodCatalogShare.decodeShareText({
        text: '{"format":"mai.unknown"}',
      }).pipe(Effect.flip)
    );

    assert.instanceOf(failure, FoodCatalogShare.FoodCatalogShareDecodeError);
    assert.equal(failure.reason, "invalid-share-text");
  });

  it("classifies oversized text as too large for a single QR", () => {
    const text = "x".repeat(FoodCatalogShare.SingleQrTextByteLimit + 1);
    const size = FoodCatalogShare.assessShareTextSize({ text });

    assert.isFalse(size.canUseSingleQr);
    assert.isTrue(size.tooLargeForSingleQr);
    assert.equal(size.status, "too-large-for-single-qr");
  });

  it("generates a QR code data URL for share text", async () => {
    const catalogJson = await Effect.runPromise(testCatalogJson);
    const dataUrl = await Effect.runPromise(
      Effect.gen(function* () {
        const encoded = yield* FoodCatalogShare.encodeCatalogJson({
          catalogJson,
        });
        const qrCodes = yield* QrCode.QrCode;

        return yield* qrCodes.generate(encoded.shareText);
      }).pipe(Effect.provide(QrCode.QrCode.Default))
    );

    assert.match(dataUrl, /^data:image\/png;base64,/);
  });
});

const testCatalogJson = Effect.gen(function* () {
  const catalog = yield* Schema.decodeEffect(
    FoodCatalogTransfer.MaiFoodCatalogV1
  )({
    format: "mai.food-catalog",
    formatVersion: 1,
    integrity: {
      counts: {
        foods: 1,
      },
    },
    source: {
      databaseName: "mai",
      databaseVersion: 6,
      exportedAt: 0,
    },
    stores: {
      foods: [
        {
          id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
          name: "Greek yogurt",
          brand: "Mai",
          origin: "user",
          nutritionReference: { amount: 100, unit: "g" },
          energyKcal: 59,
          proteinGrams: 10,
          carbsGrams: 3.6,
          fatGrams: 0.4,
          fiberGrams: 0,
          sugarGrams: 3.2,
          saturatedFatGrams: 0.1,
          saltGrams: 0.04,
          portions: [],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    },
  });

  yield* FoodCatalogTransfer.validateFoodCatalog({ catalog });

  return yield* Schema.encodeEffect(FoodCatalogTransfer.MaiFoodCatalogJson)(
    catalog
  );
});
