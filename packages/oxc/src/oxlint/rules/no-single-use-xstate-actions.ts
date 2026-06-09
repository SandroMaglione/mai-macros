type Node = {
  arguments?: Array<Node>;
  callee?: Node;
  elements?: Array<Node | null>;
  key?: Node;
  name?: string;
  object?: Node;
  properties?: Array<Node>;
  property?: Node;
  type: string;
  value?: Node | string;
};

const _propertyName = ({ node }: { node: Node }) => {
  if (node.key?.type === "Identifier") {
    return node.key.name;
  }

  if (typeof node.key?.value === "string") {
    return node.key.value;
  }

  if (node.property?.type === "Identifier") {
    return node.property.name;
  }

  if (typeof node.property?.value === "string") {
    return node.property.value;
  }

  return undefined;
};

const _stringLiteralValue = ({ node }: { node: Node }) =>
  typeof node.value === "string" ? node.value : undefined;

const _objectProperty = ({ node, name }: { node: Node; name: string }) => {
  if (node.type !== "ObjectExpression") {
    return undefined;
  }

  return node.properties?.find(
    (property) => _propertyName({ node: property }) === name
  );
};

const _collectSetupActionDefinitions = ({ node }: { node: Node }) => {
  const setupOptions = node.arguments?.[0];
  const actionsProperty =
    setupOptions === undefined
      ? undefined
      : _objectProperty({ node: setupOptions, name: "actions" });

  if (
    actionsProperty === undefined ||
    typeof actionsProperty.value === "string" ||
    actionsProperty.value?.type !== "ObjectExpression"
  ) {
    return [];
  }

  return (actionsProperty.value.properties ?? []).flatMap((property) => {
    const name = _propertyName({ node: property });
    return name === undefined ? [] : [{ name, node: property }];
  });
};

const _actionReferenceNames = ({ node }: { node: Node }): Array<string> => {
  const literalValue = _stringLiteralValue({ node });

  if (literalValue !== undefined) {
    return [literalValue];
  }

  if (node.type === "ArrayExpression") {
    return (node.elements ?? []).flatMap((element) =>
      element === null ? [] : _actionReferenceNames({ node: element })
    );
  }

  const typeProperty = _objectProperty({ node, name: "type" });

  if (
    typeProperty !== undefined &&
    typeof typeProperty.value !== "string" &&
    typeProperty.value !== undefined
  ) {
    const typeValue = _stringLiteralValue({ node: typeProperty.value });
    return typeValue === undefined ? [] : [typeValue];
  }

  return [];
};

const _countMachineActionReferences = ({
  counts,
  definedNames,
  node,
}: {
  counts: Map<string, number>;
  definedNames: Set<string>;
  node: Node;
}) => {
  if (node.type === "ObjectExpression") {
    for (const property of node.properties ?? []) {
      if (_propertyName({ node: property }) === "actions") {
        if (
          typeof property.value !== "string" &&
          property.value !== undefined
        ) {
          for (const name of _actionReferenceNames({ node: property.value })) {
            if (definedNames.has(name)) {
              counts.set(name, (counts.get(name) ?? 0) + 1);
            }
          }
        }

        continue;
      }

      if (typeof property.value !== "string" && property.value !== undefined) {
        _countMachineActionReferences({
          counts,
          definedNames,
          node: property.value,
        });
      }
    }
  }

  if (node.type === "ArrayExpression") {
    for (const element of node.elements ?? []) {
      if (element !== null) {
        _countMachineActionReferences({ counts, definedNames, node: element });
      }
    }
  }
};

const _setupCallFromCreateMachineCall = ({ node }: { node: Node }) => {
  if (
    node.callee?.type !== "MemberExpression" ||
    _propertyName({ node: node.callee }) !== "createMachine" ||
    node.callee.object?.type !== "CallExpression" ||
    node.callee.object.callee?.type !== "Identifier" ||
    node.callee.object.callee.name !== "setup"
  ) {
    return undefined;
  }

  return node.callee.object;
};

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow custom XState setup actions that are referenced only once inside the machine config.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: Node) {
        const setupCall = _setupCallFromCreateMachineCall({ node });

        if (setupCall === undefined) {
          return;
        }

        const definitions = _collectSetupActionDefinitions({ node: setupCall });

        if (definitions.length === 0) {
          return;
        }

        const machineConfig = node.arguments?.[0];

        if (machineConfig === undefined) {
          return;
        }

        const definedNames = new Set(
          definitions.map((definition) => definition.name)
        );
        const counts = new Map<string, number>();

        _countMachineActionReferences({
          counts,
          definedNames,
          node: machineConfig,
        });

        for (const definition of definitions) {
          if ((counts.get(definition.name) ?? 0) !== 1) {
            continue;
          }

          context.report({
            node: definition.node,
            message: `Inline the "${definition.name}" XState action at its only usage site instead of defining it in setup actions.`,
          });
        }
      },
    };
  },
};

export default rule;
