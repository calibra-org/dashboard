import { apiFetch } from "#/lib/api";
export type ProcurementOverview={data:{kpis:{active_suppliers:number;open_purchase_orders:number;open_commitment_minor:number;open_incidents:number;average_supplier_score:number};suppliers:Array<any>;purchase_orders:Array<any>}};
export async function getProcurementOverview(){return apiFetch<ProcurementOverview>("/api/v1/admin/procurement/overview")}
export async function getProcurementRecommendations(){return apiFetch<{data:Array<any>}>("/api/v1/admin/procurement/recommendations")}
