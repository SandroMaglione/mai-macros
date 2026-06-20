import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

import type { RuleDiagnostic, TypedRule } from "./rule.ts";
import noXstateDerivedBooleanContext from "./rules/no-xstate-derived-boolean-context.ts";
import preferEffectArrayMatch from "./rules/prefer-effect-array-match.ts";
import preferTypedSchemaApis from "./rules/prefer-typed-schema-apis.ts";

const _rules: ReadonlyArray<TypedRule> = [
  noXstateDerivedBooleanContext,
  preferEffectArrayMatch,
  preferTypedSchemaApis,
];

const _workspaceRoots = ["apps", "packages"];

const _excludedProjectDirectories = new Set([
  "packages/oxc",
  "packages/typed-lint",
]);

const _formatDiagnostic = ({
  column,
  fileName,
  line,
  message,
  ruleName,
}: RuleDiagnostic) => `${fileName}:${line}:${column} ${ruleName} ${message}`;

const _toPosixPath = ({ value }: { value: string }) =>
  value.split(path.sep).join("/");

const _getWorkspaceProjectPaths = () => {
  const projectPaths: Array<string> = [];

  for (const workspaceRoot of _workspaceRoots) {
    if (!fs.existsSync(workspaceRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(workspaceRoot, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectDirectory = path.join(workspaceRoot, entry.name);
      const normalizedProjectDirectory = _toPosixPath({
        value: projectDirectory,
      });

      if (_excludedProjectDirectories.has(normalizedProjectDirectory)) {
        continue;
      }

      const projectPath = path.join(projectDirectory, "tsconfig.json");

      if (fs.existsSync(projectPath)) {
        projectPaths.push(projectPath);
      }
    }
  }

  return projectPaths.sort((left, right) => left.localeCompare(right));
};

const _isProjectSourceFile = ({
  fileName,
  rootDir,
}: {
  fileName: string;
  rootDir: string;
}) => {
  const relative = path.relative(rootDir, fileName);

  return (
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    !fileName.endsWith(".d.ts") &&
    !relative.includes("node_modules") &&
    !relative.includes(`${path.sep}.expo${path.sep}`) &&
    !relative.includes(`${path.sep}scripts${path.sep}`)
  );
};

const _loadProject = ({ projectPath }: { projectPath: string }) => {
  const configPath = ts.findConfigFile(
    path.dirname(projectPath),
    ts.sys.fileExists,
    path.basename(projectPath)
  );

  if (configPath === undefined) {
    throw new Error(`Unable to find ${projectPath}`);
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);

  if (config.error !== undefined) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n")
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath)
  );

  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, "\n")
        )
        .join("\n")
    );
  }

  return {
    program: ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    }),
    rootDir: path.dirname(configPath),
  };
};

const _runProject = ({
  diagnostics,
  projectPath,
}: {
  diagnostics: Array<RuleDiagnostic>;
  projectPath: string;
}) => {
  const { program, rootDir } = _loadProject({ projectPath });
  const checker = program.getTypeChecker();

  for (const sourceFile of program.getSourceFiles()) {
    if (
      !_isProjectSourceFile({
        fileName: sourceFile.fileName,
        rootDir,
      })
    ) {
      continue;
    }

    for (const rule of _rules) {
      rule.check({
        checker,
        report: (diagnostic) => {
          diagnostics.push({
            ...diagnostic,
            ruleName: rule.name,
          });
        },
        sourceFile,
      });
    }
  }
};

const _main = () => {
  const diagnostics: Array<RuleDiagnostic> = [];
  const projectPaths = _getWorkspaceProjectPaths();

  for (const projectPath of projectPaths) {
    _runProject({ diagnostics, projectPath });
  }

  const seen = new Set<string>();
  const uniqueDiagnostics = diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.fileName}:${diagnostic.line}:${diagnostic.column}:${diagnostic.ruleName}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  uniqueDiagnostics.sort((left, right) =>
    _formatDiagnostic(left).localeCompare(_formatDiagnostic(right))
  );

  for (const diagnostic of uniqueDiagnostics) {
    console.error(_formatDiagnostic(diagnostic));
  }

  if (uniqueDiagnostics.length > 0) {
    process.exitCode = 1;
  }
};

_main();
