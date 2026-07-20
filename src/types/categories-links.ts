import type { LucideIcon } from "lucide-react";

export type CategoryTone = "violet" | "green" | "orange" | "red" | "slate";
export type HealthStatus = "success" | "warning" | "danger";
export type MatchStatus = "strong" | "medium" | "weak" | "none";

export interface CategoryKpi {
  id: string;
  title: string;
  value: string;
  unit: string;
  trend: string;
  status?: string;
  tone: CategoryTone;
  icon: LucideIcon;
  gauge: number;
}

export interface HealthCheck {
  label: string;
  status: HealthStatus;
}

export interface TaxonomyHealthCard {
  id: string;
  title: string;
  count: string;
  score: number;
  tone: CategoryTone;
  icon: LucideIcon;
  checks: HealthCheck[];
}

export interface LinkOpportunity {
  id: string;
  source: string;
  target: string;
  anchor: string;
  impact: "بالا" | "متوسط";
  priority: "خیلی زیاد" | "زیاد" | "متوسط";
  recommendation: string;
}

export interface KeywordMatrixRow {
  id: string;
  category: string;
  matches: MatchStatus[];
}

export interface SmartRecommendation {
  id: string;
  text: string;
}

export interface LinkingAgent {
  id: string;
  name: string;
  description: string;
}

export interface LinkingRule {
  id: string;
  label: string;
  enabled: boolean;
}
