export type QualityRecord = Record<string, any>;
export interface PageMeta {
    page: number;
    limit: number;
    total: number;
}
export interface QualityCase extends QualityRecord {
    id: number;
    reference: string;
    status: string;
    severity: string;
    title: string;
    case_type: string;
    version: number;
    updated_at: string;
}
export interface QualityOverview {
    data: {
        open_cases: number;
        critical_cases: number;
        open_signals: number;
        overdue_actions: number;
        return_items: number;
        inspection_coverage: number | null;
    };
}
export interface QualityCaseDetail extends QualityCase {
    sources: QualityRecord[];
    evidence: QualityRecord[];
    findings: QualityRecord[];
    actions: QualityRecord[];
    outcomes: QualityRecord[];
}
