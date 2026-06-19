import { RuntimeClient } from "../runtime-client.ts";
import {
  OpenFoodFacts,
  OpenFoodFactsInvalidBarcode,
  OpenFoodFactsLookupFailed,
  OpenFoodFactsProduct,
  OpenFoodFactsProductNotFound,
} from "../services/open-food-facts.ts";
import {
  Barcode,
  Camera,
  ImageUp,
  LoaderCircle,
  ScanBarcode,
} from "lucide-react";
import { Array, Data, Effect } from "effect";
import { assign, assertEvent, fromPromise, setup } from "xstate";
import { useMachine } from "@xstate/react";
import type { RefObject } from "react";

type BarcodeDetectorFormat = "ean_13" | "ean_8" | "upc_a" | "upc_e";

type BarcodeDetectorSource = HTMLImageElement | ImageBitmap;

type DetectedBarcode = {
  readonly rawValue: string;
};

type BrowserBarcodeDetector = {
  readonly detect: (
    source: BarcodeDetectorSource
  ) => Promise<readonly DetectedBarcode[]>;
};

type BrowserBarcodeDetectorConstructor = {
  readonly getSupportedFormats?: () => Promise<readonly string[]>;
  new (options: {
    readonly formats: readonly BarcodeDetectorFormat[];
  }): BrowserBarcodeDetector;
};

declare global {
  interface Window {
    readonly BarcodeDetector: BrowserBarcodeDetectorConstructor | undefined;
  }
}

class BarcodeDetectorUnavailable extends Data.TaggedError(
  "BarcodeDetectorUnavailable"
)<{}> {}

class BarcodeFormatUnavailable extends Data.TaggedError(
  "BarcodeFormatUnavailable"
)<{}> {}

class BarcodeNotDetected extends Data.TaggedError("BarcodeNotDetected")<{}> {}

class BarcodeImageReadFailed extends Data.TaggedError(
  "BarcodeImageReadFailed"
)<{
  readonly cause: unknown;
}> {}

type FoodBarcodeImportInput = {
  readonly file: File;
  readonly form: HTMLFormElement | null;
};

type FoodBarcodeImportOutput =
  | {
      readonly type: "imported";
      readonly barcode: string;
      readonly form: HTMLFormElement | null;
      readonly product: OpenFoodFactsProduct;
    }
  | {
      readonly type: "barcodeDetectorUnavailable";
      readonly form: HTMLFormElement | null;
    }
  | {
      readonly type: "barcodeFormatUnavailable";
      readonly form: HTMLFormElement | null;
    }
  | {
      readonly type: "barcodeNotDetected";
      readonly form: HTMLFormElement | null;
    }
  | {
      readonly type: "invalidBarcode";
      readonly form: HTMLFormElement | null;
    }
  | {
      readonly type: "productNotFound";
      readonly form: HTMLFormElement | null;
    }
  | {
      readonly type: "lookupFailed";
      readonly form: HTMLFormElement | null;
    };

type FoodBarcodeImportContext = {
  readonly importedBarcode: string | null;
  readonly message: string | null;
  readonly messageTone: "error" | "success" | null;
};

type FoodBarcodeImportEvent = {
  readonly type: "selectImage";
  readonly file: File;
  readonly form: HTMLFormElement | null;
};

const barcodeDetectorFormats: readonly BarcodeDetectorFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

