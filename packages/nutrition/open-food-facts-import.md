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

Build a filtered candidate cache from the full Open Food Facts export:

```sh
nice -n 19 pnpm run catalog:open-food-facts -- --build-cache --yield-every 10000 --sleep-ms 20
```

Generate catalogs from the candidate cache without rescanning the full export:

```sh
pnpm run catalog:open-food-facts -- --from-cache
```

Tune cleanup rules on a smaller matched slice:

```sh
pnpm run catalog:open-food-facts -- --build-cache --max-matches-per-catalog 200
pnpm run catalog:open-food-facts -- --from-cache --max-matches-per-catalog 200 --dry-run
```
