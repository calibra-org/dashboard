import "server-only";

import { apiServer } from "#/lib/api";

export type ProcurementOverview = {
    data: {
        kpis: {
            active_suppliers: number;
            open_purchase_orders: number;
            open_commitment_minor: number;
            open_incidents: number;
            average_supplier_score: number;
        };
        suppliers: Array<any>;
        purchase_orders: Array<any>;
    };
};

export async function getProcurementOverview() {
    const api = await apiServer();
    return api.http.get<ProcurementOverview>("/admin/procurement/overview");
}

export async function getProcurementRecommendations() {
    const api = await apiServer();
    return api.http.get<{ data: Array<any> }>("/admin/procurement/recommendations");
}
