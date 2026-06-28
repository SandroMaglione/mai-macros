const functionExpressionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const expressionWrapperTypes = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const componentWrapperNames = new Set(["forwardRef", "memo"]);

type Node = {
  arguments?: Array<Node>;
  body?: Array<Node>;
  callee?: Node;
  declaration?: Node | null;
  declarations?: Array<Node>;
  exported?: Node | null;
  expression?: Node;
  id?: Node | null;
  init?: Node | null;
  local?: Node | null;
  name?: string;
  object?: Node;
  parent?: Node;
  property?: Node;
  source?: Node | null;
  specifiers?: Array<Node>;
  type: string;
  value?: string;
};

type FunctionBinding = {
  name: string;
  node: Node;
  value: Node;
};

type FunctionExport = {
  binding: FunctionBinding | undefined;
  name: string | undefined;
  node: Node;
};

const _isTsxFile = ({ filename }: { filename: string }) =>
  filename.endsWith(".tsx");

const _isPascalCase = ({ name }: { name: string | undefined }) =>
  name !== undefined && /^[A-Z]/.test(name);

const _bindingIdentifierName = ({ node }: { node: Node | null | undefined }) =>
  node?.type === "Identifier" ? node.name : undefined;

const _memberPropertyName = ({ node }: { node: Node }) => {
  if (node.property?.type === "Identifier") {
    return node.property.name;
  }

  if (typeof node.property?.value === "string") {
    return node.property.value;
  }

  return undefined;
};

const _innerExpression = ({ node }: { node: Node }) => {
  let current = node;

  while (
    expressionWrapperTypes.has(current.type) &&
    current.expression !== undefined
  ) {
    current = current.expression;
  }

  return current;
};

const _isFunctionExpression = ({ node }: { node: Node }) =>
  functionExpressionTypes.has(_innerExpression({ node }).type);

const _componentWrapperName = ({ node }: { node: Node }) => {
  if (node.type === "Identifier" && node.name !== undefined) {
    return componentWrapperNames.has(node.name) ? node.name : undefined;
  }

  if (node.type !== "MemberExpression") {
    return undefined;
  }

  return _memberPropertyName({ node });
};

const _isComponentWrapperCall = ({ node }: { node: Node }) => {
  if (node.type !== "CallExpression" || node.callee === undefined) {
    return false;
  }

  const name = _componentWrapperName({ node: node.callee });

  return name !== undefined && componentWrapperNames.has(name);
};

const _isFunctionValue = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding> | undefined;
  node: Node;
}): boolean => {
  const expression = _innerExpression({ node });

  if (expression.type === "Identifier" && expression.name !== undefined) {
    return bindings?.has(expression.name) ?? false;
  }

  if (expression.type === "FunctionDeclaration") {
    return true;
  }

  if (_isFunctionExpression({ node: expression })) {
    return true;
  }

  if (!_isComponentWrapperCall({ node: expression })) {
    return false;
  }

  const [argument] = expression.arguments ?? [];

  return (
    argument !== undefined && _isFunctionValue({ bindings, node: argument })
  );
};

const _functionBindingFromDeclaration = ({
  node,
}: {
  node: Node;
}): FunctionBinding | undefined => {
  if (node.type !== "FunctionDeclaration") {
    return undefined;
  }

  const name = _bindingIdentifierName({ node: node.id });

  return name === undefined ? undefined : { name, node, value: node };
};

const _functionBindingFromDeclarator = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding> | undefined;
  node: Node;
}): FunctionBinding | undefined => {
  const name = _bindingIdentifierName({ node: node.id });
  const init = node.init === null ? undefined : node.init;

  if (
    name === undefined ||
    init === undefined ||
    !_isFunctionValue({ bindings, node: init })
  ) {
    return undefined;
  }

  return { name, node, value: init };
};

const _functionBindingFromExpression = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}): FunctionBinding | undefined => {
  const expression = _innerExpression({ node });

  if (expression.type === "Identifier" && expression.name !== undefined) {
    return bindings.get(expression.name);
  }

  if (!_isComponentWrapperCall({ node: expression })) {
    return undefined;
  }

  const [argument] = expression.arguments ?? [];

  return argument === undefined
    ? undefined
    : _functionBindingFromExpression({ bindings, node: argument });
};

const _functionNameFromExpression = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}): string | undefined => {
  const binding = _functionBindingFromExpression({ bindings, node });

  if (binding !== undefined) {
    return binding.name;
  }

  const expression = _innerExpression({ node });

  if (
    expression.type === "FunctionDeclaration" ||
    expression.type === "FunctionExpression"
  ) {
    return _bindingIdentifierName({ node: expression.id });
  }

  if (!_isComponentWrapperCall({ node: expression })) {
    return undefined;
  }

  const [argument] = expression.arguments ?? [];

  return argument === undefined
    ? undefined
    : _functionNameFromExpression({ bindings, node: argument });
};

