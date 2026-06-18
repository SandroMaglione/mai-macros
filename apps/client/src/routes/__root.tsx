import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen min-w-80 bg-[linear-gradient(135deg,rgb(209_250_229_/_0.95),transparent_40%),linear-gradient(315deg,rgb(255_228_230_/_0.9),transparent_45%),linear-gradient(45deg,rgb(219_234_254_/_0.85),transparent_52%),#f8fafc] font-sans text-stone-950">
      <Outlet />
    </div>
  ),
});
