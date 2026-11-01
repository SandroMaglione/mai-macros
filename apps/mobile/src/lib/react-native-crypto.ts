import { Effect, Layer } from "effect";
import { Digest, SecureRandom } from "effect/crypto";
import * as ExpoCrypto from "expo-crypto";

const randomBytesChunkSize = 1024;

const expoDigestAlgorithms: Partial<
  Record<Digest.Algorithm["name"], ExpoCrypto.CryptoDigestAlgorithm>
> = {
  "SHA-1": ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

const _digest = ({
  algorithm,
  data,
}: {
  readonly algorithm: Digest.Algorithm;
  readonly data: Uint8Array;
}) => {
  const expoAlgorithm = expoDigestAlgorithms[algorithm.name];
  if (expoAlgorithm === undefined)
    return algorithm.implementation === undefined
      ? Effect.die(new Error(`Unsupported digest algorithm ${algorithm.name}`))
      : Effect.sync(() => algorithm.implementation?.(data) ?? data);
  return Effect.promise(() =>
    ExpoCrypto.digest(expoAlgorithm, Uint8Array.from(data))
  ).pipe(Effect.map((buffer) => new Uint8Array(buffer)));
};

const ReactNativeSecureRandomLayer = Layer.succeed(
  SecureRandom.SecureRandom,
  SecureRandom.make((size) => {
    const bytes = new Uint8Array(size);

    for (let offset = 0; offset < size; offset += randomBytesChunkSize) {
      const chunkSize = Math.min(randomBytesChunkSize, size - offset);
      const chunk = ExpoCrypto.getRandomBytes(chunkSize);

      bytes.set(chunk, offset);
    }

    return bytes;
  })
);

const ReactNativeDigestLayer = Layer.succeed(Digest.Digest, {
  digest: (algorithm, data) => _digest({ algorithm, data }),
  digestHex: (algorithm, data) =>
    _digest({ algorithm, data }).pipe(
      Effect.map((bytes) =>
        [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
      )
    ),
});

export const ReactNativeCryptoLayer = Layer.mergeAll(
  ReactNativeSecureRandomLayer,
  ReactNativeDigestLayer
);
