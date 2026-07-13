import { InputSelect } from "@/components/ui/input-select";
import type { Domain } from "@mai/nutrition";

export function MeasurementUnitSelect({
  disabled,
  onSelect,
  selectedUnit,
  title = "Select unit",
  units,
}: {
  readonly disabled: boolean;
  readonly onSelect: (unit: Domain.MeasurementUnit) => void;
  readonly selectedUnit: Domain.MeasurementUnit;
  readonly title?: string;
  readonly units: readonly Domain.MeasurementUnit[];
}) {
  return (
    <InputSelect
      disabled={disabled}
      onSelect={onSelect}
      options={units.map((unit) => ({
        label: unit === "l" ? "L" : unit,
        value: unit,
      }))}
      selectedValue={selectedUnit}
      title={title}
    />
  );
}
