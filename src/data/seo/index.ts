import type {
  AgentItem,
  ApprovalItem,
  AutomationItem,
  AuditEvent,
  CompetitorItem,
  ContentOpportunity,
  CrawlResult,
  EngineStatus,
  ImageItem,
  IndexationItem,
  IssueItem,
  KeywordItem,
  OpportunityItem,
  PermissionItem,
  ProductItem,
  RankingItem,
  RecommendationItem,
  ReportItem,
  SchemaIssue,
  SeoScore,
  SerpFeatureItem,
  StoreHealth,
  TrendItem,
} from "@/src/types/seo";

export const storeHealthData: StoreHealth[] = [
  { id: "1", name: "سئو کل", score: 88, status: "success", detail: "در سه هفته اخیر روند صعودی" },
  { id: "2", name: "کیفیت محتوا", score: 74, status: "warning", detail: "۲۶ صفحه نیاز به به‌روزرسانی" },
  { id: "3", name: "اسکیما", score: 69, status: "warning", detail: "۴۰٪ محصولات فاقد FAQ" },
  { id: "4", name: "crawl", score: 92, status: "success", detail: "کسب‌وکار در محدوده سلامت" },
];

export const seoScoreData: SeoScore[] = [
  { id: "1", title: "امتیاز کلی", value: 84, target: 90, change: 6, status: "success" },
  { id: "2", title: "فروش ارگانیک", value: 72, target: 80, change: 8, status: "warning" },
  { id: "3", title: "CTR میانگین", value: 5.4, target: 6.2, change: 1.1, status: "warning" },
  { id: "4", title: "پوشش کلمات", value: 91, target: 95, change: 4, status: "success" },
];

export const productData: ProductItem[] = [
  { id: "P1", name: "سیستم آبیاری قطره‌ای", category: "ابزار باغبانی", score: 91, impressions: 12800, ctr: 1.8, position: 7.2, trend: 14, opportunity: "افزایش FAQ و متا" },
  { id: "P2", name: "دستگاه رطوبت‌سنج", category: "تجهیزات گلخانه", score: 86, impressions: 9600, ctr: 1.4, position: 8.9, trend: 9, opportunity: "بهبود اسکیما" },
  { id: "P3", name: "کود مایع ارگانیک", category: "کود و تغذیه", score: 79, impressions: 11200, ctr: 1.1, position: 11.3, trend: -3, opportunity: "به‌روزرسانی محتوا" },
  { id: "P4", name: "قفسه گلخانه‌ای", category: "پایه و قفسه", score: 93, impressions: 7800, ctr: 2.2, position: 5.6, trend: 18, opportunity: "تمرکز روی لینک داخلی" },
];

export const opportunityData: OpportunityItem[] = [
  { id: "O1", title: "بهبود عنوان صفحه", impact: "بالا", owner: "سئو محتوا", effort: "کم", score: 92 },
  { id: "O2", title: "افزودن FAQ", impact: "بالا", owner: "تولید محتوا", effort: "متوسط", score: 88 },
  { id: "O3", title: "رفع ALT تصاویر", impact: "متوسط", owner: "تیم دیجیتال", effort: "کم", score: 81 },
  { id: "O4", title: "بهینه‌سازی اسکیما", impact: "متوسط", owner: "تیم فنی", effort: "متوسط", score: 77 },
];

export const issueData: IssueItem[] = [
  { id: "I1", title: "۳ تصویر بدون ALT", severity: "warning", product: "سیستم آبیاری", detail: "در ۳ تصویر محصول، متن جایگزین موجود نیست", tag: "تصاویر" },
  { id: "I2", title: "مرتب‌سازی FAQ ناقص", severity: "critical", product: "دستگاه رطوبت‌سنج", detail: "FAQ در صفحه وجود دارد اما ساختار مناسب ندارد", tag: "محتوا" },
  { id: "I3", title: "پایش ایندکس ضعیف", severity: "warning", product: "کود مایع", detail: "تعداد crawl در هفته اخیر پایین است", tag: "crawl" },
];

