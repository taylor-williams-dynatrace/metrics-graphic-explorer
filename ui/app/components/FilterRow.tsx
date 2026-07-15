import React, { useId, useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Button } from "@dynatrace/strato-components/buttons";
import { DeleteIcon } from "@dynatrace/strato-icons";
import type { TileFilter } from "../types/metricsView";
import { dimensionValuesQuery } from "../services/metricsQuery";
import { NativeInput } from "./NativeField";
import { SelectField } from "./SelectField";

interface FilterRowProps {
  metricKey: string;
  filter: TileFilter;
  /** Discovered dimension keys for the selected metric. */
  dimensionOptions: string[];
  onChange: (filter: TileFilter) => void;
  onRemove: () => void;
}

/**
 * A single dimension filter editor. When a dimension is chosen, it queries the
 * distinct values for that dimension to populate an autocomplete datalist,
 * while still allowing free-text entry.
 */
export const FilterRow: React.FC<FilterRowProps> = ({
  metricKey,
  filter,
  dimensionOptions,
  onChange,
  onRemove,
}) => {
  const listId = useId();

  const valuesQuery = useMemo(
    () =>
      filter.dimension
        ? dimensionValuesQuery(metricKey, filter.dimension)
        : "",
    [metricKey, filter.dimension],
  );

  const { data } = useDql(
    { query: valuesQuery },
    { enabled: Boolean(filter.dimension) },
  );

  const valueSuggestions = useMemo(() => {
    const records =
      (data?.records as Array<Record<string, unknown>> | undefined) ?? [];
    return records
      .map((r) => r[filter.dimension])
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, 200);
  }, [data, filter.dimension]);

  return (
    <Flex gap={4} alignItems="center" style={{ width: "100%" }}>
      <div style={{ flex: "1 1 45%" }}>
        <SelectField
          value={filter.dimension}
          placeholder="dimension…"
          ariaLabel="Filter dimension"
          onChange={(v) => onChange({ ...filter, dimension: v })}
          options={[
            ...(filter.dimension &&
            !dimensionOptions.includes(filter.dimension)
              ? [{ value: filter.dimension, label: filter.dimension }]
              : []),
            ...dimensionOptions.map((dim) => ({ value: dim, label: dim })),
          ]}
        />
      </div>
      <div style={{ flex: "1 1 45%" }}>
        <NativeInput
          list={listId}
          value={filter.value}
          placeholder="value"
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="Filter value"
        />
        <datalist id={listId}>
          {valueSuggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
      <Button
        variant="default"
        onClick={onRemove}
        aria-label="Remove filter"
        style={{ minWidth: "auto", padding: 4 }}
      >
        <Button.Prefix>
          <DeleteIcon />
        </Button.Prefix>
      </Button>
    </Flex>
  );
};
