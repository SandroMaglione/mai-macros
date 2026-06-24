import { Option, Schema } from "effect";
import { useLocalSearchParams } from "expo-router";

export function useSchemaLocalSearchParams<
  TSchema extends Schema.Codec<unknown, unknown>,
>(schema: TSchema): Option.Option<TSchema["Type"]> {
  const params = useLocalSearchParams();
  return Schema.decodeUnknownOption(schema)(params);
}
