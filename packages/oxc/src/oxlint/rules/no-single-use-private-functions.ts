type Node = {
  arguments?: Array<Node>;
  body?: Array<Node>;
  callee?: Node;
  declaration?: Node | null;
  declarations?: Array<Node>;
  expression?: Node;
  exported?: Node | null;
  id?: Node | null;
  init?: Node | null;
  local?: Node | null;
  name?: string;
  object?: Node;
  parent?: Node;
  property?: Node;
  right?: Node;
  source?: Node | null;
  specifiers?: Array<Node>;
  type: string;
  value?: string;
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
  kind: "effect-function" | "effect-program" | "function" | "type";
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

const _memberPropertyName = ({ node }: { node: Node }) => {
  if (node.property?.type === "Identifier") {
    return node.property.name;
  }

  if (typeof node.property?.value === "string") {
    return node.property.value;
  }

  return undefined;
};

const _effectCalleeName = ({ node }: { node: Node }) => {
  if (
    node.type !== "MemberExpression" ||
    node.object?.type !== "Identifier" ||
    node.object.name !== "Effect"
  ) {
    return undefined;
  }

  return _memberPropertyName({ node });
};

const _isEffectCall = ({
  name,
  node,
}: {
  name: "fn" | "fnUntraced" | "gen";
  node: Node | null | undefined;
}) =>
  node?.type === "CallExpression" &&
  node.callee !== undefined &&
  _effectCalleeName({ node: node.callee }) === name;

const _isEffectFunctionInitializer = ({
  node,
}: {
  node: Node | null | undefined;
}) =>
  _isEffectCall({ name: "fnUntraced", node }) ||
  _isEffectCall({ name: "fn", node }) ||
  (node?.type === "CallExpression" &&
    node.callee !== undefined &&
    _isEffectCall({ name: "fn", node: node.callee }));

const _isEffectProgramInitializer = ({
  node,
}: {
  node: Node | null | undefined;
}) => _isEffectCall({ name: "gen", node });

const _topLevelVariableKind = ({
  node,
}: {
  node: Node;
}): Candidate["kind"] | undefined => {
  if (
    node.id?.type !== "Identifier" ||
    node.parent?.type !== "VariableDeclaration" ||
    node.parent.parent?.type !== "Program"
  ) {
    return undefined;
  }

  if (_isFunctionExpression({ node: node.init })) {
    return "function";
  }

  if (_isEffectFunctionInitializer({ node: node.init })) {
    return "effect-function";
  }

  if (_isEffectProgramInitializer({ node: node.init })) {
    return "effect-program";
  }

  return undefined;
};

const _isTopLevelTypeDeclaration = ({ node }: { node: Node }) =>
  (node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSInterfaceDeclaration") &&
  node.id?.type === "Identifier" &&
  node.parent?.type === "Program";

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

  if (
    declaration?.type === "TSTypeAliasDeclaration" ||
    declaration?.type === "TSInterfaceDeclaration"
  ) {
    _addIdentifierName({ names, node: declaration.id });
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

  return variable === undefined
    ? []
    : [{ kind: "function", name, node, variable }];
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
  const kind = _topLevelVariableKind({ node });

  if (
    name === undefined ||
    kind === undefined ||
    _isPascalCase({ name }) ||
    exportedNames.has(name)
  ) {
    return [];
  }

  const variable = _declaredVariable({ name, node, sourceCode });

  return variable === undefined ? [] : [{ kind, name, node, variable }];
};

const _typeDeclarationCandidate = ({
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
    exportedNames.has(name) ||
    !_isTopLevelTypeDeclaration({ node })
  ) {
    return [];
  }

  const variable = _declaredVariable({ name, node, sourceCode });

  return variable === undefined ? [] : [{ kind: "type", name, node, variable }];
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

    if (
      statement.type === "TSTypeAliasDeclaration" ||
      statement.type === "TSInterfaceDeclaration"
    ) {
      return _typeDeclarationCandidate({
        exportedNames,
        node: statement,
        sourceCode,
      });
    }

    if (statement.type === "VariableDeclaration") {
      return (statement.declarations ?? []).flatMap((declaration) =>
        _variableDeclarationCandidate({
          exportedNames,
          node: declaration,
          sourceCode,
        })
      );
    }

    return [];
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

const _isTypeReadReference = ({ reference }: { reference: Reference }) =>
  reference.isRead() &&
  _hasTypeAncestor({ node: reference.identifier }) &&
  !_hasExportAncestor({ node: reference.identifier });

const _typeReadCount = ({ variable }: { variable: ScopeVariable }) =>
  variable.references.filter((reference) => _isTypeReadReference({ reference }))
    .length;

const _singleUseCount = ({ candidate }: { candidate: Candidate }) =>
  candidate.kind === "type"
    ? _typeReadCount({ variable: candidate.variable })
    : _runtimeReadCount({ variable: candidate.variable });

const _message = ({
  kind,
  name,
}: {
  kind: Candidate["kind"];
  name: string;
}) => {
  if (kind === "effect-function") {
    return `Inline the private Effect function "${name}" at its only usage site instead of defining it as a top-level function.`;
  }

  if (kind === "effect-program") {
    return `Inline the private Effect program "${name}" at its only usage site instead of defining it as a top-level value.`;
  }

  if (kind === "type") {
    return `Inline the private type "${name}" at its only usage site instead of defining it as a top-level type.`;
  }

  return `Inline the private function "${name}" at its only usage site instead of defining it as a top-level function.`;
};

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
          if (_singleUseCount({ candidate }) !== 1) {
            continue;
          }

          context.report({
            node: candidate.node,
            message: _message({
              kind: candidate.kind,
              name: candidate.name,
            }),
          });
        }
      },
    };
  },
};

export default rule;
