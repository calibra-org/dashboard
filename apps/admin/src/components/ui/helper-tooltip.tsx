import {
    HelperTooltip as PanelHelperTooltip,
    type HelperTooltipProps as PanelHelperTooltipProps,
} from "@calibra/panel-kit/helper-tooltip";
import type { ReactNode } from "react";

export type HelperTooltipProps = Omit<PanelHelperTooltipProps, "children"> & {
    children?: ReactNode;
    text?: ReactNode;
    label?: string;
};

/**
 * Compatibility shim around the shared Panel Kit primitive. New code should prefer children;
 * `text` remains supported for feature modules migrated from the older admin helper contract.
 */
export function HelperTooltip({ children, text, label, ...props }: HelperTooltipProps) {
    void label;
    return <PanelHelperTooltip {...props}>{children ?? text ?? null}</PanelHelperTooltip>;
}
