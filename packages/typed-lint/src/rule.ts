import type ts from "typescript";

export type RuleDiagnostic = {
  column: number;
  fileName: string;
  line: number;
  message: string;
  ruleName: string;
};

export type RuleContext = {
  checker: ts.TypeChecker;
  report: (diagnostic: Omit<RuleDiagnostic, "ruleName">) => void;
  sourceFile: ts.SourceFile;
};

export type TypedRule = {
  check: (context: RuleContext) => void;
  name: string;
};
