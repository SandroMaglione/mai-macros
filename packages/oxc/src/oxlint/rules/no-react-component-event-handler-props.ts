type Node = {
  attributes?: Array<Node>;
  name?: Node | string;
  object?: Node;
  property?: Node;
  type: string;
};

const _startsWithUppercase = ({ value }: { value: string | undefined }) =>
  value !== undefined && /^[A-Z]/.test(value);

const _nodeName = ({ node }: { node: Node }) =>
  typeof node.name === "string" ? node.name : undefined;

const _isCustomJsxName = ({
  node,
}: {
  node: Node | string | undefined;
}): boolean => {
  if (node === undefined || typeof node === "string") {
    return false;
  }

  if (node.type === "JSXIdentifier") {
    return _startsWithUppercase({ value: _nodeName({ node }) });
  }

  if (node.type === "JSXMemberExpression") {
    return (
      _isCustomJsxName({ node: node.object }) ||
      _isCustomJsxName({ node: node.property })
    );
  }

  return false;
};

const _jsxAttributeName = ({ node }: { node: Node }) => {
  const name = _nodeName({ node });

  if (name !== undefined) {
    return name;
  }

  const nameNode = typeof node.name === "string" ? undefined : node.name;

  if (nameNode?.type === "JSXIdentifier") {
    return _nodeName({ node: nameNode });
  }

  return undefined;
};

const _isEventHandlerProp = (name: string | undefined): name is string =>
  name !== undefined && /^on[A-Z]/.test(name);

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on React custom component onX props so callback prompts can be considered for actor refs instead.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      JSXOpeningElement(node: Node) {
        if (!_isCustomJsxName({ node: node.name })) {
          return;
        }

        for (const attribute of node.attributes ?? []) {
          if (attribute.type !== "JSXAttribute") {
            continue;
          }

          const name = _jsxAttributeName({ node: attribute });

          if (!_isEventHandlerProp(name)) {
            continue;
          }

          context.report({
            node: attribute.name,
            message: `Consider whether ${name} is needed here. Prefer passing an actor ref to the child component and modeling the interaction with XState actors instead of passing callback props down.`,
          });
        }
      },
    };
  },
};

export default rule;