const _addTopLevelBinding = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}) => {
  const binding =
    node.type === "FunctionDeclaration"
      ? _functionBindingFromDeclaration({ node })
      : node.type === "VariableDeclarator"
        ? _functionBindingFromDeclarator({ bindings, node })
        : undefined;

  if (binding === undefined || bindings.has(binding.name)) {
    return false;
  }

  bindings.set(binding.name, binding);

  return true;
};

const _topLevelDeclarations = ({ node }: { node: Node }) => {
  const declarations: Array<Node> = [];

  for (const statement of node.body ?? []) {
    if (
      statement.type === "ExportNamedDeclaration" &&
      (statement.source === null || statement.source === undefined) &&
      statement.declaration !== null &&
      statement.declaration !== undefined
    ) {
      declarations.push(statement.declaration);
      continue;
    }

    declarations.push(statement);
  }

  return declarations;
};

const _addTopLevelDeclarationBindings = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}) => {
  if (node.type === "FunctionDeclaration") {
    return _addTopLevelBinding({ bindings, node });
  }

  if (node.type !== "VariableDeclaration") {
    return false;
  }

  let added = false;

  for (const declaration of node.declarations ?? []) {
    if (_addTopLevelBinding({ bindings, node: declaration })) {
      added = true;
    }
  }

  return added;
};

const _topLevelFunctionBindings = ({ node }: { node: Node }) => {
  const bindings = new Map<string, FunctionBinding>();
  const declarations = _topLevelDeclarations({ node });
  let added = true;

  while (added) {
    added = false;

    for (const declaration of declarations) {
      if (_addTopLevelDeclarationBindings({ bindings, node: declaration })) {
        added = true;
      }
    }
  }

  return bindings;
};

const _exportsFromDeclaration = ({
  bindings,
  declaration,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  declaration: Node | null | undefined;
  node: Node;
}) => {
  if (declaration?.type === "FunctionDeclaration") {
    const binding = _functionBindingFromDeclaration({ node: declaration });

    return binding === undefined ? [] : [{ binding, name: binding.name, node }];
  }

  if (declaration?.type !== "VariableDeclaration") {
    return [];
  }

  return (declaration.declarations ?? []).flatMap((variable) => {
    const binding = _functionBindingFromDeclarator({
      bindings,
      node: variable,
    });

    if (binding === undefined) {
      return [];
    }

    return [{ binding, name: binding.name, node }];
  });
};

const _exportsFromSpecifier = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}) => {
  const name = _bindingIdentifierName({ node: node.local });
  const binding = name === undefined ? undefined : bindings.get(name);

  return binding === undefined ? [] : [{ binding, name, node }];
};

const _exportsFromDefaultDeclaration = ({
  bindings,
  node,
}: {
  bindings: Map<string, FunctionBinding>;
  node: Node;
}) => {
  const declaration = node.declaration;

  if (declaration === null || declaration === undefined) {
    return [];
  }

  if (declaration.type === "Identifier") {
    const name = declaration.name;
    const binding = name === undefined ? undefined : bindings.get(name);

    return binding === undefined ? [] : [{ binding, name, node }];
  }

  if (!_isFunctionValue({ bindings, node: declaration })) {
    return [];
  }

  const binding = _functionBindingFromExpression({
    bindings,
    node: declaration,
  });
  const name =
    binding?.name ??
    _functionNameFromExpression({ bindings, node: declaration });

  return [{ binding, name, node }];
};

const _functionExports = ({ node }: { node: Node }) => {
  const bindings = _topLevelFunctionBindings({ node });
  const exports: Array<FunctionExport> = [];

  for (const statement of node.body ?? []) {
    if (statement.type === "ExportDefaultDeclaration") {
      exports.push(
        ..._exportsFromDefaultDeclaration({ bindings, node: statement })
      );
      continue;
    }

    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    if (statement.source !== null && statement.source !== undefined) {
      continue;
    }

    exports.push(
      ..._exportsFromDeclaration({
        bindings,
        declaration: statement.declaration,
        node: statement,
      })
    );

    for (const specifier of statement.specifiers ?? []) {
      exports.push(..._exportsFromSpecifier({ bindings, node: specifier }));
    }
  }

  return exports;
};

const _componentName = ({
  exportedFunction,
}: {
  exportedFunction: FunctionExport;
}) => exportedFunction.binding?.name ?? exportedFunction.name;

const _isComponentExport = ({
  exportedFunction,
}: {
  exportedFunction: FunctionExport;
}) => _isPascalCase({ name: _componentName({ exportedFunction }) });

const _message = ({ name }: { name: string | undefined }) =>
  name === undefined
    ? "Move this exported function out of the TSX file. TSX files should export components only."
    : `Move "${name}" out of the TSX file. TSX files should export components only.`;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow exporting non-component functions from TSX files.",
    },
  },
  create(context: {
    filename: string;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    if (!_isTsxFile({ filename: context.filename })) {
      return {};
    }

    return {
      Program(node: Node) {
        for (const exportedFunction of _functionExports({ node })) {
          if (_isComponentExport({ exportedFunction })) {
            continue;
          }

          context.report({
            node: exportedFunction.node,
            message: _message({ name: _componentName({ exportedFunction }) }),
          });
        }
      },
    };
  },
};

export default rule;
