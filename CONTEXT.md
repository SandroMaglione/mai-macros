# Nutrition Tracking

This context defines foods, their portions, and how recorded consumption relates to later revisions.

## Language

**Food**:
A reusable nutritional definition that can be selected when recording consumption.

**Food Portion**:
A food-owned named quantity that defines the physical amount represented by one portion.
_Avoid_: Global portion, serving unit

**Food Price**:
A food-owned monetary amount for a reference quantity. A food may keep several prices, but at most one is its **Current Price**.

**Current Price**:
The optional food price used to estimate spending. The first price added to a food becomes current automatically; afterward the user may select another price or clear the selection entirely.

**Meal Entry**:
A record that a quantity of a food was consumed in a meal on a particular day.
_Avoid_: Food instance

**Copy Food**:
The creation of a distinct food initialized from an existing food while leaving the original food and its meal entries unchanged.

**Edit Food**:
A change to the same food's nutritional and descriptive details that reinterprets every meal entry referring to it. Food portions are managed separately.
_Avoid_: Copy, revision

**Used Portion**:
A food portion that has been selected by at least one meal entry. It cannot be deleted, but an explicit change-everywhere operation may update it and its recorded snapshots.

**Change Portion Everywhere**:
An explicit in-place edit that preserves a food portion's identity and updates every meal entry that selected that portion.

**Create New Portion**:
The creation of a separate food portion, optionally initialized from an existing portion, while leaving earlier meal entries unchanged.

**Food Name Group**:
The foods that share the same normalized name and brand.

**Newest Food**:
The most recently created food in a food name group containing multiple foods.

**Older Food**:
Any food other than the newest food in a food name group containing multiple foods.

## Relationships

- A **Food** owns zero or more **Food Portions**
- A **Food** owns zero or more **Food Prices** and has zero or one **Current Price**
- A **Meal Entry** refers to exactly one **Food**
- A **Meal Entry** may record exactly one **Food Portion**
- **Copy Food** creates a new **Food** without changing the source **Food**
- **Edit Food** preserves the **Food** identity and affects all of its **Meal Entries**
- **Edit Food** does not add, edit, or remove **Food Portions**
- A **Used Portion** cannot be deleted
- **Change Portion Everywhere** preserves the **Food Portion** identity and updates its matching **Meal Entries**
- **Create New Portion** leaves existing **Food Portions** and **Meal Entries** unchanged
- Meal, day, and insight spending is recalculated from each food's **Current Price**; meal entries do not snapshot prices
- Entries without a compatible **Current Price** are unpriced and excluded from cost totals, with coverage reported separately
- Food-price currency is stored in the domain and database as EUR, USD, JPY, or NZD; the current UI creates EUR prices only
- A **Food Name Group** has exactly one **Newest Food** and zero or more **Older Foods**

## Example dialogue

> **Dev:** "Should changing this yogurt affect yesterday's **Meal Entry**?"
> **Domain expert:** "Use **Edit Food** when it is still the same food; use **Copy Food** when you want another food without changing yesterday."

## Flagged ambiguities

- "Preserve history" and "create a revision" were used for creating another food — resolved: this is **Copy Food**, not a status change to the source food.
- "Update history" was used for changing a food definition and all entries referring to it — resolved: this is **Edit Food**.
- "Current", "historical", "superseded", and "retired" were proposed as lifecycle statuses — rejected: **Copy Food** leaves both foods ordinary, while **Edit Food** keeps one food identity.
- "Oldest" was proposed for every previous same-name-and-brand food — resolved: the latest is **Newest Food** and every previous match is an **Older Food**.
- "A field was never used" means that a **Food** or **Food Portion** has no **Meal Entries** — resolved: individual nutritional input fields do not have independent usage.
- "Edit a portion" was previously treated as part of **Edit Food** — resolved: portions have a separate management flow, with **Change Portion Everywhere** and **Create New Portion** as explicit choices.

# Event Tracking

This context defines user-configured events and the occurrences recorded from them.

## Language

**Recordable Event**:
A reusable event definition with a name and emoji that can be selected when recording an occurrence.

**Recorded Event**:
A single occurrence of a recordable event assigned to a local calendar day.

**Record Now**:
The creation of a recorded event with both the device-local calendar day and the exact current UTC instant.

**Record for a Day**:
The creation of one or more day-precision recorded events for a past local calendar day. A batch may repeat the same recordable event and is committed atomically. No exact time is invented when the user only knows the day.

**Event Timeline**:
A reverse-chronological sequence of local calendar days. Every day is visible even when it has no recorded events, and earlier days load as the user scrolls.

**Archive Recordable Event**:
The removal of a recordable event from quick recording while preserving its recorded events and historical display.

## Relationships

- A **Recordable Event** has zero or more **Recorded Events**
- A **Recorded Event** refers to exactly one **Recordable Event**
- The same **Recordable Event** may be recorded multiple times on the same day
- **Record Now** stores an exact occurrence instant and the local day on which it was recorded
- **Record for a Day** stores the selected local day without fabricating an exact time
- A multi-event **Record for a Day** either saves every selected occurrence or none of them
- Editing a **Recordable Event** changes the name or emoji shown for all of its recorded events
- Archiving a **Recordable Event** preserves all of its recorded events
- Recorded events cannot be assigned to a future local day
