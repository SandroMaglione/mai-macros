import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen min-w-80 bg-[#090909] font-sans text-[#e9e9ed] scheme-dark">
      <Outlet />
    </div>
  ),
});
