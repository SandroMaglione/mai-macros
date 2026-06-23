import { FoodCatalogTransfer } from "@mai/nutrition";
import { Data, Effect, Schema } from "effect";

export const Format = "mai.food-catalog-share";
export const FormatVersion = 1;
export const PlainCatalogJsonPayloadKind = "plain-catalog-json";
export const SingleQrTextByteLimit = 1_200;

export const FoodCatalogShareFormat = Schema.Literal(Format);
export const FoodCatalogShareFormatVersion = Schema.Literal(FormatVersion);
export const FoodCatalogSharePayloadKind = Schema.Literal(
  PlainCatalogJsonPayloadKind
);

export const NonEmptyText = Schema.String.check(Schema.isNonEmpty());

export const FoodCatalogShareText = NonEmptyText.pipe(
  Schema.brand("FoodCatalogShareText")
);

export type FoodCatalogShareText = typeof FoodCatalogShareText.Type;

export const FoodCatalogShareSource = Schema.Literals([
  "share-envelope",
  "raw-catalog-json",
]);

export type FoodCatalogShareSource = typeof FoodCatalogShareSource.Type;

export const FoodCatalogShareSizeStatus = Schema.Literals([
  "single-qr",
  "too-large-for-single-qr",
]);

export type FoodCatalogShareSizeStatus = typeof FoodCatalogShareSizeStatus.Type;

export const FoodCatalogShareDecodeErrorReason = Schema.Literals([
  "empty-text",
  "invalid-catalog-json",
  "invalid-share-text",
]);

export type FoodCatalogShareDecodeErrorReason =
  typeof FoodCatalogShareDecodeErrorReason.Type;

export type FoodCatalogShareSizeAssessment = {
  readonly canUseSingleQr: boolean;
  readonly encodedTextByteLength: number;
  readonly singleQrTextByteLimit: number;
  readonly status: FoodCatalogShareSizeStatus;
  readonly tooLargeForSingleQr: boolean;
};

export class PlainCatalogJsonPayload extends Schema.Class<PlainCatalogJsonPayload>(
  "PlainCatalogJsonPayload"
)({
  kind: FoodCatalogSharePayloadKind,
  catalog: FoodCatalogTransfer.MaiFoodCatalogV1,
}) {}

export class FoodCatalogShareEnvelopeV1 extends Schema.Class<FoodCatalogShareEnvelopeV1>(
  "FoodCatalogShareEnvelopeV1"
)({
  format: FoodCatalogShareFormat,
  formatVersion: FoodCatalogShareFormatVersion,
  payload: PlainCatalogJsonPayload,
}) {}

export type FoodCatalogShareEnvelope = typeof FoodCatalogShareEnvelopeV1.Type;

export type FoodCatalogShareEnvelopeEncoded =
  typeof FoodCatalogShareEnvelopeV1.Encoded;

export const FoodCatalogShareEnvelopeJson = Schema.fromJsonString(
  FoodCatalogShareEnvelopeV1
);

const EncodeCatalogJsonInput = Schema.Struct({
  catalogJson: NonEmptyText,
});

const DecodeShareTextInput = Schema.Struct({
  text: Schema.String,
});

export type EncodeCatalogJsonInput = typeof EncodeCatalogJsonInput.Encoded;
export type DecodeShareTextInput = typeof DecodeShareTextInput.Encoded;

export class EncodedFoodCatalogShare extends Data.TaggedClass(
  "EncodedFoodCatalogShare"
)<{
  readonly catalog: FoodCatalogTransfer.MaiFoodCatalog;
  readonly catalogJson: string;
  readonly envelope: FoodCatalogShareEnvelope;
  readonly shareText: FoodCatalogShareText;
  readonly size: FoodCatalogShareSizeAssessment;
}> {}

export class DecodedFoodCatalogShare extends Data.TaggedClass(
  "DecodedFoodCatalogShare"
)<{
  readonly catalog: FoodCatalogTransfer.MaiFoodCatalog;
  readonly catalogJson: string;
  readonly envelope?: FoodCatalogShareEnvelope;
  readonly shareText: FoodCatalogShareText;
  readonly size: FoodCatalogShareSizeAssessment;
  readonly source: FoodCatalogShareSource;
}> {}

export class FoodCatalogShareDecodeError extends Data.TaggedError(
  "FoodCatalogShareDecodeError"
)<{
  readonly detail: string;
  readonly reason: FoodCatalogShareDecodeErrorReason;
}> {}

