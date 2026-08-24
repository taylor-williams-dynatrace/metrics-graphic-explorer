import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  XmarkIcon,
  PlusIcon,
} from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";

interface ColumnPickerProps {
  /** All field keys the query returned (the pool of choosable columns). */
  fields: string[];
  /** Currently selected columns, in display order. */
  value: string[];
  onChange: (next: string[]) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: Colors.Text.Neutral.Default,
};

/**
 * Picks and orders which DQL result fields appear as table columns. Selected
 * columns are shown in order with up/down/remove controls; remaining fields can
 * be added. Order in `value` is the table's left-to-right column order.
 */
export const ColumnPicker: React.FC<ColumnPickerProps> = ({
  fields,
  value,
  onChange,
}) => {
  // Only keep selections that still exist in the current result.
  const selected = value.filter((c) => fields.includes(c));
  const available = fields.filter((c) => !selected.includes(c));

  function move(index: number, delta: number) {
    const next = [...selected];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(col: string) {
    onChange(selected.filter((c) => c !== col));
  }

  function add(col: string) {
    onChange([...selected, col]);
  }

  if (fields.length === 0) {
    return (
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: Colors.Text.Neutral.Subdued,
        }}
      >
        Run the query above to choose which columns to show.
      </Text>
    );
  }

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex justifyContent="space-between" alignItems="center">
        <Text style={labelStyle}>Columns shown ({selected.length})</Text>
        <Flex gap={4}>
          <Button
            variant="default"
            onClick={() => onChange(fields)}
            style={{ minWidth: "auto", padding: "2px 8px" }}
          >
            Select all
          </Button>
          <Button
            variant="default"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            style={{ minWidth: "auto", padding: "2px 8px" }}
          >
            Clear
          </Button>
        </Flex>
      </Flex>

      {selected.length === 0 ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: Colors.Text.Critical.Default,
          }}
        >
          Select at least one column to display.
        </Text>
      ) : (
        <Flex flexDirection="column" gap={4}>
          {selected.map((col, i) => (
            <Flex
              key={col}
              alignItems="center"
              justifyContent="space-between"
              gap={6}
              style={{
                padding: "4px 6px",
                borderRadius: 4,
                border: `1px solid ${Colors.Border.Neutral.Default}`,
                background: Colors.Background.Surface.Default,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {col}
              </Text>
              <Flex gap={0} alignItems="center">
                <Button
                  variant="default"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${col} up`}
                  style={{ minWidth: "auto", padding: 2 }}
                >
                  <Button.Prefix>
                    <ChevronUpIcon />
                  </Button.Prefix>
                </Button>
                <Button
                  variant="default"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label={`Move ${col} down`}
                  style={{ minWidth: "auto", padding: 2 }}
                >
                  <Button.Prefix>
                    <ChevronDownIcon />
                  </Button.Prefix>
                </Button>
                <Button
                  variant="default"
                  onClick={() => remove(col)}
                  aria-label={`Remove ${col}`}
                  style={{ minWidth: "auto", padding: 2 }}
                >
                  <Button.Prefix>
                    <XmarkIcon />
                  </Button.Prefix>
                </Button>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}

      {available.length > 0 && (
        <Flex flexDirection="column" gap={4}>
          <Text style={labelStyle}>Add a column</Text>
          <Flex gap={4} style={{ flexWrap: "wrap" }}>
            {available.map((col) => (
              <Button
                key={col}
                variant="default"
                onClick={() => add(col)}
                style={{ minWidth: "auto", padding: "2px 8px" }}
              >
                <Button.Prefix>
                  <PlusIcon />
                </Button.Prefix>
                {col}
              </Button>
            ))}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};
