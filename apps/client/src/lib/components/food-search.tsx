import type { Food } from "@mai/nutrition";
import { Array } from "effect";
import { Search } from "lucide-react";

const darkFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

export function filterFoodsByQuery({
  foods,
  query,
}: {
  readonly foods: readonly Food[];
  readonly query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryTokens =
    normalizedQuery === "" ? [] : normalizedQuery.split(/\s+/);

  return Array.isReadonlyArrayNonEmpty(queryTokens)
    ? foods.filter((food) => {
        const searchableFood =
          food.brand === undefined
            ? food.name.toLocaleLowerCase()
            : `${food.name} ${food.brand}`.toLocaleLowerCase();

        return queryTokens.every((queryToken) =>
          searchableFood.includes(queryToken)
        );
      })
    : foods;
}

export function sortFoodsByName({
  foods,
}: {
  readonly foods: readonly Food[];
}) {
  return [...foods].sort((leftFood, rightFood) => {
    const nameOrder = leftFood.name.localeCompare(rightFood.name);

    if (nameOrder !== 0) {
      return nameOrder;
    }

    return (leftFood.brand ?? "").localeCompare(rightFood.brand ?? "");
  });
}

export function FoodSearchField({
  ariaControls,
  ariaLabel,
  autoFocus,
  disabled,
  id,
  label,
  onChange,
  onEnter,
  placeholder,
  value,
}: {
  readonly ariaControls: string;
  readonly ariaLabel: string;
  readonly autoFocus: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChange: (query: string) => void;
  readonly onEnter: () => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  return (
    <label className={darkFieldLabelClassName} htmlFor={id}>
      {label}
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
          className={`${darkFieldClassName} pl-9`}
          disabled={disabled}
          id={id}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            onEnter();
          }}
          placeholder={placeholder}
          role="combobox"
          type="search"
          value={value}
        />
      </span>
    </label>
  );
}

export function FoodSearchResults({
  emptyFoodsText,
  emptySearchText,
  foods,
  getPrimaryLabel,
  getSecondaryLabel,
  id,
  matchingFoods,
  onSelectFood,
  selectedFoodId,
}: {
  readonly emptyFoodsText: string;
  readonly emptySearchText: string;
  readonly foods: readonly Food[];
  readonly getPrimaryLabel: (food: Food) => string;
  readonly getSecondaryLabel: (food: Food) => string;
  readonly id: string;
  readonly matchingFoods: readonly Food[];
  readonly onSelectFood: (foodId: Food["id"]) => void;
  readonly selectedFoodId: Food["id"] | null;
}) {
  return (
    <div className="min-h-0 overflow-y-auto p-2" id={id} role="listbox">
      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
          {emptyFoodsText}
        </p>
      ) : Array.isReadonlyArrayNonEmpty(matchingFoods) ? (
        matchingFoods.map((food) => (
          <button
            aria-selected={selectedFoodId === food.id}
            className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-[#f0f0f2] transition-colors hover:bg-[#202024] aria-selected:bg-[#2a1c1a]"
            key={food.id}
            onClick={() => {
              onSelectFood(food.id);
            }}
            role="option"
            type="button"
          >
            <span className="min-w-0 font-extrabold leading-tight wrap-anywhere">
              {food.name}
            </span>
            <span className="text-right text-sm font-black leading-tight text-[#4c7dff]">
              {getPrimaryLabel(food)}
            </span>
            <span className="min-w-0 text-sm font-bold leading-tight text-[#aaaab1] wrap-anywhere">
              {food.brand ?? "No brand"}
            </span>
            <span className="text-right text-sm font-medium leading-tight text-[#aaaab1]">
              {getSecondaryLabel(food)}
            </span>
          </button>
        ))
      ) : (
        <p className="rounded-md bg-[#111113] px-3 py-2 text-sm font-bold text-[#aaaab1]">
          {emptySearchText}
        </p>
      )}
    </div>
  );
}
