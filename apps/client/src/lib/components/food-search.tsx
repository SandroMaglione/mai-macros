import type { FoodSearchMachine } from "@mai/machines";
import { Utils, type Domain } from "@mai/nutrition";
import { useSelector } from "@xstate/react";
import { Array } from "effect";
import { Search } from "lucide-react";

const darkFieldClassName =
  "min-h-10 w-full border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const darkFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

const dominantMacronutrientIndicator = {
  carbs: {
    accessibilityLabel: "mostly carbs",
    className: "bg-[#ff4f8b]",
  },
  fat: {
    accessibilityLabel: "mostly fat",
    className: "bg-[#ffbd35]",
  },
  protein: {
    accessibilityLabel: "mostly protein",
    className: "bg-[#79a0ff]",
  },
} satisfies Record<
  Utils.DominantMacronutrient,
  {
    readonly accessibilityLabel: string;
    readonly className: string;
  }
>;

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
      className="min-h-0 overflow-y-auto overscroll-contain pb-2"
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
        matchingFoods.map((food) => {
          const originClassName =
            food.origin === "user"
              ? "bg-[#161618] hover:bg-[#222226]"
              : "bg-transparent hover:bg-[#202024]";
          const secondaryLabel = getSecondaryLabel(food);
          const brand =
            food.brand === undefined || food.brand.trim() === ""
              ? null
              : food.brand;
          const dominantMacronutrient = Utils.findDominantMacronutrient({
            food,
          });
          const dominantMacronutrientMeta =
            dominantMacronutrient === null
              ? null
              : dominantMacronutrientIndicator[dominantMacronutrient];

          return (
            <button
              aria-selected={selectedFoodId === food.id}
              className={`grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-x-0 border-b border-t-0 border-[#4a4a50] px-4 py-3 text-left text-[#f0f0f2] transition-colors last:border-b-0 aria-selected:bg-[#2a1c1a] ${originClassName}`}
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
              <span className="min-w-0 overflow-hidden text-sm font-bold leading-tight wrap-anywhere [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {food.name}
                {food.origin === "app-default" ? (
                  <span className="sr-only">, pre-installed food</span>
                ) : null}
              </span>
              <span className="text-right text-sm font-black leading-tight text-[#f0f0f2]">
                {getPrimaryLabel(food)}
              </span>
              <span className="grid min-w-0 gap-1 text-xs leading-tight text-[#aaaab1]">
                <span className="flex min-h-[1em] min-w-0 items-center gap-2">
                  {dominantMacronutrientMeta === null ? null : (
                    <>
                      <span
                        aria-hidden="true"
                        className={`size-1.5 shrink-0 rounded-full ${dominantMacronutrientMeta.className}`}
                      />
                      <span className="sr-only">
                        {dominantMacronutrientMeta.accessibilityLabel}
                      </span>
                    </>
                  )}
                  {brand === null ? null : (
                    <span className="min-w-0 font-normal wrap-anywhere">
                      {brand}
                    </span>
                  )}
                </span>
              </span>
              <span
                aria-hidden={secondaryLabel === ""}
                className="min-h-[1em] text-right text-xs font-medium leading-tight text-[#aaaab1]"
              >
                {secondaryLabel}
              </span>
            </button>
          );
        })
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
