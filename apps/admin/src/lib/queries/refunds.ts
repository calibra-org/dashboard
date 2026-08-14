"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";

export type GatewayRefundStatus = "completed" | "manual_action_required" | "unknown";

export interface CreateIdempotentRefundInput {
    order_id: number;
    amount_minor?: number | null;
    reason?: string | null;
    idempotency_key: string;
}

export interface AdminRefundResult {
    id: number;
    order_id: number;
    refund_number: number;
    amount_minor: number;
    reason: string | null;
    processed_at: string | null;
    gateway_refund_id: string | null;
    gateway_refund_status: GatewayRefundStatus;
    gateway_refund_error_code: string | null;
}

interface RefundEnvelope {
    data: AdminRefundResult;
}

/**
 * Retry-safe amount refund for operator workflows. The caller owns the idempotency key so an
 * ambiguous network failure can be retried with the same token; the token must rotate when the
 * logical payload changes.
 */
export function useCreateIdempotentRefund() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();

    return useMutation<RefundEnvelope, Error, CreateIdempotentRefundInput>({
        mutationFn: ({ order_id, idempotency_key, ...body }) =>
            apiMutate<RefundEnvelope>("POST", `orders/${order_id}/refunds`, {
                locale,
                body,
                idempotencyKey: idempotency_key,
            }),
        onSettled: (_data, _error, { order_id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", order_id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "refunds", order_id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "summary"] });
        },
    });
}
