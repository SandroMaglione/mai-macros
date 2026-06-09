type Node = {
  body?: Array<Node>;
  computed?: boolean;
  declaration?: Node;
  declarations?: Array<Node>;
  exported?: Node;
  id?: Node | null;
  init?: Node | null;
  key?: Node;
  local?: Node;
  name?: string;
  parent?: Node;
  property?: Node;
  specifiers?: Array<Node>;
  type: string;
  value?: Node | string;
};

type Candidate = {
  name: string;
  node: Node;
};

const functionExpressionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const _isFunctionExpression = ({ node }: { node: Node | null | undefined }) =>
  node !== null && node !== undefined && functionExpressionTypes.has(node.type);

const _isPascalCase = ({ name }: { name: string }) => /^[A-Z]/.test(name);

const _isPrivateFunctionName = ({ name }: { name: string }) =>
  !_isPascalCase({ name });

const _isTopLevelFunctionVariable = ({ node }: { node: Node }) =>
  node.id?.type === "Identifier" &&
  _isFunctionExpression({ node: node.init }) &&
  node.parent?.type === "VariableDeclaration" &&
  node.parent.parent?.type === "Program";

const _exportedNames = ({ node }: { node: Node }) => {
  const names = new Set<string>();

  for (const statement of node.body ?? []) {
    if (statement.type === "ExportDefaultDeclaration") {
      const name = statement.declaration?.name;

      if (name !== undefined) {
        names.add(name);
      }
    }

    if (statement.type === "ExportNamedDeclaration") {
      for (const specifier of statement.specifiers ?? []) {
        if (specifier.local?.name !== undefined) {
          names.add(specifier.local.name);
        }
      }

      if (statement.declaration?.type === "FunctionDeclaration") {
        const name = statement.declaration.id?.name;

        if (name !== undefined) {
          names.add(name);
        }
      }

      for (const declaration of statement.declaration?.declarations ?? []) {
        const name = declaration.id?.name;

        if (name !== undefined) {
          names.add(name);
        }
      }
    }
  }

  return names;
};

const _topLevelCandidates = ({
  exportedNames,
  node,
}: {
  exportedNames: Set<string>;
  node: Node;
}) =>
  (node.body ?? []).flatMap((statement): Array<Candidate> => {
    if (statement.type === "FunctionDeclaration") {
      const name = statement.id?.name;

      return name !== undefined &&
        _isPrivateFunctionName({ name }) &&
        !exportedNames.has(name)
        ? [{ name, node: statement }]
        : [];
    }

    if (statement.type !== "VariableDeclaration") {
      return [];
    }

    return (statement.declarations ?? []).flatMap((declaration) => {
      const name = declaration.id?.name;

      return name !== undefined &&
        _isPrivateFunctionName({ name }) &&
        !exportedNames.has(name) &&
        _isTopLevelFunctionVariable({ node: declaration })
        ? [{ name, node: declaration }]
        : [];
    });
  });

const _isBindingIdentifier = ({ node, parent }: { node: Node; parent: Node }) =>
  (parent.type === "FunctionDeclaration" && parent.id === node) ||
  (parent.type === "FunctionExpression" && parent.id === node) ||
  (parent.type === "VariableDeclarator" && parent.id === node) ||
  (parent.type === "ImportSpecifier" && parent.local === node) ||
  (parent.type === "ImportDefaultSpecifier" && parent.local === node) ||
  (parent.type === "ImportNamespaceSpecifier" && parent.local === node);

const _isObjectKey = ({ node, parent }: { node: Node; parent: Node }) =>
  (parent.type === "Property" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "MethodDefinition") &&
  parent.key === node &&
  parent.value !== node &&
  parent.computed !== true;

const _isMemberProperty = ({ node, parent }: { node: Node; parent: Node }) =>
  parent.type === "MemberExpression" &&
  parent.property === node &&
  parent.computed !== true;

const _isExportSpecifier = ({ node, parent }: { node: Node; parent: Node }) =>
  parent.type === "ExportSpecifier" &&
  (parent.local === node || parent.exported === node);

const _isTypeIdentifier = ({ parent }: { parent: Node }) =>
  parent.type.startsWith("TS") || parent.type === "TSTypeAnnotation";

const _isReference = ({ node }: { node: Node }) => {
  const parent = node.parent;

  return (
    node.type === "Identifier" &&
    parent !== undefined &&
    !_isBindingIdentifier({ node, parent }) &&
    !_isObjectKey({ node, parent }) &&
    !_isMemberProperty({ node, parent }) &&
    !_isExportSpecifier({ node, parent }) &&
    !_isTypeIdentifier({ parent })
  );
};

const _visit = ({
  node,
  onNode,
  visited,
}: {
  node: Node;
  onNode: (node: Node) => void;
  visited: WeakSet<Node>;
}) => {
  if (visited.has(node)) {
    return;
  }

  visited.add(node);
  onNode(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          item !== null &&
          typeof item === "object" &&
          typeof item.type === "string"
        ) {
          _visit({ node: item, onNode, visited });
        }
      }

      continue;
    }

    if (typeof value === "object" && typeof value.type === "string") {
      _visit({ node: value, onNode, visited });
    }
  }
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
  }) {
    return {
      Program(node: Node) {
        const candidates = _topLevelCandidates({
          exportedNames: _exportedNames({ node }),
          node,
        });

        if (candidates.length === 0) {
          return;
        }

        const candidateNames = new Set(
          candidates.map((candidate) => candidate.name)
        );
        const referenceCounts = new Map<string, number>();

        _visit({
          node,
          onNode: (child) => {
            if (
              child.name !== undefined &&
              candidateNames.has(child.name) &&
              _isReference({ node: child })
            ) {
              referenceCounts.set(
                child.name,
                (referenceCounts.get(child.name) ?? 0) + 1
              );
            }
          },
          visited: new WeakSet(),
        });

        for (const candidate of candidates) {
          if ((referenceCounts.get(candidate.name) ?? 0) !== 1) {
            continue;
          }

          context.report({
            node: candidate.node,
            message: `Inline the private function "${candidate.name}" at its only usage site instead of defining it as a function.`,
          });
        }
      },
    };
  },
};

export default rule;
