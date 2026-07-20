export type OverviewTone = "violet" | "green" | "orange" | "red" | "slate";

export interface OverviewKpi {
  id: string;
  title: string;
  value: string;
  trend?: string;
  trendDirection?: "up" | "down";
  detail: string;
  tone: OverviewTone;
  icon: "health" | "warning" | "growth" | "decline" | "error" | "complete";
  score?: number;
  status?: string;
}

export interface OverviewQueueItem {
  label: string;
  count: number;
}

export interface OverviewQueue {
  id: string;
  title: string;
  count: number;
  tone: Exclude<OverviewTone, "slate">;
  items: OverviewQueueItem[];
}

export type PriorityStatus = "waiting" | "approved" | "review";
export type SchemaStatus = "valid" | "warning" | "invalid";

export interface PriorityEntity {
  id: string;
  name: string;
  type: "محصول" | "دسته‌بندی" | "برند";
  score: number;
  ctr: number;
  images: string;
  imageStatus: "good" | "warning" | "bad";
  schema: SchemaStatus;
  status: PriorityStatus;
  agent: string;
  thumbnail: "headphone" | "mobile" | "brand" | "earbuds" | "laptop";
}

export interface CrawlMetric {
  id: string;
  label: string;
  value: string;
  trend: string;
  trendDirection: "up" | "down";
  tone: OverviewTone;
}

export interface SerpBar {
  id: string;
  label: string;
  value: number;
  displayValue: string;
}

export interface OverviewAgent {
  id: string;
  name: string;
  icon: "search" | "audit" | "content" | "image" | "schema" | "link" | "competitor";
}

export interface ArchitectureLayer {
  id: string;
  title: string;
  description: string;
  tone: OverviewTone;
  icon: "database" | "rules" | "idea" | "execute";
}

export interface SystemEngine {
  id: string;
  name: string;
  description?: string;
  icon: "crawl" | "competitor" | "google" | "rules" | "agents" | "image" | "content";
}
