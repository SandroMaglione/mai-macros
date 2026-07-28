import { NumberField } from "@/components/ui/field";
import { SectionCard } from "@/components/ui/section-card";
import { color, spacing, tokens } from "@/theme/tokens";
import type { Domain } from "@mai/nutrition";
import { StyleSheet, Text, View } from "react-native";

import { MeasurementUnitSelect } from "./measurement-unit-select";

type FoodPriceInputFieldsProps = {
  readonly disabled: boolean;
  readonly onPriceChange: (value: string) => void;
  readonly onQuantityChange: (value: string) => void;
  readonly onQuantityUnitChange: (unit: Domain.MeasurementUnit) => void;
  readonly price: string;
  readonly priceError?: string | undefined;
  readonly quantity: string;
  readonly quantityError?: string | undefined;
  readonly quantityUnit: Domain.MeasurementUnit;
};

export function FoodPriceFields({
  disabled,
  price,
  priceError,
  quantity,
  quantityError,
  quantityUnit,
  onPriceChange,
  onQuantityChange,
  onQuantityUnitChange,
  subtitle,
  title = "Price details",
}: FoodPriceInputFieldsProps & {
  readonly subtitle?: string | undefined;
  readonly title?: string | undefined;
}) {
  return (
    <SectionCard subtitle={subtitle} title={title}>
      <FoodPriceInputFields
        disabled={disabled}
        onPriceChange={onPriceChange}
        onQuantityChange={onQuantityChange}
        onQuantityUnitChange={onQuantityUnitChange}
        price={price}
        priceError={priceError}
        quantity={quantity}
        quantityError={quantityError}
        quantityUnit={quantityUnit}
      />
    </SectionCard>
  );
}

export function FoodPriceInputFields({
  disabled,
  onPriceChange,
  onQuantityChange,
  onQuantityUnitChange,
  price,
  priceError,
  quantity,
  quantityError,
  quantityUnit,
}: FoodPriceInputFieldsProps) {
  return (
    <View style={styles.fields}>
      <NumberField
        editable={!disabled}
        error={priceError}
        label="Price"
        onChangeText={onPriceChange}
        placeholder="0.00"
        rightElement={<Text style={styles.currency}>€ EUR</Text>}
        value={price}
      />
      <NumberField
        editable={!disabled}
        error={quantityError}
        label="Quantity"
        onChangeText={onQuantityChange}
        placeholder="1"
        rightElement={
          <MeasurementUnitSelect
            disabled={disabled}
            onSelect={onQuantityUnitChange}
            selectedUnit={quantityUnit}
            title="Price unit"
            units={["g", "kg", "oz", "lb", "ml", "l"]}
          />
        }
        value={quantity}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  currency: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
  },
  fields: { gap: spacing.md },
});
