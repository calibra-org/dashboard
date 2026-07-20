export type StatusTone = "success" | "warning" | "danger" | "neutral";

export interface StoreHealth {
  id: string;
  name: string;
  score: number;
  status: StatusTone;
  detail: string;
}

export interface SeoScore {
  id: string;
  title: string;
  value: number;
  target: number;
  change: number;
  status: StatusTone;
}

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  score: number;
  impressions: number;
  ctr: number;
  position: number;
  trend: number;
  opportunity: string;
}

export interface OpportunityItem {
  id: string;
  title: string;
  impact: string;
  owner: string;
  effort: string;
  score: number;
}

export interface IssueItem {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  product: string;
  detail: string;
  tag: string;
}

export interface KeywordItem {
  id: string;
  keyword: string;
  volume: number;
  position: number;
  intent: string;
  trend: number;
  opportunity: string;
}

export interface RankingItem {
  id: string;
  keyword: string;
  current: number;
  previous: number;
  volume: number;
  trend: number;
}

export interface CompetitorItem {
  id: string;
  name: string;
  keyword: string;
  share: number;
  gap: string;
  status: StatusTone;
}

export interface SerpFeatureItem {
  id: string;
  feature: string;
  visibility: number;
  wins: number;
  losses: number;
}

export interface CrawlResult {
  id: string;
  url: string;
  status: string;
  ts: string;
  issue: string;
}

export interface IndexationItem {
  id: string;
  page: string;
  status: "indexed" | "pending" | "excluded";
  lastCrawl: string;
  notes: string;
}

export interface SchemaIssue {
  id: string;
  type: string;
  status: StatusTone;
  detail: string;
  suggestion: string;
}

export interface ImageItem {
  id: string;
  name: string;
  altStatus: "good" | "missing" | "needs-review";
  size: string;
  usage: string;
}

export interface ContentOpportunity {
  id: string;
  title: string;
  source: string;
  impact: string;
  effort: string;
}

export interface TrendItem {
  id: string;
  title: string;
  source: string;
  signal: string;
}

export interface RecommendationItem {
  id: string;
  title: string;
  summary: string;
  impact: string;
  effort: string;
  status: StatusTone;
}

export interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: StatusTone;
  coverage: string;
}

export interface EngineStatus {
  id: string;
  name: string;
  status: StatusTone;
  latency: string;
  lastRun: string;
}

export interface ApprovalItem {
  id: string;
  product: string;
  action: string;
  risk: "کم" | "متوسط" | "بالا";
  owner: string;
  eta: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  time: string;
  status: StatusTone;
}

export interface ReportItem {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  format: string;
}

export interface PermissionItem {
  id: string;
  role: string;
  scope: string;
  access: string;
}

export interface AutomationItem {
  id: string;
  title: string;
  schedule: string;
  status: StatusTone;
  nextRun: string;
}

export interface OverviewMetric {
  id: string;
  label: string;
  value: string;
  change: string;
  detail: string;
  tone: StatusTone;
}

export interface OverviewTrendPoint {
  label: string;
  value: number;
  target: number;
}

export interface OverviewSignal {
  id: string;
  title: string;
  detail: string;
  owner: string;
  store: string;
  score: number;
  status: StatusTone;
  impact: string;
}

export interface OverviewAlertItem {
  id: string;
  title: string;
  detail: string;
  level: "critical" | "warning" | "info";
  action: string;
}

export interface OverviewWatchItem {
  id: string;
  title: string;
  owner: string;
  impact: string;
  score: number;
  status: StatusTone;
  eta: string;
}
