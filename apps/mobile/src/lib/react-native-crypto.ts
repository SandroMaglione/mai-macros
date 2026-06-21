import { Crypto, Effect, Layer, PlatformError } from "effect";
import * as ExpoCrypto from "expo-crypto";

const randomBytesChunkSize = 1024;

const expoDigestAlgorithms: Record<
  Crypto.DigestAlgorithm,
  ExpoCrypto.CryptoDigestAlgorithm
> = {
  "SHA-1": ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

export const ReactNativeCryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size);

      for (let offset = 0; offset < size; offset += randomBytesChunkSize) {
        const chunkSize = Math.min(randomBytesChunkSize, size - offset);
        const chunk = ExpoCrypto.getRandomBytes(chunkSize);

        bytes.set(chunk, offset);
      }

      return bytes;
    },
    digest: (algorithm, data) =>
      Effect.map(
        Effect.tryPromise({
          try: () => ExpoCrypto.digest(expoDigestAlgorithms[algorithm], data),
          catch: (cause) =>
            PlatformError.systemError({
              _tag: "Unknown",
              module: "Crypto",
              method: "digest",
              description: "Could not compute digest",
              cause,
            }),
        }),
        (buffer) => new Uint8Array(buffer)
      ),
  })
);