export const keywordData: KeywordItem[] = [
  { id: "K1", keyword: "خرید سیستم آبیاری قطره‌ای", volume: 2600, position: 8.1, intent: "transactional", trend: 12, opportunity: "عنوان و متا" },
  { id: "K2", keyword: "قیمت دستگاه رطوبت‌سنج", volume: 1800, position: 11.7, intent: "informational", trend: 7, opportunity: "FAQ" },
  { id: "K3", keyword: "کود مایع ارگانیک", volume: 1100, position: 13.4, intent: "commercial", trend: -4, opportunity: "مقایسه" },
];

export const rankingData: RankingItem[] = [
  { id: "R1", keyword: "آبیاری قطره‌ای", current: 6, previous: 8, volume: 3200, trend: 12 },
  { id: "R2", keyword: "دستگاه رطوبت‌سنج", current: 10, previous: 9, volume: 1400, trend: 4 },
  { id: "R3", keyword: "گلخانه مدرن", current: 15, previous: 19, volume: 900, trend: -6 },
];

export const competitorData: CompetitorItem[] = [
  { id: "C1", name: "آرتا", keyword: "خرید سیستم آبیاری", share: 34, gap: "FAQ و جدول مقایسه", status: "warning" },
  { id: "C2", name: "چوبک", keyword: "دستگاه رطوبت‌سنج", share: 27, gap: "تصاویر ۳D", status: "danger" },
];

export const serpFeatureData: SerpFeatureItem[] = [
  { id: "S1", feature: "FAQ", visibility: 74, wins: 3, losses: 1 },
  { id: "S2", feature: "Review", visibility: 61, wins: 2, losses: 2 },
  { id: "S3", feature: "Local Pack", visibility: 39, wins: 1, losses: 3 },
];

export const crawlResults: CrawlResult[] = [
  { id: "CR1", url: "/products/irrigation-system", status: "200", ts: "۲۵ دقیقه پیش", issue: "بدون خطا" },
  { id: "CR2", url: "/products/moisture-meter", status: "404", ts: "۴۵ دقیقه پیش", issue: "صفحه redirect" },
  { id: "CR3", url: "/products/organic-fertilizer", status: "200", ts: "۱ ساعت پیش", issue: "متا ضعیف" },
];

export const indexationData: IndexationItem[] = [
  { id: "IX1", page: "/products/irrigation-system", status: "indexed", lastCrawl: "۲۴ ساعت پیش", notes: "در index" },
  { id: "IX2", page: "/products/moisture-meter", status: "pending", lastCrawl: "۳ روز پیش", notes: "نیاز به re-crawl" },
  { id: "IX3", page: "/products/organic-fertilizer", status: "excluded", lastCrawl: "۱ هفته پیش", notes: "noindex" },
];

export const schemaData: SchemaIssue[] = [
  { id: "SC1", type: "Product", status: "warning", detail: "Offer و Review ناقص", suggestion: "افزودن Review و Offer" },
  { id: "SC2", type: "FAQ", status: "success", detail: "ساختار FAQ شناسایی شده", suggestion: "حفظ و تکمیل" },
  { id: "SC3", type: "Breadcrumb", status: "danger", detail: "بخش breadcrumb به‌طور کامل تعریف نشده", suggestion: "تکمیل breadcrumb" },
];

export const imageData: ImageItem[] = [
  { id: "IM1", name: "product-1.jpg", altStatus: "missing", size: "1.2MB", usage: "صفحه اصلی محصول" },
  { id: "IM2", name: "product-2.webp", altStatus: "good", size: "780KB", usage: "گالری" },
  { id: "IM3", name: "product-3.png", altStatus: "needs-review", size: "2.1MB", usage: "کارت محصول" },
];