export const encodeCatalogJson = Effect.fn(
  "FoodCatalogShare.encodeCatalogJson"
)(function* ({ catalogJson }: EncodeCatalogJsonInput) {
  const decodedInput = yield* Schema.decodeEffect(EncodeCatalogJsonInput)({
    catalogJson: catalogJson.trim(),
  });
  const decodedCatalog = yield* _decodeCatalogJson({
    catalogJson: decodedInput.catalogJson,
  });
  const encodedCatalog = yield* Schema.encodeEffect(
    FoodCatalogTransfer.MaiFoodCatalogV1
  )(decodedCatalog.catalog);
  const envelope = yield* Schema.decodeEffect(FoodCatalogShareEnvelopeV1)({
    format: Format,
    formatVersion: FormatVersion,
    payload: {
      kind: PlainCatalogJsonPayloadKind,
      catalog: encodedCatalog,
    },
  });
  const shareText = yield* _makeShareText(
    yield* Schema.encodeEffect(FoodCatalogShareEnvelopeJson)(envelope)
  );

  return new EncodedFoodCatalogShare({
    catalog: decodedCatalog.catalog,
    catalogJson: decodedCatalog.catalogJson,
    envelope,
    shareText,
    size: assessShareTextSize({ text: shareText }),
  });
});

export const decodeShareText = Effect.fn("FoodCatalogShare.decodeShareText")(
  function* ({ text }: DecodeShareTextInput) {
    const decodedInput = yield* Schema.decodeEffect(DecodeShareTextInput)({
      text,
    });
    const trimmedText = decodedInput.text.trim();

    if (trimmedText.length === 0) {
      return yield* new FoodCatalogShareDecodeError({
        detail: "The share text is empty.",
        reason: "empty-text",
      });
    }

    const shareText = yield* _makeShareText(trimmedText);

    return yield* Effect.matchEffect(
      Schema.decodeEffect(FoodCatalogShareEnvelopeJson)(shareText),
      {
        onFailure: (envelopeError) =>
          Effect.matchEffect(_decodeCatalogJson({ catalogJson: shareText }), {
            onFailure: (catalogError) =>
              new FoodCatalogShareDecodeError({
                detail: `The text is not a supported food catalog share envelope or raw food catalog JSON. Envelope error: ${String(
                  envelopeError
                )}. Raw catalog error: ${String(catalogError)}.`,
                reason: "invalid-share-text",
              }),
            onSuccess: ({ catalog, catalogJson }) =>
              Effect.succeed(
                new DecodedFoodCatalogShare({
                  catalog,
                  catalogJson,
                  shareText,
                  size: assessShareTextSize({ text: shareText }),
                  source: "raw-catalog-json",
                })
              ),
          }),
        onSuccess: (envelope) =>
          Effect.matchEffect(
            _decodeCatalog({
              catalog: envelope.payload.catalog,
            }),
            {
              onFailure: (catalogError) =>
                new FoodCatalogShareDecodeError({
                  detail: `The food catalog share envelope contains invalid catalog JSON. Catalog error: ${String(
                    catalogError
                  )}.`,
                  reason: "invalid-catalog-json",
                }),
              onSuccess: ({ catalog, catalogJson }) =>
                Effect.succeed(
                  new DecodedFoodCatalogShare({
                    catalog,
                    catalogJson,
                    envelope,
                    shareText,
                    size: assessShareTextSize({ text: shareText }),
                    source: "share-envelope",
                  })
                ),
            }
          ),
      }
    );
  }
);

export function assessShareTextSize({
  text,
}: {
  readonly text: string;
}): FoodCatalogShareSizeAssessment {
  let encodedTextByteLength = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      encodedTextByteLength += 1;
    } else if (codePoint <= 0x7ff) {
      encodedTextByteLength += 2;
    } else if (codePoint <= 0xffff) {
      encodedTextByteLength += 3;
    } else {
      encodedTextByteLength += 4;
    }
  }

  const canUseSingleQr = encodedTextByteLength <= SingleQrTextByteLimit;

  return {
    canUseSingleQr,
    encodedTextByteLength,
    singleQrTextByteLimit: SingleQrTextByteLimit,
    status: canUseSingleQr ? "single-qr" : "too-large-for-single-qr",
    tooLargeForSingleQr: !canUseSingleQr,
  };
}

export function canUseSingleQr({ text }: { readonly text: string }): boolean {
  return assessShareTextSize({ text }).canUseSingleQr;
}

export function tooLargeForSingleQr({
  text,
}: {
  readonly text: string;
}): boolean {
  return assessShareTextSize({ text }).tooLargeForSingleQr;
}

const _decodeCatalogJson = Effect.fn("FoodCatalogShare._decodeCatalogJson")(
  function* ({ catalogJson }: { readonly catalogJson: string }) {
    const catalog = yield* Schema.decodeEffect(
      FoodCatalogTransfer.MaiFoodCatalogJson
    )(catalogJson);

    return yield* _decodeCatalog({ catalog });
  }
);

const _decodeCatalog = Effect.fn("FoodCatalogShare._decodeCatalog")(function* ({
  catalog,
}: {
  readonly catalog: FoodCatalogTransfer.MaiFoodCatalog;
}) {
  yield* FoodCatalogTransfer.validateFoodCatalog({ catalog });

  const catalogJson = yield* Schema.encodeEffect(
    FoodCatalogTransfer.MaiFoodCatalogJson
  )(catalog);

  return {
    catalog,
    catalogJson,
  };
});

function _makeShareText(text: string) {
  return Schema.decodeEffect(FoodCatalogShareText)(text);
}
