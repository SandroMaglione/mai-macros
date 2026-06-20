type Node = {
  body?: Array<Node>;
  declaration?: Node | null;
  declarations?: Array<Node>;
  expression?: Node;
  exported?: Node | null;
  id?: Node | null;
  init?: Node | null;
  local?: Node | null;
  name?: string;
  parent?: Node;
  right?: Node;
  source?: Node | null;
  specifiers?: Array<Node>;
  type: string;
};

type Reference = {
  identifier: Node;
  isRead: () => boolean;
};

type ScopeVariable = {
  name: string;
  references: Array<Reference>;
};

type SourceCode = {
  getDeclaredVariables: (node: Node) => Array<ScopeVariable>;
};

type Candidate = {
  name: string;
  node: Node;
  variable: ScopeVariable;
};

const functionExpressionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const _isFunctionExpression = ({ node }: { node: Node | null | undefined }) =>
  node !== null && node !== undefined && functionExpressionTypes.has(node.type);

const _isPascalCase = ({ name }: { name: string }) => /^[A-Z]/.test(name);

const _isTopLevelFunctionVariable = ({ node }: { node: Node }) =>
  node.id?.type === "Identifier" &&
  _isFunctionExpression({ node: node.init }) &&
  node.parent?.type === "VariableDeclaration" &&
  node.parent.parent?.type === "Program";

const _addIdentifierName = ({
  names,
  node,
}: {
  names: Set<string>;
  node: Node | null | undefined;
}) => {
  if (node?.type === "Identifier" && node.name !== undefined) {
    names.add(node.name);
  }
};

const _addDeclarationNames = ({
  declaration,
  names,
}: {
  declaration: Node | null | undefined;
  names: Set<string>;
}) => {
  if (declaration?.type === "FunctionDeclaration") {
    _addIdentifierName({ names, node: declaration.id });
    return;
  }

  if (declaration?.type === "VariableDeclaration") {
    for (const variable of declaration.declarations ?? []) {
      _addIdentifierName({ names, node: variable.id });
    }
  }
};

const _exportedNames = ({ node }: { node: Node }) => {
  const names = new Set<string>();

  for (const statement of node.body ?? []) {
    if (statement.type === "ExportDefaultDeclaration") {
      _addIdentifierName({ names, node: statement.declaration });
      _addIdentifierName({ names, node: statement.declaration?.id });
    }

    if (statement.type === "ExportNamedDeclaration") {
      _addDeclarationNames({ declaration: statement.declaration, names });

      if (statement.source === null || statement.source === undefined) {
        for (const specifier of statement.specifiers ?? []) {
          _addIdentifierName({ names, node: specifier.local });
        }
      }
    }

    if (statement.type === "TSExportAssignment") {
      _addIdentifierName({ names, node: statement.expression });
    }
  }

  return names;
};

const _declaredVariable = ({
  name,
  node,
  sourceCode,
}: {
  name: string;
  node: Node;
  sourceCode: SourceCode;
}) =>
  sourceCode
    .getDeclaredVariables(node)
    .find((variable) => variable.name === name);

const _functionDeclarationCandidate = ({
  exportedNames,
  node,
  sourceCode,
}: {
  exportedNames: Set<string>;
  node: Node;
  sourceCode: SourceCode;
}): Array<Candidate> => {
  const name = node.id?.name;

  if (
    name === undefined ||
    node.parent?.type !== "Program" ||
    _isPascalCase({ name }) ||
    exportedNames.has(name)
  ) {
    return [];
  }

  const variable = _declaredVariable({ name, node, sourceCode });

  return variable === undefined ? [] : [{ name, node, variable }];
};

const _variableDeclarationCandidate = ({
  exportedNames,
  node,
  sourceCode,
}: {
  exportedNames: Set<string>;
  node: Node;
  sourceCode: SourceCode;
}): Array<Candidate> => {
  const name = node.id?.name;

  if (
    name === undefined ||
    _isPascalCase({ name }) ||
    exportedNames.has(name) ||
    !_isTopLevelFunctionVariable({ node })
  ) {
    return [];
  }

  const variable = _declaredVariable({ name, node, sourceCode });

  return variable === undefined ? [] : [{ name, node, variable }];
};

const _topLevelCandidates = ({
  exportedNames,
  node,
  sourceCode,
}: {
  exportedNames: Set<string>;
  node: Node;
  sourceCode: SourceCode;
}) =>
  (node.body ?? []).flatMap((statement): Array<Candidate> => {
    if (statement.type === "FunctionDeclaration") {
      return _functionDeclarationCandidate({
        exportedNames,
        node: statement,
        sourceCode,
      });
    }

    if (statement.type !== "VariableDeclaration") {
      return [];
    }

    return (statement.declarations ?? []).flatMap((declaration) =>
      _variableDeclarationCandidate({
        exportedNames,
        node: declaration,
        sourceCode,
      })
    );
  });

const _hasTypeAncestor = ({ node }: { node: Node }) => {
  let current = node.parent;

  while (current !== undefined) {
    if (current.type.startsWith("TS")) {
      return true;
    }

    if (
      current.type === "Program" ||
      current.type === "BlockStatement" ||
      current.type === "ExpressionStatement"
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
};

const _hasExportAncestor = ({ node }: { node: Node }) => {
  let current = node.parent;

  while (current !== undefined) {
    if (
      current.type === "ExportDefaultDeclaration" ||
      current.type === "ExportSpecifier" ||
      current.type === "TSExportAssignment"
    ) {
      return true;
    }

    if (current.type === "Program" || current.type === "BlockStatement") {
      return false;
    }

    current = current.parent;
  }

  return false;
};

const _isRuntimeReadReference = ({ reference }: { reference: Reference }) =>
  reference.isRead() &&
  !_hasTypeAncestor({ node: reference.identifier }) &&
  !_hasExportAncestor({ node: reference.identifier });

const _runtimeReadCount = ({ variable }: { variable: ScopeVariable }) =>
  variable.references.filter((reference) =>
    _isRuntimeReadReference({ reference })
  ).length;

const _message = ({ name }: { name: string }) =>
  `Inline the private function "${name}" at its only usage site instead of defining it as a top-level function.`;

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow private top-level functions that are referenced only once in the file.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
    sourceCode: SourceCode;
  }) {
    return {
      Program(node: Node) {
        const candidates = _topLevelCandidates({
          exportedNames: _exportedNames({ node }),
          node,
          sourceCode: context.sourceCode,
        });

        for (const candidate of candidates) {
          if (_runtimeReadCount({ variable: candidate.variable }) !== 1) {
            continue;
          }

          context.report({
            node: candidate.node,
            message: _message({ name: candidate.name }),
          });
        }
      },
    };
  },
};

export default rule;
