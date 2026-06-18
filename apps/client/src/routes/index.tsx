import { createFileRoute } from "@tanstack/react-router";

const Component = () => (
  <main className="shell">
    <section className="status-panel">
      <p className="eyebrow">Mai</p>
      <h1>Client ready</h1>
      <p className="lede">
        TanStack Router is mounted. The nutrition data model is covered by the
        package tests.
      </p>
    </section>
  </main>
);

export const Route = createFileRoute("/")({
  component: Component,
});