const foodBarcodeImportMachine = setup({
  types: {
    context: {} as FoodBarcodeImportContext,
    events: {} as FoodBarcodeImportEvent,
  },
  actors: {
    importFoodFromImage: fromPromise<
      FoodBarcodeImportOutput,
      FoodBarcodeImportInput
    >(async ({ input }) => {
      const barcode = await Effect.runPromise(
        Effect.gen(function* () {
          const detectorConstructor = globalThis.window.BarcodeDetector;

          if (detectorConstructor === undefined) {
            return yield* new BarcodeDetectorUnavailable();
          }

          const supportedFormats =
            detectorConstructor.getSupportedFormats === undefined
              ? barcodeDetectorFormats
              : yield* Effect.promise(
                  () =>
                    detectorConstructor.getSupportedFormats?.() ??
                    Promise.resolve(barcodeDetectorFormats)
                );
          const formats = barcodeDetectorFormats.filter((format) =>
            supportedFormats.includes(format)
          );

          if (!Array.isReadonlyArrayNonEmpty(formats)) {
            return yield* new BarcodeFormatUnavailable();
          }

          const detector = new detectorConstructor({ formats });

          if (typeof globalThis.createImageBitmap === "function") {
            const image = yield* Effect.tryPromise({
              try: () => globalThis.createImageBitmap(input.file),
              catch: (cause) => new BarcodeImageReadFailed({ cause }),
            });

            try {
              return yield* Effect.promise(() =>
                _detectBarcodeFromSource({
                  detector,
                  source: image,
                })
              );
            } finally {
              image.close();
            }
          }

          const image = yield* Effect.tryPromise({
            try: () =>
              new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new globalThis.Image();
                const objectUrl = globalThis.URL.createObjectURL(input.file);

                image.onload = () => {
                  resolve(image);
                };
                image.onerror = (error) => {
                  globalThis.URL.revokeObjectURL(objectUrl);
                  reject(new BarcodeImageReadFailed({ cause: error }));
                };
                image.src = objectUrl;
              }),
            catch: (cause) =>
              cause instanceof BarcodeImageReadFailed
                ? cause
                : new BarcodeImageReadFailed({ cause }),
          });

          try {
            return yield* Effect.promise(() =>
              _detectBarcodeFromSource({
                detector,
                source: image,
              })
            );
          } finally {
            globalThis.URL.revokeObjectURL(image.src);
          }
        })
      ).catch((error: unknown) => {
        if (error instanceof BarcodeDetectorUnavailable) {
          return error;
        }

        if (error instanceof BarcodeFormatUnavailable) {
          return error;
        }

        if (error instanceof BarcodeNotDetected) {
          return error;
        }

        if (error instanceof BarcodeImageReadFailed) {
          return error;
        }

        return new BarcodeImageReadFailed({ cause: error });
      });

      if (barcode instanceof BarcodeDetectorUnavailable) {
        return {
          type: "barcodeDetectorUnavailable",
          form: input.form,
        };
      }

      if (barcode instanceof BarcodeFormatUnavailable) {
        return {
          type: "barcodeFormatUnavailable",
          form: input.form,
        };
      }

      if (barcode instanceof BarcodeNotDetected) {
        return {
          type: "barcodeNotDetected",
          form: input.form,
        };
      }

      if (barcode instanceof BarcodeImageReadFailed) {
        return {
          type: "barcodeNotDetected",
          form: input.form,
        };
      }

      return await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const openFoodFacts = yield* OpenFoodFacts;

          return yield* openFoodFacts.lookupProductByBarcode({
            input: { barcode },
          });
        })
      )
        .then(
          (product): FoodBarcodeImportOutput => ({
            type: "imported",
            barcode,
            form: input.form,
            product,
          })
        )
        .catch((error: unknown): FoodBarcodeImportOutput => {
          if (error instanceof OpenFoodFactsInvalidBarcode) {
            return {
              type: "invalidBarcode",
              form: input.form,
            };
          }

          if (error instanceof OpenFoodFactsProductNotFound) {
            return {
              type: "productNotFound",
              form: input.form,
            };
          }

          if (error instanceof OpenFoodFactsLookupFailed) {
            return {
              type: "lookupFailed",
              form: input.form,
            };
          }

          return {
            type: "lookupFailed",
            form: input.form,
          };
        });
    }),
  },
}).createMachine({
  context: {
    importedBarcode: null,
    message: null,
    messageTone: null,
  },
  initial: "Idle",
  states: {
    Idle: {
      on: {
        selectImage: {
          target: "Importing",
        },
      },
    },
    Importing: {
      invoke: {
        src: "importFoodFromImage",
        input: ({ event }) => {
          assertEvent(event, "selectImage");

          return {
            file: event.file,
            form: event.form,
          };
        },
        onDone: {
          target: "Idle",
          actions: [
            ({ event }) => {
              if (
                event.output.type !== "imported" ||
                event.output.form === null
              ) {
                return;
              }

              _setFoodInputValue({
                form: event.output.form,
                name: "name",
                value: event.output.product.name,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "brand",
                value: event.output.product.brand,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "energyKcalPer100g",
                value: event.output.product.nutrients.energyKcalPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "proteinGramsPer100g",
                value: event.output.product.nutrients.proteinGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "carbsGramsPer100g",
                value: event.output.product.nutrients.carbsGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "fatGramsPer100g",
                value: event.output.product.nutrients.fatGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "fiberGramsPer100g",
                value: event.output.product.nutrients.fiberGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "sugarGramsPer100g",
                value: event.output.product.nutrients.sugarGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "saturatedFatGramsPer100g",
                value: event.output.product.nutrients.saturatedFatGramsPer100g,
              });
              _setFoodInputValue({
                form: event.output.form,
                name: "saltGramsPer100g",
                value: event.output.product.nutrients.saltGramsPer100g,
              });
            },
            assign(({ event }) => {
              const output = event.output;
              const message =
                output.type === "imported"
                  ? `Found ${output.product.name ?? "that product"} and filled the form. Review the values before saving.`
                  : output.type === "barcodeDetectorUnavailable"
                    ? "This browser cannot read barcodes from photos yet. Try the latest Chrome or Edge on HTTPS or localhost."
                    : output.type === "barcodeFormatUnavailable"
                      ? "This browser cannot read EAN or UPC package barcodes from photos."
                      : output.type === "barcodeNotDetected"
                        ? "No barcode was found. Try another photo with the barcode centered and in focus."
                        : output.type === "invalidBarcode"
                          ? "The detected barcode was not a valid food package barcode."
                          : output.type === "productNotFound"
                            ? "Open Food Facts does not have this barcode yet."
                            : "Could not look up this barcode. Try another photo or fill the food manually.";

              return {
                importedBarcode:
                  output.type === "imported" ? output.barcode : null,
                message,
                messageTone: output.type === "imported" ? "success" : "error",
              };
            }),
          ],
        },
        onError: {
          target: "Idle",
          actions: assign({
            importedBarcode: null,
            message:
              "Could not read that image. Try another photo with the barcode centered and in focus.",
            messageTone: "error",
          }),
        },
      },
    },
  },
});

