import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { RuleDiagnostic } from "../src/rule.ts";
import preferTypedSchemaApis from "../src/rules/prefer-typed-schema-apis.ts";

const _runRule = ({ code }: { code: string }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typed-lint-"));
  const fileName = path.join(directory, "fixture.ts");
  const effectTypes = path.join(directory, "effect.d.ts");

  fs.writeFileSync(
    effectTypes,
    [
      'declare module "effect" {',
      "  export namespace Schema {",
      "    export type Schema<TypeValue, EncodedValue> = { readonly Type: TypeValue; readonly Encoded: EncodedValue }",
      "    export const StringFromNumber: Schema<string, number>",
      "    export const String: Schema<string, string>",
      "    export const decodeUnknownOption: <S extends Schema<unknown, unknown>>(schema: S) => (input: unknown) => unknown",
      "    export const decodeOption: <S extends Schema<unknown, unknown>>(schema: S) => (input: S['Encoded']) => unknown",
      "    export const encodeUnknownOption: <S extends Schema<unknown, unknown>>(schema: S) => (input: unknown) => unknown",
      "    export const encodeOption: <S extends Schema<unknown, unknown>>(schema: S) => (input: S['Type']) => unknown",
      "    export const decodeUnknownEffect: <S extends Schema<unknown, unknown>>(schema: S) => (input: unknown) => unknown",
      "    export const decodeEffect: <S extends Schema<unknown, unknown>>(schema: S) => (input: S['Encoded']) => unknown",
      "  }",
      "}",
    ].join("\n")
  );
  fs.writeFileSync(fileName, code);

  const program = ts.createProgram({
    rootNames: [fileName, effectTypes],
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const sourceFile = program.getSourceFile(fileName);
  const diagnostics: Array<RuleDiagnostic> = [];

  if (sourceFile === undefined) {
    throw new Error("Unable to load fixture source file.");
  }

  preferTypedSchemaApis.check({
    checker: program.getTypeChecker(),
    report: (diagnostic) => {
      diagnostics.push({
        ...diagnostic,
        ruleName: preferTypedSchemaApis.name,
      });
    },
    sourceFile,
  });

  return diagnostics;
};

describe("prefer-typed-schema-apis", () => {
  it("reports decodeUnknown calls when the input matches the encoded type", () => {
    const diagnostics = _runRule({
      code: [
        'import { Schema } from "effect";',
        "const input: number = 1;",
        "Schema.decodeUnknownOption(Schema.StringFromNumber)(input);",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("Schema.decodeOption");
  });

  it("reports encodeUnknown calls when the input matches the type", () => {
    const diagnostics = _runRule({
      code: [
        'import { Schema } from "effect";',
        'const input: string = "value";',
        "Schema.encodeUnknownOption(Schema.StringFromNumber)(input);",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("Schema.encodeOption");
  });

  it("does not report unknown inputs", () => {
    const diagnostics = _runRule({
      code: [
        'import { Schema } from "effect";',
        "const input: unknown = 1;",
        "Schema.decodeUnknownOption(Schema.StringFromNumber)(input);",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("does not report non-effect Schema identifiers", () => {
    const diagnostics = _runRule({
      code: [
        "const Schema = { decodeUnknownOption: (_schema: unknown) => (_input: unknown) => undefined, String: {} };",
        'const input: string = "value";',
        "Schema.decodeUnknownOption(Schema.String)(input);",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });
});
