import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { RuleDiagnostic } from "../src/rule.ts";
import preferEffectArrayMatch from "../src/rules/prefer-effect-array-match.ts";

const _runRule = ({ code }: { code: string }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typed-lint-"));
  const fileName = path.join(directory, "fixture.ts");

  fs.writeFileSync(fileName, code);

  const program = ts.createProgram({
    rootNames: [fileName],
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

  preferEffectArrayMatch.check({
    checker: program.getTypeChecker(),
    report: (diagnostic) => {
      diagnostics.push({
        ...diagnostic,
        ruleName: preferEffectArrayMatch.name,
      });
    },
    sourceFile,
  });

  return diagnostics;
};

describe("prefer-effect-array-match", () => {
  it("reports array equality emptiness checks", () => {
    const diagnostics = _runRule({
      code: [
        "const items: readonly string[] = [];",
        "if (items.length === 0) {}",
        "if (items.length == 0) {}",
        "if (0 === items.length) {}",
        "if (0 == items.length) {}",
        "if (items.length !== 0) {}",
        "if (0 !== items.length) {}",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(6);
    expect(diagnostics[0]?.message).toBe(
      "Use Array.match, Array.isReadonlyArrayNonEmpty, Array.isArrayNonEmpty, or NonEmptyArray from effect instead of checking array.length for emptiness."
    );
  });

  it("reports array threshold emptiness checks", () => {
    const diagnostics = _runRule({
      code: [
        "const items: Array<string> = [];",
        "if (items.length > 0) {}",
        "if (items.length >= 1) {}",
        "if (items.length < 1) {}",
        "if (items.length <= 0) {}",
        "if (0 < items.length) {}",
        "if (1 <= items.length) {}",
        "if (1 > items.length) {}",
        "if (0 >= items.length) {}",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(8);
  });

  it("reports negated array length checks", () => {
    const diagnostics = _runRule({
      code: [
        "const items: readonly [string, string] = ['a', 'b'];",
        "if (!items.length) {}",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
  });

  it("does not report string length checks", () => {
    const diagnostics = _runRule({
      code: [
        'const value: string = "value";',
        "if (value.length === 0) {}",
        "if (value.length > 0) {}",
        "if (!value.length) {}",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("does not report non-emptiness unrelated to zero or one", () => {
    const diagnostics = _runRule({
      code: [
        "const items: readonly string[] = [];",
        "const limit = 20;",
        "if (items.length > limit) {}",
        "if (items.length >= 2) {}",
        "const last = items[items.length - 1];",
        "const count = items.length;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });
});
