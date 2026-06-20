import type { Food } from "@mai/nutrition";
import { useSelector } from "@xstate/react";
import { Array } from "effect";
import { Search } from "lucide-react";

import {
  getFoodCategoryLabel,
  type FoodSearchActorRef,
} from "../machines/food-search-machine.ts";

const darkFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";
const foodMetadataTagToneClassNames = {
  category: "bg-[#10201b] text-[#8fd5a9] ring-[#2e5a43]",
  source: "bg-[#1f1a0d] text-[#d9bd6f] ring-[#5a4720]",
} satisfies Record<FoodMetadataTagTone, string>;

type FoodMetadataTagTone = "category" | "source";

export function FoodSearchField({
  actor,
  ariaControls,
  ariaLabel,
  autoFocus,
  disabled,
  id,
  label,
  placeholder,
}: {
  readonly actor: FoodSearchActorRef;
  readonly ariaControls: string;
  readonly ariaLabel: string;
  readonly autoFocus: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
}) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

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
}: {
  readonly actor: FoodSearchActorRef;
  readonly emptyFoodsText: string;
  readonly emptySearchText: string;
  readonly getPrimaryLabel: (food: Food) => string;
  readonly getSecondaryLabel: (food: Food) => string;
  readonly id: string;
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

  return (
    <div
      className="min-h-0 overflow-y-auto overscroll-contain p-2"
      id={id}
      role="listbox"
    >
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
              actor.send({
                type: "selectFood",
                foodId: food.id,
              });
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
            <span className="grid min-w-0 gap-1 text-sm leading-tight text-[#aaaab1]">
              <span className="min-w-0 font-bold wrap-anywhere">
                {food.brand ?? "No brand"}
              </span>
              <FoodMetadataTags food={food} />
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

export function FoodMetadataTags({ food }: { readonly food: Food }) {
  const showCategory = food.category !== undefined;
  const showSource = food.origin === "app-default";

  if (!showCategory && !showSource) {
    return null;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {showCategory ? (
        <FoodMetadataTag tone="category">
          {getFoodCategoryLabel({ category: food.category })}
        </FoodMetadataTag>
      ) : null}
      {showSource ? (
        <FoodMetadataTag tone="source">Pre-installed</FoodMetadataTag>
      ) : null}
    </span>
  );
}

function FoodMetadataTag({
  children,
  tone,
}: {
  readonly children: string;
  readonly tone: FoodMetadataTagTone;
}) {
  return (
    <span
      className={`inline-flex min-h-4 items-center rounded px-1.5 text-[0.62rem] font-medium uppercase leading-none tracking-normal ring-1 ${foodMetadataTagToneClassNames[tone]}`}
    >
      {children}
    </span>
  );
}