export function FoodBarcodeImport({
  disabled,
  formRef,
}: {
  readonly disabled: boolean;
  readonly formRef: RefObject<HTMLFormElement | null>;
}) {
  const [snapshot, send] = useMachine(foodBarcodeImportMachine);
  const isImporting = snapshot.matches("Importing");
  const Icon = isImporting ? LoaderCircle : Camera;

  return (
    <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#161b1d] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#8fb8c3]">
        Import from photo
      </legend>

      <div className="grid gap-3">
        <label className="grid cursor-pointer gap-3 rounded-md border border-dashed border-[#37525a] bg-[#0f1517] p-4 text-sm font-black text-[#dceff3] transition-colors hover:bg-[#121b1e]">
          <span className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-[#203138] text-[#8fd8ec]">
              <Icon
                aria-hidden="true"
                className={isImporting ? "animate-spin" : ""}
                size={20}
                strokeWidth={3}
              />
            </span>
            <span className="grid min-w-0 gap-1">
              <span className="leading-tight">
                {isImporting ? "Reading barcode" : "Take barcode photo"}
              </span>
              <span className="text-xs font-bold leading-tight text-[#8fb8c3]">
                Use the package barcode; values fill in below.
              </span>
            </span>
          </span>
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={disabled || isImporting}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";

              if (file === undefined) {
                return;
              }

              send({
                type: "selectImage",
                file,
                form: formRef.current,
              });
            }}
            type="file"
          />
        </label>

        {snapshot.context.message === null ? (
          <div className="flex items-center gap-2 text-xs font-bold leading-tight text-[#8fb8c3]">
            <ScanBarcode aria-hidden="true" size={16} strokeWidth={3} />
            The photo is only used locally to read the barcode.
          </div>
        ) : (
          <div
            className={
              snapshot.context.messageTone === "success"
                ? "flex items-start gap-2 rounded-md border border-[#244b38] bg-[#0f2018] p-3 text-xs font-bold leading-tight text-[#92e4b6]"
                : "flex items-start gap-2 rounded-md border border-[#533232] bg-[#241717] p-3 text-xs font-bold leading-tight text-[#ffb4ae]"
            }
          >
            {snapshot.context.messageTone === "success" ? (
              <Barcode
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={16}
                strokeWidth={3}
              />
            ) : (
              <ImageUp
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={16}
                strokeWidth={3}
              />
            )}
            <span>{snapshot.context.message}</span>
          </div>
        )}
      </div>
    </fieldset>
  );
}

async function _detectBarcodeFromSource({
  detector,
  source,
}: {
  readonly detector: BrowserBarcodeDetector;
  readonly source: BarcodeDetectorSource;
}) {
  const barcodes = await detector.detect(source);
  const barcode = barcodes[0]?.rawValue;

  if (barcode === undefined || barcode.trim() === "") {
    throw new BarcodeNotDetected();
  }

  return barcode;
}

function _setFoodInputValue({
  form,
  name,
  value,
}: {
  readonly form: HTMLFormElement;
  readonly name: string;
  readonly value: number | string | undefined;
}) {
  const field = form.elements.namedItem(name);

  if (!(field instanceof HTMLInputElement) || value === undefined) {
    return;
  }

  field.value = String(value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
