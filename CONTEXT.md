# Nutrition Tracking

This context defines foods, their portions, and how recorded consumption relates to later revisions.

## Language

**Food**:
A reusable nutritional definition that can be selected when recording consumption.

**Food Portion**:
A food-owned named quantity that defines the physical amount represented by one portion.
_Avoid_: Global portion, serving unit

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
- A **Meal Entry** refers to exactly one **Food**
- A **Meal Entry** may record exactly one **Food Portion**
- **Copy Food** creates a new **Food** without changing the source **Food**
- **Edit Food** preserves the **Food** identity and affects all of its **Meal Entries**
- **Edit Food** does not add, edit, or remove **Food Portions**
- A **Used Portion** cannot be deleted
- **Change Portion Everywhere** preserves the **Food Portion** identity and updates its matching **Meal Entries**
- **Create New Portion** leaves existing **Food Portions** and **Meal Entries** unchanged
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
