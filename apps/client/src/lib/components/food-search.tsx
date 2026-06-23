import type { FoodSearchMachine } from "@mai/machines";
import type { Domain } from "@mai/nutrition";
import { useSelector } from "@xstate/react";
import { Array } from "effect";
import { Search } from "lucide-react";

const darkFieldClassName =
  "min-h-10 w-full border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

export function FoodSearchField({
  actor,
  ariaControls,
  ariaLabel,
  autoFocus,
  disabled,
  id,
  label,
  placeholder,
  shape = "rounded",
  showLabel = true,
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly ariaControls?: string;
  readonly ariaLabel: string;
  readonly autoFocus: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly shape?: "rounded" | "square";
  readonly showLabel?: boolean;
}) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);
  const inputShapeClassName = shape === "rounded" ? "rounded-md" : "";

  return (
    <label
      className={showLabel ? darkFieldLabelClassName : "grid min-w-0"}
      htmlFor={id}
    >
      <span className={showLabel ? undefined : "sr-only"}>{label}</span>
      <span className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#77777e]"
          size={17}
          strokeWidth={3}
        />
        <input
          aria-controls={ariaControls}
          aria-label={ariaLabel}
          autoComplete="off"
          autoFocus={autoFocus}
          className={`${darkFieldClassName} ${inputShapeClassName} pl-9`}
          disabled={disabled}
          id={id}
          onChange={(event) => {
            actor.send({
              type: "changeQuery",
              query: event.currentTarget.value,
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            actor.send({
              type: "selectFirstMatchingFood",
            });
          }}
          placeholder={placeholder}
          role="combobox"
          type="search"
          value={query}
        />
      </span>
    </label>
  );
}

export function FoodSearchResults({
  actor,
  emptyFoodsText,
  emptySearchText,
  getPrimaryLabel,
  getSecondaryLabel,
  id,
  shape = "rounded",
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly emptyFoodsText: string;
  readonly emptySearchText: string;
  readonly getPrimaryLabel: (food: Domain.Food) => string;
  readonly getSecondaryLabel: (food: Domain.Food) => string;
  readonly id: string;
  readonly shape?: "rounded" | "square";
}) {
  const foods = useSelector(actor, (snapshot) => snapshot.context.foods);
  const matchingFoods = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingFoods
  );
  const selectedFoodId = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedFoodId
  );
  const itemShapeClassName = shape === "rounded" ? "rounded-md" : "";

  return (
    <div
      className="min-h-0 overflow-y-auto overscroll-contain p-2"
      id={id}
      role="listbox"
    >
      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <p
          className={`${itemShapeClassName} bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]`}
        >
          {emptyFoodsText}
        </p>
      ) : Array.isReadonlyArrayNonEmpty(matchingFoods) ? (
        matchingFoods.map((food) => (
          <button
            aria-selected={selectedFoodId === food.id}
            className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-0 bg-transparent px-3 py-2 text-left text-[#f0f0f2] transition-colors hover:bg-[#202024] aria-selected:bg-[#2a1c1a] ${itemShapeClassName}`}
            key={food.id}
            onClick={() => {
              actor.send({
                type: "selectFood",
                foodId: food.id,
              });
            }}
            role="option"
            type="button"
          >
            <span className="min-w-0 text-sm font-bold leading-tight wrap-anywhere">
              <FoodDefaultOriginDot food={food} />
              {food.name}
            </span>
            <span className="text-right text-sm font-black leading-tight text-[#4c7dff]">
              {getPrimaryLabel(food)}
            </span>
            <span className="grid min-w-0 gap-1 text-xs leading-tight text-[#aaaab1]">
              {food.brand === undefined ? (
                <span
                  aria-label="No brand"
                  className="min-w-0 text-[0.72rem] font-black leading-tight text-[#77777e]"
                >
                  /
                </span>
              ) : (
                <span className="min-w-0 font-normal wrap-anywhere">
                  {food.brand}
                </span>
              )}
            </span>
            <span className="text-right text-xs font-medium leading-tight text-[#aaaab1]">
              {getSecondaryLabel(food)}
            </span>
          </button>
        ))
      ) : (
        <p
          className={`${itemShapeClassName} bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]`}
        >
          {emptySearchText}
        </p>
      )}
    </div>
  );
}

export function FoodDefaultOriginDot({ food }: { readonly food: Domain.Food }) {
  if (food.origin !== "app-default") {
    return null;
  }

  return (
    <span
      aria-label="Pre-installed food"
      className="mr-1.5 inline-block size-1.5 shrink-0 rounded-full bg-[#d9bd6f] align-[2px]"
      role="img"
    />
  );
}
