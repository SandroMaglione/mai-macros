import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { RuleDiagnostic } from "../src/rule.ts";
import noXstateDerivedBooleanContext from "../src/rules/no-xstate-derived-boolean-context.ts";

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

  noXstateDerivedBooleanContext.check({
    checker: program.getTypeChecker(),
    report: (diagnostic) => {
      diagnostics.push({
        ...diagnostic,
        ruleName: noXstateDerivedBooleanContext.name,
      });
    },
    sourceFile,
  });

  return diagnostics;
};

describe("no-xstate-derived-boolean-context", () => {
  it("reports assigned can-prefixed boolean context fields used as guards", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign, setup } from "xstate";',
        "type Context = { readonly canSubmit: boolean; readonly value: string };",
        "type Event = { readonly type: 'change'; readonly value: string } | { readonly type: 'submit' };",
        "setup({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  context: { canSubmit: false, value: '' },",
        "  on: {",
        "    change: { actions: assign(({ event }) => ({ canSubmit: event.value !== '', value: event.value })) },",
        "    submit: { guard: ({ context }) => context.canSubmit, target: 'Submitted' },",
        "  },",
        "});",
        "declare const snapshot: { readonly context: Context };",
        "const disabled = !snapshot.context.canSubmit;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('"canSubmit"');
  });

  it("reports assigned boolean context fields used as guards and through a typed snapshot regardless of name", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign, setup } from "xstate";',
        "type Context = { readonly isValid: boolean; readonly value: string };",
        "type Event = { readonly type: 'change'; readonly value: string } | { readonly type: 'submit' };",
        "setup({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  context: { isValid: false, value: '' },",
        "  on: {",
        "    change: { actions: assign(({ event }) => ({ isValid: event.value !== '', value: event.value })) },",
        "    submit: { guard: ({ context }) => context.isValid, target: 'Submitted' },",
        "  },",
        "});",
        "declare const snapshot: { readonly context: Context };",
        "const disabled = !snapshot.context.isValid;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('"isValid"');
  });

  it("reports inline context type literals", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign, setup } from "xstate";',
        "setup({",
        "  types: {",
        "    context: {} as { readonly canDelete: boolean; readonly id: string },",
        "    events: {} as { readonly type: 'delete' },",
        "  },",
        "}).createMachine({",
        "  on: { delete: { actions: assign({ canDelete: false }), guard: ({ context }) => context.canDelete } },",
        "});",
        "declare const snapshot: { readonly context: { readonly canDelete: boolean; readonly id: string } };",
        "const disabled = !snapshot.context.canDelete;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('"canDelete"');
  });

  it("does not report configuration booleans that are not transition capabilities", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign, setup } from "xstate";',
        "type Context = { readonly syncQuickInputFromFields: boolean; readonly value: string };",
        "type Event = { readonly type: 'change'; readonly value: string };",
        "setup({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  on: { change: { actions: assign(({ context }) => ({",
        "    value: context.syncQuickInputFromFields ? 'synced' : 'manual',",
        "  })) } },",
        "});",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("does not report can-prefixed booleans without assignment evidence", () => {
    const diagnostics = _runRule({
      code: [
        'import { setup } from "xstate";',
        "type Context = { readonly canSubmit: boolean };",
        "type Event = { readonly type: 'submit' };",
        "setup({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  on: { submit: { guard: ({ context }) => context.canSubmit } },",
        "});",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("does not report booleans without both guard and snapshot evidence", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign, setup } from "xstate";',
        "type Context = { readonly isValid: boolean; readonly canSubmit: boolean };",
        "type Event = { readonly type: 'change' } | { readonly type: 'submit' };",
        "setup({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  on: {",
        "    change: { actions: assign({ isValid: true, canSubmit: true }) },",
        "    submit: { guard: ({ context }) => context.isValid },",
        "  },",
        "});",
        "declare const snapshot: { readonly context: Context };",
        "const disabled = !snapshot.context.canSubmit;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("supports aliased XState imports and aliased guard context bindings", () => {
    const diagnostics = _runRule({
      code: [
        'import { assign as update, setup as configure } from "xstate";',
        "type Context = { readonly canContinue: boolean };",
        "type Event = { readonly type: 'continue' };",
        "configure({ types: { context: {} as Context, events: {} as Event } }).createMachine({",
        "  on: { continue: { actions: update({ canContinue: false }), guard: ({ context: ctx }) => ctx.canContinue } },",
        "});",
        "declare const snapshot: { readonly context: Context };",
        "const disabled = !snapshot.context.canContinue;",
      ].join("\n"),
    });

    expect(diagnostics).toHaveLength(1);
  });
});
