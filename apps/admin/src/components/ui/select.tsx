"use client";

import { Select as PanelSelect } from "@calibra/panel-kit/select";
import type { ComponentProps } from "react";

export {
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@calibra/panel-kit/select";

type PanelSelectProps = ComponentProps<typeof PanelSelect>;
type PanelSelectChange = NonNullable<PanelSelectProps["onValueChange"]>;
type PanelSelectChangeDetails = Parameters<PanelSelectChange>[1];

export interface SelectProps extends Omit<PanelSelectProps, "defaultValue" | "multiple" | "onValueChange" | "value"> {
    value?: string | null;
    defaultValue?: string | null;
    onValueChange?: (value: string, eventDetails: PanelSelectChangeDetails) => void;
}

/**
 * Admin selects are single-value string controls. Base UI's generic Root loses its value type when
 * it crosses the panel-kit re-export boundary, which otherwise widens callbacks to `unknown`.
 * Keep the admin-facing contract explicit while leaving the shared primitive generic for other
 * operator panels.
 */
export function Select({ onValueChange, ...props }: SelectProps) {
    return (
        <PanelSelect
            {...props}
            multiple={false}
            onValueChange={
                onValueChange
                    ? (value, eventDetails) => {
                          if (typeof value === "string") onValueChange(value, eventDetails);
                      }
                    : undefined
            }
        />
    );
}

Select.displayName = "Select";
