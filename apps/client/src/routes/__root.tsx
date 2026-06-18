import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen min-w-80 bg-stone-100 font-sans text-stone-950">
      <Outlet />
    </div>
  ),
});
