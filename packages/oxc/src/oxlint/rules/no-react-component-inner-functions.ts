const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
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

type Node = {
  arguments?: Array<Node>;
  body?: unknown;
  callee?: Node;
  expression?: Node;
  id?: Node | null;
  init?: Node | null;
  left?: Node;
  name?: string;
  object?: Node;
  parent?: Node;
  params?: Array<unknown>;
  property?: Node;
  right?: Node | null;
  type: string;
};

const _isTsxFile = ({ filename }: { filename: string }) =>
  filename.endsWith(".tsx");

const _isFunction = ({ node }: { node: Node | null | undefined }) =>
  node !== null && node !== undefined && functionTypes.has(node.type);

const _isComponentName = ({ name }: { name: string | undefined }) =>
  name !== undefined && /^[A-Z]/.test(name);

const _componentName = ({ node }: { node: Node }): string | undefined => {
  if (node.type === "FunctionDeclaration") {
    return _isComponentName({ name: node.id?.name })
      ? node.id?.name
      : undefined;
  }

  const parent = node.parent;

  if (parent?.type === "VariableDeclarator") {
    return _isComponentName({ name: parent.id?.name })
      ? parent.id?.name
      : undefined;
  }

  if (parent?.type === "CallExpression") {
    const variableDeclarator = parent.parent;

    if (variableDeclarator?.type === "VariableDeclarator") {
      return _isComponentName({ name: variableDeclarator.id?.name })
        ? variableDeclarator.id?.name
        : undefined;
    }
  }

  return undefined;
};

const _owningComponent = ({ node }: { node: Node }) => {
  let current = node.parent;

  while (current !== null && current !== undefined) {
    if (_isFunction({ node: current })) {
      const name = _componentName({ node: current });

      return name === undefined ? undefined : { name, node: current };
    }

    current = current.parent;
  }

  return undefined;
};

const _outerExpression = ({ node }: { node: Node }) => {
  let current = node;

  while (
    current.parent !== undefined &&
    expressionWrapperTypes.has(current.parent.type) &&
    current.parent.expression === current
  ) {
    current = current.parent;
  }

  return current;
};

const _isAssignedValue = ({ node }: { node: Node }) => {
  const parent = node.parent;

  return (
    (parent?.type === "VariableDeclarator" && parent.init === node) ||
    (parent?.type === "AssignmentExpression" && parent.right === node)
  );
};

const _memberPropertyName = ({ node }: { node: Node }) => {
  if (node.property?.type !== "Identifier") {
    return undefined;
  }

  return node.property.name;
};

const _isUseCallbackCall = ({ node }: { node: Node }) =>
  (node.callee?.type === "Identifier" && node.callee.name === "useCallback") ||
  (node.callee?.type === "MemberExpression" &&
    _memberPropertyName({ node: node.callee }) === "useCallback");

const _isUseCallbackValue = ({ node }: { node: Node }) => {
  const expression = _outerExpression({ node });
  const callExpression = expression.parent;

  if (
    callExpression?.type !== "CallExpression" ||
    callExpression.arguments?.[0] !== expression ||
    !_isUseCallbackCall({ node: callExpression })
  ) {
    return false;
  }

  return _isAssignedValue({ node: _outerExpression({ node: callExpression }) });
};

const _isComponentOwnedFunction = ({ node }: { node: Node }) => {
  if (node.type === "FunctionDeclaration") {
    return true;
  }

  const expression = _outerExpression({ node });

  return (
    _isAssignedValue({ node: expression }) || _isUseCallbackValue({ node })
  );
};

const _functionName = ({ node }: { node: Node }) => {
  if (node.type === "FunctionDeclaration") {
    return node.id?.name;
  }

  const expression = _outerExpression({ node });
  const parent = expression.parent;

  if (
    parent?.type === "VariableDeclarator" ||
    parent?.type === "AssignmentExpression"
  ) {
    return parent.id?.name ?? parent.left?.name;
  }

  if (
    parent?.type === "CallExpression" &&
    _isUseCallbackCall({ node: parent })
  ) {
    const callbackOwner = _outerExpression({ node: parent }).parent;

    return callbackOwner?.id?.name ?? callbackOwner?.left?.name;
  }

  return undefined;
};

const _message = ({ name }: { name: string | undefined }) =>
  name === undefined
    ? "Move this component-local function out of the component. If it contains business logic, model it in a state machine or actor instead. Avoid inlining the function into the component body unless no better boundary is possible."
    : `Move "${name}" out of the component. If it contains business logic, model it in a state machine or actor instead. Avoid inlining the function into the component body unless no better boundary is possible.`;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow component-local functions with parameters in React components. Prefer a state machine, actor, or external helper over inlining the function body into the component.",
    },
  },
  create(context: {
    filename: string;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    if (!_isTsxFile({ filename: context.filename })) {
      return {};
    }

    const check_ = (node: Node) => {
      if (
        (node.params?.length ?? 0) === 0 ||
        node.body === undefined ||
        _owningComponent({ node }) === undefined ||
        !_isComponentOwnedFunction({ node })
      ) {
        return;
      }

      context.report({
        node,
        message: _message({ name: _functionName({ node }) }),
      });
    };

    return {
      ArrowFunctionExpression: check_,
      FunctionDeclaration: check_,
      FunctionExpression: check_,
    };
  },
};

export default rule;
