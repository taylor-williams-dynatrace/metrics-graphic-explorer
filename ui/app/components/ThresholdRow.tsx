import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Button } from "@dynatrace/strato-components/buttons";
import { DeleteIcon } from "@dynatrace/strato-icons";
import {
  COMPARATORS,
  THRESHOLD_COLOR_PRESETS,
  type Threshold,
  type ThresholdComparator,
} from "../types/metricsView";
import { NativeInput } from "./NativeField";
import { SelectField } from "./SelectField";

interface ThresholdRowProps {
  threshold: Threshold;
  onChange: (threshold: Threshold) => void;
  onRemove: () => void;
}

/**
 * Editor for a single color threshold: comparator + value + color. The color
 * can be chosen from preset swatches or a custom color picker.
 */
export const ThresholdRow: React.FC<ThresholdRowProps> = ({
  threshold,
  onChange,
  onRemove,
}) => {
  return (
    <Flex flexDirection="column" gap={4} style={{ width: "100%" }}>
      <Flex gap={4} alignItems="center" style={{ width: "100%" }}>
        <div style={{ width: 72, flexShrink: 0 }}>
          <SelectField
            value={threshold.comparator}
            ariaLabel="Threshold comparator"
            onChange={(v) =>
              onChange({
                ...threshold,
                comparator: v as ThresholdComparator,
              })
            }
            options={COMPARATORS}
          />
        </div>
        <div style={{ flex: 1 }}>
          <NativeInput
            type="number"
            value={Number.isFinite(threshold.value) ? threshold.value : ""}
            placeholder="value"
            aria-label="Threshold value"
            onChange={(e) =>
              onChange({ ...threshold, value: parseFloat(e.target.value) })
            }
          />
        </div>
        <input
          type="color"
          value={threshold.color}
          aria-label="Threshold color"
          onChange={(e) => onChange({ ...threshold, color: e.target.value })}
          style={{
            width: 36,
            height: 32,
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <Button
          variant="default"
          onClick={onRemove}
          aria-label="Remove threshold"
          style={{ minWidth: "auto", padding: 4 }}
        >
          <Button.Prefix>
            <DeleteIcon />
          </Button.Prefix>
        </Button>
      </Flex>
      <Flex gap={4} style={{ paddingLeft: 68 }}>
        {THRESHOLD_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            title={preset.label}
            aria-label={preset.label}
            onClick={() => onChange({ ...threshold, color: preset.color })}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              cursor: "pointer",
              background: preset.color,
              border:
                threshold.color.toLowerCase() === preset.color.toLowerCase()
                  ? "2px solid #161616"
                  : "1px solid rgba(0,0,0,0.2)",
            }}
          />
        ))}
      </Flex>
    </Flex>
  );
};
