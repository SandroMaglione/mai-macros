import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/insights")({
  component: Component,
});

function Component() {
  return <Outlet />;
}
