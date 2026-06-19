import { Context, Data, Effect, flow, Layer, Schema } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

const ProductBarcode = Schema.String.check(Schema.isPattern(/^\d{8,14}$/)).pipe(
  Schema.brand("ProductBarcode")
);

type ProductBarcode = typeof ProductBarcode.Type;

const _OpenFoodFactsNutriments = Schema.Struct({
  "energy-kcal_100g": Schema.optional(Schema.Number),
  proteins_100g: Schema.optional(Schema.Number),
  carbohydrates_100g: Schema.optional(Schema.Number),
  fat_100g: Schema.optional(Schema.Number),
  fiber_100g: Schema.optional(Schema.Number),
  sugars_100g: Schema.optional(Schema.Number),
  "saturated-fat_100g": Schema.optional(Schema.Number),
  salt_100g: Schema.optional(Schema.Number),
});

const _OpenFoodFactsProduct = Schema.Struct({
  code: Schema.optional(Schema.String),
  product_name: Schema.optional(Schema.String),
  brands: Schema.optional(Schema.String),
  image_front_small_url: Schema.optional(Schema.String),
  nutriments: Schema.optional(_OpenFoodFactsNutriments),
});

const _OpenFoodFactsProductResponse = Schema.Struct({
  code: Schema.optional(Schema.String),
  product: Schema.optional(_OpenFoodFactsProduct),
  status: Schema.Number,
  status_verbose: Schema.optional(Schema.String),
});

const _LookupProductByBarcodeInput = Schema.Struct({
  barcode: Schema.String,
});

export type LookupProductByBarcodeInput =
  typeof _LookupProductByBarcodeInput.Encoded;

export type OpenFoodFactsProductNutrients = {
  readonly energyKcalPer100g: number | undefined;
  readonly proteinGramsPer100g: number | undefined;
  readonly carbsGramsPer100g: number | undefined;
  readonly fatGramsPer100g: number | undefined;
  readonly fiberGramsPer100g: number | undefined;
  readonly sugarGramsPer100g: number | undefined;
  readonly saturatedFatGramsPer100g: number | undefined;
  readonly saltGramsPer100g: number | undefined;
};

export class OpenFoodFactsProduct extends Data.TaggedClass(
  "OpenFoodFactsProduct"
)<{
  readonly barcode: ProductBarcode;
  readonly brand: string | undefined;
  readonly imageUrl: string | undefined;
  readonly name: string | undefined;
  readonly nutrients: OpenFoodFactsProductNutrients;
}> {}

export class OpenFoodFactsInvalidBarcode extends Data.TaggedError(
  "OpenFoodFactsInvalidBarcode"
)<{
  readonly barcode: string;
}> {}

export class OpenFoodFactsProductNotFound extends Data.TaggedError(
  "OpenFoodFactsProductNotFound"
)<{
  readonly barcode: ProductBarcode;
}> {}

export class OpenFoodFactsLookupFailed extends Data.TaggedError(
  "OpenFoodFactsLookupFailed"
)<{
  readonly barcode: ProductBarcode;
  readonly cause: unknown;
}> {}

export class OpenFoodFacts extends Context.Service<OpenFoodFacts>()(
  "OpenFoodFacts",
  {
    make: Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.prependUrl("https://world.openfoodfacts.org"),
            HttpClientRequest.acceptJson,
            HttpClientRequest.setHeader(
              "X-User-Agent",
              "Mai/0.0.0 (client-side food logger)"
            )
          )
        ),
        HttpClient.filterStatusOk
      );

      return {
        lookupProductByBarcode: Effect.fn(
          "OpenFoodFacts.lookupProductByBarcode"
        )(function* ({
          input,
        }: {
          readonly input: LookupProductByBarcodeInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _LookupProductByBarcodeInput
          )(input);
          const normalizedBarcode = decodedInput.barcode.replaceAll(/\D/g, "");
          const barcode = yield* Schema.decodeEffect(ProductBarcode)(
            normalizedBarcode
          ).pipe(
            Effect.catchTag(
              "SchemaError",
              () =>
                new OpenFoodFactsInvalidBarcode({
                  barcode: decodedInput.barcode,
                })
            )
          );

          const response = yield* client
            .get(`/api/v2/product/${barcode}.json`, {
              urlParams: {
                fields:
                  "code,product_name,brands,nutriments,quantity,serving_size,image_front_small_url",
              },
            })
            .pipe(
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(_OpenFoodFactsProductResponse)
              ),
              Effect.mapError(
                (cause) =>
                  new OpenFoodFactsLookupFailed({
                    barcode,
                    cause,
                  })
              )
            );

          if (response.status !== 1 || response.product === undefined) {
            return yield* new OpenFoodFactsProductNotFound({
              barcode,
            });
          }

          return new OpenFoodFactsProduct({
            barcode,
            brand: _optionalTrimmedString({
              value: response.product.brands?.split(",")[0],
            }),
            imageUrl: response.product.image_front_small_url,
            name: _optionalTrimmedString({
              value: response.product.product_name,
            }),
            nutrients: {
              energyKcalPer100g:
                response.product.nutriments?.["energy-kcal_100g"],
              proteinGramsPer100g: response.product.nutriments?.proteins_100g,
              carbsGramsPer100g:
                response.product.nutriments?.carbohydrates_100g,
              fatGramsPer100g: response.product.nutriments?.fat_100g,
              fiberGramsPer100g: response.product.nutriments?.fiber_100g,
              sugarGramsPer100g: response.product.nutriments?.sugars_100g,
              saturatedFatGramsPer100g:
                response.product.nutriments?.["saturated-fat_100g"],
              saltGramsPer100g: response.product.nutriments?.salt_100g,
            },
          });
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}

function _optionalTrimmedString({
  value,
}: {
  readonly value: string | undefined;
}) {
  const trimmedValue = value?.trim() ?? "";

  return trimmedValue === "" ? undefined : trimmedValue;
}
