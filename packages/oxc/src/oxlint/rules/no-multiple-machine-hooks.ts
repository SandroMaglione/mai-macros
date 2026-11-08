const machineOwnerHooks = {
  library: new Set(["useMachineAtom"]),
  local: new Set(["useMachine"]),
};

const _hookSource = ({ source }: { source: string | undefined }) =>
  source === "@typeonce/effect-machine-react"
    ? "library"
    : source !== undefined && /(^|\/)use-machine(\.ts)?$/.test(source)
      ? "local"
      : undefined;

type Node = {
  arguments?: Array<Node>;
  callee?: Node;
  id?: Node;
  imported?: Node;
  init?: Node;
  local?: Node;
  name?: string;
  object?: Node;
  parent?: Node;
  property?: Node;
  source?: { value?: string };
  specifiers?: Array<Node>;
  type: string;
};

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

const _enclosingComponent = ({ node }: { node: Node }) => {
  let current = node.parent;

  while (current !== undefined) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    ) {
      const name = _componentName({ node: current });

      return name === undefined ? undefined : { name, node: current };
    }

    current = current.parent;
  }

  return undefined;
};

const _memberPropertyName = ({ node }: { node: Node }) => {
  if (node.property?.type !== "Identifier") {
    return undefined;
  }

  return node.property.name;
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow owning more than one effect-machine machine in the same component. Compose machines with child machines instead.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    const localHookNames = new Set<string>();
    const namespaceHooks = new Map<string, Set<string>>();
    const componentHookCounts = new WeakMap<Node, number>();

    return {
      ImportDeclaration(node: Node) {
        const hookSource = _hookSource({ source: node.source?.value });

        if (hookSource === undefined) {
          return;
        }

        const ownerHooks = machineOwnerHooks[hookSource];

        for (const specifier of node.specifiers ?? []) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            if (specifier.local?.name !== undefined) {
              namespaceHooks.set(specifier.local.name, ownerHooks);
            }

            continue;
          }

          if (
            specifier.type === "ImportSpecifier" &&
            ownerHooks.has(specifier.imported?.name ?? "") &&
            specifier.local?.name !== undefined
          ) {
            localHookNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node: Node) {
        const hookName =
          node.callee?.type === "Identifier" &&
          localHookNames.has(node.callee.name ?? "")
            ? node.callee.name
            : node.callee?.type === "MemberExpression" &&
                node.callee.object?.type === "Identifier" &&
                (
                  namespaceHooks.get(node.callee.object.name ?? "") ??
                  new Set<string>()
                ).has(_memberPropertyName({ node: node.callee }) ?? "")
              ? _memberPropertyName({ node: node.callee })
              : undefined;

        if (hookName === undefined) {
          return;
        }

        const component = _enclosingComponent({ node });

        if (component === undefined) {
          return;
        }

        const currentCount = componentHookCounts.get(component.node) ?? 0;
        componentHookCounts.set(component.node, currentCount + 1);

        if (currentCount === 0) {
          return;
        }

        context.report({
          node: node.callee,
          message: `${component.name} owns multiple machines. Compose machines with child machines instead.`,
        });
      },
    };
  },
};

export default rule;
