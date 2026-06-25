# Open Food Facts Catalog Import

Download the Open Food Facts food export into:

```txt
data/open-food-facts/raw/en.openfoodfacts.org.products.csv.gz
```

Source:

```txt
https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
```

Run the default Lidl Italy and Bennet Italy import:

```sh
pnpm run catalog:open-food-facts
```

Generated import files are written under:

```txt
data/open-food-facts/catalogs/
```

Foods generated from Open Food Facts are written with `origin: "import"`,
so the app can distinguish external catalog imports from foods created manually
by the user.

The default catalogs are defined in:

```txt
packages/nutrition/open-food-facts-catalogs.json
```

Useful flags:

```sh
pnpm run catalog:open-food-facts -- --dry-run
pnpm run catalog:open-food-facts -- --limit 50000
pnpm run catalog:open-food-facts -- --log-every 10000
pnpm run catalog:open-food-facts -- --pause-at before-write
```
