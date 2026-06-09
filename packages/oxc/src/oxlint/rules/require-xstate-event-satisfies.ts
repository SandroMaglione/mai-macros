type Node = {
  argument?: Node;
  arguments?: Array<Node>;
  body?: Array<Node> | Node;
  callee?: Node;
  expression?: Node;
  name?: string;
  type: string;
};

const _xstateSendEventArgumentIndex = ({ node }: { node: Node }) => {
  if (node.callee?.type !== "Identifier") {
    return undefined;
  }

  if (node.callee.name === "sendParent") {
    return 0;
  }

  if (node.callee.name === "sendTo") {
    return 1;
  }

  return undefined;
};

const _unwrapExpression = ({ node }: { node: Node }): Node => {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "ChainExpression" ||
    node.type === "TSNonNullExpression"
  ) {
    return node.expression === undefined
      ? node
      : _unwrapExpression({ node: node.expression });
  }

  return node;
};

const _isSatisfiedObjectEvent = ({ node }: { node: Node }) => {
  const expression = _unwrapExpression({ node });

  return (
    expression.type === "TSSatisfiesExpression" &&
    expression.expression !== undefined &&
    _unwrapExpression({ node: expression.expression }).type ===
      "ObjectExpression"
  );
};

const _isBareObjectEvent = ({ node }: { node: Node }) =>
  _unwrapExpression({ node }).type === "ObjectExpression";

const _eventObjectsMissingSatisfies = ({
  node,
}: {
  node: Node;
}): Array<Node> => {
  const eventCreator = _unwrapExpression({ node });

  if (_isSatisfiedObjectEvent({ node: eventCreator })) {
    return [];
  }

  if (_isBareObjectEvent({ node: eventCreator })) {
    return [eventCreator];
  }

  if (
    eventCreator.type === "ArrowFunctionExpression" ||
    eventCreator.type === "FunctionExpression"
  ) {
    if (eventCreator.body === undefined) {
      return [];
    }

    if (
      !Array.isArray(eventCreator.body) &&
      eventCreator.body.type === "BlockStatement" &&
      Array.isArray(eventCreator.body.body)
    ) {
      return eventCreator.body.body.flatMap((statement) => {
        if (
          statement.type !== "ReturnStatement" ||
          statement.argument === undefined
        ) {
          return [];
        }

        const argument = _unwrapExpression({ node: statement.argument });

        if (_isSatisfiedObjectEvent({ node: argument })) {
          return [];
        }

        return _isBareObjectEvent({ node: argument }) ? [argument] : [];
      });
    }

    if (!Array.isArray(eventCreator.body)) {
      const body = _unwrapExpression({ node: eventCreator.body });

      if (_isSatisfiedObjectEvent({ node: body })) {
        return [];
      }

      return _isBareObjectEvent({ node: body }) ? [body] : [];
    }

    return eventCreator.body.flatMap((statement) => {
      if (
        statement.type !== "ReturnStatement" ||
        statement.argument === undefined
      ) {
        return [];
      }

      const argument = _unwrapExpression({ node: statement.argument });

      if (_isSatisfiedObjectEvent({ node: argument })) {
        return [];
      }

      return _isBareObjectEvent({ node: argument }) ? [argument] : [];
    });
  }

  return [];
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require XState sent object events to use a satisfies event type.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: Node) {
        const eventArgumentIndex = _xstateSendEventArgumentIndex({ node });

        if (eventArgumentIndex === undefined) {
          return;
        }

        const eventArgument = node.arguments?.[eventArgumentIndex];

        if (eventArgument === undefined) {
          return;
        }

        for (const eventObject of _eventObjectsMissingSatisfies({
          node: eventArgument,
        })) {
          context.report({
            node: eventObject,
            message:
              "XState sent object events must use satisfies with the target event type.",
          });
        }
      },
    };
  },
};

export default rule;
