import {
  ChartPie,
  FolderTree,
  Layers3,
  Link2,
  ListTree,
  PackageCheck,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import type {
  CategoryKpi,
  KeywordMatrixRow,
  LinkOpportunity,
  LinkingAgent,
  LinkingRule,
  SmartRecommendation,
  TaxonomyHealthCard,
} from "@/src/types/categories-links";

export const categoryTabs = [
  { id: "overview", label: "نمای کلی" },
  { id: "categories", label: "دسته‌بندی‌ها" },
  { id: "brands", label: "برندها" },
  { id: "tags", label: "برچسب‌ها" },
  { id: "variants", label: "تنوع‌ها (واریانت)" },
  { id: "attributes", label: "ویژگی‌ها / صفات" },
  { id: "related", label: "محصولات مرتبط" },
  { id: "matrix", label: "ماتریس کلمات کلیدی" },
  { id: "links", label: "لینک‌سازی داخلی" },
  { id: "rules", label: "قوانین لینک‌سازی" },
] as const;

export const categoryKpis: CategoryKpi[] = [
  {
    id: "features",
    title: "ویژگی‌ها",
    value: "۱٬۲۴۸",
    unit: "ویژگی",
    trend: "+۱۴٪",
    tone: "violet",
    icon: ListTree,
    gauge: 76,
  },
  {
    id: "brands",
    title: "برندها",
    value: "۱۵۶",
    unit: "برند",
    trend: "+۷٪",
    tone: "violet",
    icon: Tag,
    gauge: 72,
  },
  {
    id: "related",
    title: "محصولات مرتبط",
    value: "۸٬۴۳۲",
    unit: "محصول",
    trend: "+۱۲٪",
    tone: "violet",
    icon: PackageCheck,
    gauge: 68,
  },
  {
    id: "links",
    title: "فرصت‌های لینک داخلی",
    value: "۳۱۲",
    unit: "فرصت",
    trend: "+۱۸٪",
    tone: "green",
    icon: Link2,
    gauge: 78,
  },
  {
    id: "semantic",
    title: "پوشش معنایی",
    value: "۷۶٪",
    unit: "",
    trend: "+۱۱٪",
    status: "متوسط",
    tone: "orange",
    icon: ChartPie,
    gauge: 76,
  },
  {
    id: "health",
    title: "سلامت طبقه‌بندی",
    value: "۸۲٪",
    unit: "",
    trend: "+۹٪",
    status: "خوب",
    tone: "green",
    icon: ShieldCheck,
    gauge: 82,
  },
];

const allHealthy = [
  { label: "عنوان", status: "success" as const },
  { label: "توضیحات", status: "success" as const },
  { label: "تصویر شاخص", status: "success" as const },
  { label: "تصویر ALT", status: "success" as const },
  { label: "Canonical", status: "success" as const },
  { label: "لینک داخلی", status: "success" as const },
  { label: "تطابق کلمه کلیدی", status: "success" as const },
];

export const taxonomyHealthCards: TaxonomyHealthCard[] = [
  {
    id: "related",
    title: "محصولات مرتبط",
    count: "۸٬۴۳۲ مورد",
    score: 78,
    tone: "orange",
    icon: Link2,
    checks: allHealthy.map((item, index) => ({ ...item, status: index >= 5 ? "warning" : item.status })),
  },
  {
    id: "attributes",
    title: "ویژگی‌ها / صفات",
    count: "۱٬۲۴۸ مورد",
    score: 84,
    tone: "green",
    icon: SlidersHorizontal,
    checks: allHealthy.map((item, index) => ({ ...item, status: index === 6 ? "warning" : item.status })),
  },
  {
    id: "variants",
    title: "تنوع‌ها (واریانت)",
    count: "۴٬۱۲۸ مورد",
    score: 75,
    tone: "orange",
    icon: Layers3,
    checks: allHealthy.map((item, index) => ({ ...item, status: index === 5 ? "warning" : index === 6 ? "danger" : item.status })),
  },
  {
    id: "tags",
    title: "برچسب‌ها",
    count: "۳۱۲ برچسب",
    score: 72,
    tone: "orange",
    icon: Tag,
    checks: allHealthy.map((item, index) => ({ ...item, status: index === 4 ? "warning" : index === 5 ? "warning" : index === 6 ? "danger" : item.status })),
  },
  {
    id: "brands",
    title: "برندها",
    count: "۱۵۶ برند",
    score: 88,
    tone: "green",
    icon: Tag,
    checks: allHealthy,
  },
  {
    id: "categories",
    title: "دسته‌بندی‌ها",
    count: "۴۸ دسته",
    score: 85,
    tone: "green",
    icon: FolderTree,
    checks: allHealthy.map((item, index) => ({ ...item, status: index === 3 || index === 6 ? "warning" : item.status })),
  },
];

export const linkOpportunities: LinkOpportunity[] = [
  {
    id: "link-1",
    source: "راهنمای خرید لپ‌تاپ گیمینگ",
    target: "لپ‌تاپ گیمینگ ایسوس",
    anchor: "لپ‌تاپ گیمینگ ایسوس",
    impact: "بالا",
    priority: "خیلی زیاد",
    recommendation: "کاربر در حال تحقیق است و این لینک به محصول مناسب کمک می‌کند.",
  },
  {
    id: "link-2",
    source: "بهترین لپ‌تاپ‌های دانشجویی",
    target: "لپ‌تاپ دانشجویی اقتصادی",
    anchor: "لپ‌تاپ دانشجویی اقتصادی",
    impact: "متوسط",
    priority: "زیاد",
    recommendation: "این موضوع برای نیّت مقاله و محصول موجود وجود دارد.",
  },
  {
    id: "link-3",
    source: "لپ‌تاپ ۱۵ اینچ چه مدلی بخریم؟",
    target: "لپ‌تاپ ۱۵ اینچ ایسوس",
    anchor: "لپ‌تاپ ۱۵ اینچ ایسوس",
    impact: "بالا",
    priority: "خیلی زیاد",
    recommendation: "جستجوی کاربران قصد خرید دارد؛ لینک داخلی را تقویت کنید.",
  },
  {
    id: "link-4",
    source: "مقایسه مک‌بوک با ویندوز",
    target: "مک‌بوک پرو M3",
    anchor: "مک‌بوک پرو M3",
    impact: "متوسط",
    priority: "متوسط",
    recommendation: "کاربر به دنبال گزینه جایگزین مناسب است.",
  },
  {
    id: "link-5",
    source: "راهنمای افزایش عمر باتری",
    target: "باتری لپ‌تاپ لنوو",
    anchor: "باتری لپ‌تاپ لنوو",
    impact: "متوسط",
    priority: "متوسط",
    recommendation: "لینک مکمل برای تکمیل نیاز کاربر و افزایش مدت حضور.",
  },
];

export const matrixKeywords = ["لپ‌تاپ گیمینگ", "لپ‌تاپ ایسوس", "لپ‌تاپ دانشجویی", "لپ‌تاپ ۱۵ اینچ"];

export const keywordMatrixRows: KeywordMatrixRow[] = [
  { id: "m1", category: "لپ‌تاپ", matches: ["strong", "strong", "medium", "none"] },
  { id: "m2", category: "لپ‌تاپ ایسوس", matches: ["strong", "medium", "none", "medium"] },
  { id: "m3", category: "لپ‌تاپ گیمینگ", matches: ["strong", "strong", "medium", "none"] },
  { id: "m4", category: "لپ‌تاپ دانشجویی", matches: ["strong", "medium", "medium", "none"] },
  { id: "m5", category: "لپ‌تاپ ۱۵ اینچ", matches: ["medium", "medium", "none", "weak"] },
  { id: "m6", category: "لپ‌تاپ اپل", matches: ["none", "medium", "medium", "weak"] },
];

export const smartRecommendations: SmartRecommendation[] = [
  { id: "rec-1", text: "پوشش معنایی دسته لپ‌تاپ گیمینگ نیاز به تقویت دارد." },
  { id: "rec-2", text: "۱۲ فرصت لینک داخلی با تأثیر بالا شناسایی شد." },
  { id: "rec-3", text: "۳۲ دسته‌بندی دارای توضیحات ناکافی هستند." },
  { id: "rec-4", text: "لینک‌دهی داخلی دسته‌ها به محصولات برتر بهینه است." },
];

export const linkingAgents: LinkingAgent[] = [
  {
    id: "agent-1",
    name: "SEO Strategist",
    description: "در حال تحلیل پوشش معنایی و تقویت معماری اطلاعات",
  },
  {
    id: "agent-2",
    name: "Internal Linking Agent",
    description: "در حال شناسایی فرصت‌های لینک داخلی و پیشنهاد انکرتکست",
  },
];

export const initialLinkingRules: LinkingRule[] = [
  { id: "rule-1", label: "اتصال خودکار از مقالات به محصولات مرتبط بر اساس شباهت معنایی", enabled: true },
  { id: "rule-2", label: "اتصال خودکار از دسته‌بندی‌ها به برندها و محصولات برتر", enabled: true },
  { id: "rule-3", label: "اتصال خودکار از محصولات به محصولات مکمل و مرتبط", enabled: true },
  { id: "rule-4", label: "استفاده از انکرتکست متنوع و طبیعی (بر اساس هوش مصنوعی)", enabled: true },
  { id: "rule-5", label: "عدم ایجاد لینک به صفحات ناتوان یا کم‌ارزش", enabled: true },
  { id: "rule-6", label: "حداکثر ۳ لینک داخلی در هر ۳۰۰ کلمه از محتوا", enabled: true },
];
