import "server-only";

import { apiServer } from "#/lib/api";

export type TrustOverview = {
    data: {
        kpis: {
            open_cases: number;
            signals_24h: number;
            evaluated_30d: number;
            challenged_30d: number;
            blocked_30d: number;
        };
        bands: Record<string, number>;
        decisions: Record<string, number>;
        recent_scores: Array<{
            id: number;
            subject_type: string;
            subject_id: string;
            score: number;
            band: string;
            reason_codes_json: string[];
            evaluated_at: string;
        }>;
        recent_cases: Array<{
            id: number;
            case_number: string;
            subject_type: string;
            subject_id: string;
            status: string;
            priority: string;
            summary: string | null;
            opened_at: string;
            assignee_user_id: number | null;
        }>;
    };
};

export async function getTrustOverview() {
    const api = await apiServer();
    return api.http.get<TrustOverview>("/admin/trust/overview");
}

export async function getTrustSignals() {
    const api = await apiServer();
    return api.http.get<{ data: Array<any> }>("/admin/trust/signals");
}

export async function getTrustModels() {
    const api = await apiServer();
    return api.http.get<{ data: Array<any> }>("/admin/trust/models");
}
