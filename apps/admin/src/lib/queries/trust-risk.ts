import { apiFetch } from "#/lib/api";

export type TrustOverview = {
    data: {
        kpis: { open_cases: number; signals_24h: number; evaluated_30d: number; challenged_30d: number; blocked_30d: number };
        bands: Record<string, number>;
        decisions: Record<string, number>;
        recent_scores: Array<{ id: number; subject_type: string; subject_id: string; score: number; band: string; reason_codes_json: string[]; evaluated_at: string }>;
        recent_cases: Array<{ id: number; case_number: string; subject_type: string; subject_id: string; status: string; priority: string; summary: string | null; opened_at: string; assignee_user_id: number | null }>;
    };
};

export function getTrustOverview() { return apiFetch<TrustOverview>("/api/v1/admin/trust/overview"); }
export function getTrustSignals() { return apiFetch<{ data: Array<any> }>("/api/v1/admin/trust/signals"); }
export function getTrustModels() { return apiFetch<{ data: Array<any> }>("/api/v1/admin/trust/models"); }
