import type { ReactNode } from "react";

export const appHeaderActionClassName =
  "inline-flex size-12 items-center justify-center rounded-full text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export function AppHeader({
  children,
  leading,
  navigationLabel,
  shadow = false,
  sticky = false,
  title,
  center,
  trailing,
}: {
  readonly children?: ReactNode;
  readonly leading?: ReactNode;
  readonly navigationLabel?: string;
  readonly shadow?: boolean;
  readonly sticky?: boolean;
  readonly title?: string;
  readonly center?: ReactNode;
  readonly trailing?: ReactNode;
}) {
  const Row = navigationLabel === undefined ? "div" : "nav";
  const positionClassName = sticky ? "sticky top-0 z-30" : "";
  const shadowClassName = shadow ? "shadow-lg shadow-black/25" : "";

  return (
    <header
      className={`${positionClassName} bg-[#ff5a51] pb-[calc(env(safe-area-inset-top)+0.45rem)] pt-[calc(env(safe-area-inset-top)+0.45rem)] ${shadowClassName}`}
    >
      <div className="px-4">
        <Row
          aria-label={navigationLabel}
          className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
        >
          <div className="min-w-0 justify-self-start">{leading}</div>
          <div className="min-w-0 justify-self-center text-center text-white">
            {center ?? (
              <h1 className="min-w-0 truncate text-xl font-black leading-tight">
                {title}
              </h1>
            )}
          </div>
          <div className="min-w-0 justify-self-end">{trailing}</div>
        </Row>

        {children === undefined || children === null ? null : (
          <div className="mt-3">{children}</div>
        )}
      </div>
    </header>
  );
}
