import { Context, Data, Effect, Layer, Schema } from "effect";
import * as QRCode from "qrcode";

export const QrCodeDataUrl = Schema.String.check(
  Schema.isPattern(/^data:image\/png;base64,/)
).pipe(Schema.brand("QrCodeDataUrl"));

export type QrCodeDataUrl = typeof QrCodeDataUrl.Type;

export class QrCodeError extends Data.TaggedError("QrCodeError")<{
  readonly error: unknown;
}> {}

export class QrCode extends Context.Service<QrCode>()("QrCode", {
  make: Effect.succeed({
    generate: (text: string) =>
      Effect.tryPromise({
        try: () => QRCode.toDataURL(text),
        catch: (error) => new QrCodeError({ error }),
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(QrCodeDataUrl)),
        Effect.mapError((error) => new QrCodeError({ error }))
      ),
  }),
}) {
  static readonly Default = Layer.effect(this)(this.make);
}