export const contentOpportunityData: ContentOpportunity[] = [
  { id: "CO1", title: "بخش مزایا و کاربرد", source: "محتوای محصول", impact: "بالا", effort: "کم" },
  { id: "CO2", title: "پیشنهاد مقایسه با روش سنتی", source: "محتوای مقاله", impact: "متوسط", effort: "متوسط" },
];

export const trendData: TrendItem[] = [
  { id: "T1", title: "افزایش جست‌وجوی «آبیاری قطره‌ای»", source: "Google Trends", signal: "+18%" },
  { id: "T2", title: "رشد FAQ در SERP", source: "SERP Monitoring", signal: "+12%" },
];

export const recommendationData: RecommendationItem[] = [
  { id: "R1", title: "عنوان جدید AI", summary: "ترکیب کلمه هدف با مزیت فروش", impact: "بالا", effort: "کم", status: "success" },
  { id: "R2", title: "بخش FAQ", summary: "پرسش‌های پرتکرار و پاسخ‌های کوتاه", impact: "بالا", effort: "کم", status: "warning" },
  { id: "R3", title: "ریداایرکت", summary: "تغییر URL قدیمی به مسیر جدید", impact: "متوسط", effort: "متوسط", status: "danger" },
];

export const agentData: AgentItem[] = [
  { id: "A1", name: "AI Title Agent", role: "پیشنهاد عنوان", status: "success", coverage: "۳۲ محصول" },
  { id: "A2", name: "FAQ Agent", role: "پیشنهاد پرسش", status: "warning", coverage: "۱۴ محصول" },
  { id: "A3", name: "Schema Agent", role: "تکمیل اسکیما", status: "success", coverage: "۲۱ محصول" },
];

export const engineStatusData: EngineStatus[] = [
  { id: "E1", name: "Crawler", status: "success", latency: "۱.۲s", lastRun: "۲ دقیقه پیش" },
  { id: "E2", name: "GSC", status: "warning", latency: "۲.۴s", lastRun: "۵ دقیقه پیش" },
  { id: "E3", name: "GA4", status: "success", latency: "۱.۱s", lastRun: "۱ دقیقه پیش" },
];

export const approvalData: ApprovalItem[] = [
  { id: "AP1", product: "سیستم آبیاری", action: "تغییر عنوان و متا", risk: "کم", owner: "مدیر سئو", eta: "۱۰ دقیقه" },
  { id: "AP2", product: "کود مایع", action: "افزودن FAQ", risk: "متوسط", owner: "مدیر سئو", eta: "۲۵ دقیقه" },
];

export const auditEvents: AuditEvent[] = [
  { id: "AU1", action: "تغییر عنوان برای ۳ محصول", actor: "سارا", time: "۱۰ دقیقه پیش", status: "success" },
  { id: "AU2", action: "رد پیشنهاد FAQ", actor: "رضا", time: "۲۵ دقیقه پیش", status: "warning" },
];

export const reportData: ReportItem[] = [
  { id: "RPT1", name: "گزارش هفتگی", description: "تحلیل رشد ارگانیک", updatedAt: "۲ ساعت پیش", format: "PDF" },
  { id: "RPT2", name: "گزارش فروش", description: "مقایسه رشد و بازگشت", updatedAt: "امروز", format: "CSV" },
];

export const permissionData: PermissionItem[] = [
  { id: "PMS1", role: "مدیر سئو", scope: "همه ماژول‌ها", access: "کامل" },
  { id: "PMS2", role: "نویسنده محتوا", scope: "تولید و پیشنهاد", access: "محدود" },
];

export const automationData: AutomationItem[] = [
  { id: "AUT1", title: "اسکن هفتگی", schedule: "هر شنبه", status: "success", nextRun: "۲۴ ساعت دیگر" },
  { id: "AUT2", title: "ارسال گزارش", schedule: "هر روز", status: "warning", nextRun: "۶ ساعت دیگر" },
];
