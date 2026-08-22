"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";

import { useTicketRealtime } from "#/features/tickets/realtime";
import {
    BadgePercent,
    BarChart3,
    Bot,
    Box,
    Boxes,
    Bug,
    CalendarClock,
    ChartNoAxesCombined,
    ChevronDown,
    ContactRound,
    FileChartColumnIncreasing,
    FileText,
    FolderTree,
    ImageIcon,
    Landmark,
    LayoutDashboard,
    Library,
    Link2,
    ListTree,
    MessageSquare,
    Newspaper,
    Package,
    PenLine,
    ReceiptText,
    Ribbon,
    Search,
    Settings,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Star,
    Tags as TagsIcon,
    TrendingUp,
    Users,
    Wallet,
    WandSparkles,
} from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface NavItem {
    href: string;
    labelKey?: string;
    label?: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavGroup {
    titleKey: "overview" | "catalog" | "sales" | "analytics" | "finance" | "customersSection" | "configuration";
    items: NavItem[];
}

const groups: NavGroup[] = [
    { titleKey: "overview", items: [{ href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard }] },
    {
        titleKey: "catalog",
        items: [
            { href: "/products", labelKey: "products", icon: Package },
            { href: "/products/amazing-deals", labelKey: "amazingDeals", icon: BadgePercent },
            { href: "/products/categories", labelKey: "categories", icon: ListTree },
            { href: "/products/tags", labelKey: "tags", icon: TagsIcon },
            { href: "/products/brands", labelKey: "brands", icon: Ribbon },
            { href: "/products/attributes", labelKey: "attributes", icon: Sparkles },
            { href: "/products/reviews", labelKey: "reviews", icon: Star },
            { href: "/media", labelKey: "media", icon: ImageIcon },
        ],
    },
    {
        titleKey: "sales",
        items: [
            { href: "/orders", labelKey: "orders", icon: ReceiptText },
            { href: "/transactions", labelKey: "transactions", icon: Landmark },
            { href: "/coupons", labelKey: "coupons", icon: BadgePercent },
        ],
    },
    {
        titleKey: "analytics",
        items: [
            { href: "/analytics", labelKey: "analyticsOverview", icon: BarChart3 },
            { href: "/analytics/revenue", labelKey: "analyticsRevenue", icon: TrendingUp },
            { href: "/analytics/orders", labelKey: "analyticsOrders", icon: ReceiptText },
            { href: "/analytics/products", labelKey: "analyticsProducts", icon: Package },
            { href: "/analytics/categories", labelKey: "analyticsCategories", icon: ListTree },
            { href: "/analytics/coupons", labelKey: "analyticsCoupons", icon: BadgePercent },
            { href: "/analytics/taxes", labelKey: "analyticsTaxes", icon: Wallet },
            { href: "/analytics/stock", labelKey: "analyticsStock", icon: Boxes },
            { href: "/analytics/decision-intelligence", label: "هوش تصمیم‌گیری", icon: Sparkles },
            { href: "/experiments", label: "آزمایشگاه آزمایش‌ها", icon: Sparkles },
            { href: "/planning", label: "Planning OS", icon: CalendarClock },
        ],
    },
    {
        titleKey: "finance",
        items: [
            { href: "/economics", labelKey: "economics", icon: Wallet },
            { href: "/pricing-brain", label: "مغز قیمت‌گذاری", icon: Sparkles },
        ],
    },
    { titleKey: "customersSection", items: [{ href: "/customers", labelKey: "customers", icon: Users }] },
    {
        titleKey: "configuration",
        items: [
            { href: "/settings/general", labelKey: "settings", icon: Settings },
            { href: "/governance/overview", label: "Governance OS", icon: ShieldCheck },
            { href: "/reports", labelKey: "reports", icon: BarChart3 },
        ],
    },
];

const factorItems: NavItem[] = [
    { href: "/factor/documents", labelKey: "factorDocuments", icon: FileText },
    { href: "/factor/payments", labelKey: "factorPayments", icon: Landmark },
    { href: "/factor/reports", labelKey: "factorReports", icon: FileChartColumnIncreasing },
    { href: "/factor/records", labelKey: "factorRecords", icon: ContactRound },
    { href: "/factor/settings", labelKey: "factorSettings", icon: SlidersHorizontal },
];

const contentItems: NavItem[] = [
    { href: "/content/posts", labelKey: "contentPosts", icon: FileText },
    { href: "/content/market-radar", labelKey: "contentMarketRadar", icon: Newspaper },
    { href: "/content/agents", labelKey: "contentAgents", icon: Bot },
    { href: "/content/studio", labelKey: "contentStudio", icon: WandSparkles },
    { href: "/content/calendar", labelKey: "contentCalendar", icon: CalendarClock },
    { href: "/content/media", labelKey: "contentMedia", icon: Library },
    { href: "/content/taxonomy", labelKey: "contentTaxonomy", icon: FolderTree },
    { href: "/content/reports", labelKey: "contentReports", icon: ChartNoAxesCombined },
    { href: "/content/settings", labelKey: "contentSettings", icon: Settings2 },
];

const seoItems: NavItem[] = [
    { href: "/seo/overview", labelKey: "seoOverview", icon: BarChart3 },
    { href: "/seo/control-tower", labelKey: "seoControlTower", icon: Sparkles },
    { href: "/seo/products", labelKey: "seoProducts", icon: Package },
    { href: "/seo/categories-links", labelKey: "seoCategoriesLinks", icon: Link2 },
    { href: "/seo/images-alt", labelKey: "seoImagesAlt", icon: ImageIcon },
    { href: "/seo/schema-preview", labelKey: "seoSchemaPreview", icon: FileText },
    { href: "/seo/keywords-content", labelKey: "seoKeywordsContent", icon: TagsIcon },
    { href: "/seo/content-refresh", labelKey: "seoContentRefresh", icon: Newspaper },
    { href: "/seo/live-editor", labelKey: "seoLiveEditor", icon: PenLine },
    { href: "/seo/market-radar", labelKey: "seoMarketRadar", icon: TrendingUp },
    { href: "/seo/technical-health", labelKey: "seoTechnicalHealth", icon: ShieldCheck },
    { href: "/seo/crawl-monitoring", labelKey: "seoCrawlMonitoring", icon: Bug },
    { href: "/seo/rank-tracking", labelKey: "seoRankTracking", icon: TrendingUp },
    { href: "/seo/competitors-serp", labelKey: "seoCompetitorsSerp", icon: Users },
    { href: "/seo/reports", labelKey: "seoReports", icon: ChartNoAxesCombined },
    { href: "/seo/settings", labelKey: "seoSettings", icon: Settings2 },
];

const discoveryItems: NavItem[] = [
    { href: "/discovery/overview", labelKey: "discoveryOverview", icon: BarChart3 },
    { href: "/discovery/queries", labelKey: "discoveryQueries", icon: Search },
    { href: "/discovery/zero-results", labelKey: "discoveryZeroResults", icon: Bug },
    { href: "/discovery/merchandising", labelKey: "discoveryMerchandising", icon: SlidersHorizontal },
    { href: "/discovery/compatibility", labelKey: "discoveryCompatibility", icon: Link2 },
    { href: "/discovery/opportunities", labelKey: "discoveryOpportunities", icon: TrendingUp },
    { href: "/discovery/simulator", labelKey: "discoverySimulator", icon: Sparkles },
    { href: "/discovery/governance", labelKey: "discoveryGovernance", icon: Settings2 },
];

const ticketItems: NavItem[] = [
    { href: "/tickets/overview", labelKey: "ticketOverview", icon: LayoutDashboard },
    { href: "/tickets/create", labelKey: "ticketCreate", icon: PenLine },
    { href: "/tickets/inbox", labelKey: "ticketInbox", icon: MessageSquare },
    { href: "/tickets/internal", labelKey: "ticketInternal", icon: Users },
    { href: "/tickets/channels", labelKey: "ticketChannels", icon: Settings2 },
    { href: "/tickets/campaigns", labelKey: "ticketCampaigns", icon: Sparkles },
    { href: "/tickets/reports", labelKey: "ticketReports", icon: ChartNoAxesCombined },
    { href: "/tickets/settings", labelKey: "ticketSettings", icon: SlidersHorizontal },
];

const trustItems: NavItem[] = [
    { href: "/quality-trust/overview", labelKey: "trustOverview", icon: LayoutDashboard },
    { href: "/quality-trust/cases", labelKey: "trustCases", icon: ShieldCheck },
    { href: "/quality-trust/graph", labelKey: "trustGraph", icon: Link2 },
    { href: "/quality-trust/policies", labelKey: "trustPolicies", icon: SlidersHorizontal },
    { href: "/quality-trust/signals", labelKey: "trustSignals", icon: Bug },
    { href: "/quality-trust/models", labelKey: "trustModels", icon: ChartNoAxesCombined },
    { href: "/quality/overview", labelKey: "qualityVoc", icon: Package },
];

const agenticItems: NavItem[] = [
    { href: "/agentic-commerce/overview", labelKey: "agenticOverview", icon: LayoutDashboard },
    { href: "/agentic-commerce/channels", labelKey: "agenticChannels", icon: Link2 },
    { href: "/agentic-commerce/readiness", labelKey: "agenticReadiness", icon: ChartNoAxesCombined },
    { href: "/agentic-commerce/conformance", labelKey: "agenticConformance", icon: ShieldCheck },
    { href: "/agentic-commerce/orchestrator/overview", labelKey: "agentOrchestration", icon: Bot },
];

const identityItems: NavItem[] = [
    { href: "/identity/overview", label: "نمای کلی", icon: LayoutDashboard },
    { href: "/identity/verifications", label: "تراکنش‌های تأیید", icon: FileText },
    { href: "/identity/methods", label: "روش‌های تأیید", icon: ShieldCheck },
    { href: "/identity/policies", label: "سیاست‌های هویت", icon: SlidersHorizontal },
    { href: "/identity/providers", label: "ارائه‌دهندگان و مسیریابی", icon: Landmark },
    { href: "/identity/delivery", label: "سلامت ارسال", icon: TrendingUp },
    { href: "/identity/risk", label: "ریسک و سوءاستفاده", icon: Bug },
    { href: "/identity/credentials", label: "Passkey و اعتبارنامه‌ها", icon: ShieldCheck },
    { href: "/identity/sessions", label: "نشست‌ها و دستگاه‌ها", icon: Users },
    { href: "/identity/step-up", label: "احراز هویت تکمیلی", icon: ShieldCheck },
    { href: "/identity/audit", label: "رویدادها و ممیزی", icon: FileChartColumnIncreasing },
    { href: "/identity/analytics", label: "گزارش‌ها و تحلیل", icon: ChartNoAxesCombined },
    { href: "/identity/settings", label: "تنظیمات", icon: Settings2 },
    { href: "/identity/settings/sms", label: "تنظیمات پنل SMS", icon: MessageSquare },
];

function isActive(pathname: string, href: string): boolean {
    if (href === "/products") {
        if (pathname === "/products" || pathname === "/products/new") return true;
        return /^\/products\/\d+(?:\/|$)/.test(pathname);
    }
    if (href === "/settings/general") return pathname === "/settings" || pathname.startsWith("/settings/");
    if (href === "/analytics") return pathname === "/analytics";
    if (href === "/tickets/inbox")
        return pathname === href || pathname.startsWith(`${href}/`) || /^\/tickets\/\d+(?:\/|$)/.test(pathname);
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ userId }: { userId: number }) {
    const navT = useTranslations("Nav");
    const ticketsT = useTranslations("Tickets");
    const siteT = useTranslations("Site");
    const pathname = usePathname();
    const factorActive = pathname === "/factor" || pathname.startsWith("/factor/");
    const contentActive = pathname === "/content" || pathname.startsWith("/content/");
    const seoActive = pathname === "/seo" || pathname.startsWith("/seo/");
    const discoveryActive = pathname === "/discovery" || pathname.startsWith("/discovery/");
    const ticketActive = pathname === "/tickets" || pathname.startsWith("/tickets/");
    const trustActive =
        pathname === "/quality-trust" ||
        pathname.startsWith("/quality-trust/") ||
        pathname === "/quality" ||
        pathname.startsWith("/quality/");
    const agenticActive = pathname === "/agentic-commerce" || pathname.startsWith("/agentic-commerce/");
    const identityActive = pathname === "/identity" || pathname.startsWith("/identity/");
    const ticketUnread = useTicketRealtime(userId);
    const [factorOpen, setFactorOpen] = useState(factorActive);
    const [contentOpen, setContentOpen] = useState(contentActive);
    const [seoOpen, setSeoOpen] = useState(seoActive);
    const [discoveryOpen, setDiscoveryOpen] = useState(discoveryActive);
    const [ticketOpen, setTicketOpen] = useState(ticketActive);
    const [trustOpen, setTrustOpen] = useState(trustActive);
    const [agenticOpen, setAgenticOpen] = useState(agenticActive);
    const [identityOpen, setIdentityOpen] = useState(identityActive);

    useEffect(() => {
        if (factorActive) setFactorOpen(true);
    }, [factorActive]);
    useEffect(() => {
        if (contentActive) setContentOpen(true);
    }, [contentActive]);
    useEffect(() => {
        if (seoActive) setSeoOpen(true);
    }, [seoActive]);
    useEffect(() => {
        if (discoveryActive) setDiscoveryOpen(true);
    }, [discoveryActive]);

    useEffect(() => {
        if (ticketActive) setTicketOpen(true);
    }, [ticketActive]);
    useEffect(() => {
        if (trustActive) setTrustOpen(true);
    }, [trustActive]);
    useEffect(() => {
        if (agenticActive) setAgenticOpen(true);
    }, [agenticActive]);
    useEffect(() => {
        if (identityActive) setIdentityOpen(true);
    }, [identityActive]);

    const itemLink = (item: NavItem, compact = false) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
            <Link
                key={item.href}
                href={item.href as never}
                className={cn(
                    "flex items-center rounded-md transition-colors",
                    compact ? "gap-2.5 px-2.5 py-2 text-xs" : "gap-3 px-3 py-2",
                    active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
            >
                <Icon className={compact ? "size-3.5 shrink-0" : "size-4 shrink-0"} aria-hidden="true" />
                <span>{item.label ?? (item.labelKey ? navT(item.labelKey as Parameters<typeof navT>[0]) : item.href)}</span>
            </Link>
        );
    };

    const collapsible = (
        id: string,
        active: boolean,
        open: boolean,
        setOpen: (value: boolean) => void,
        icon: ComponentType<SVGProps<SVGSVGElement>>,
        title: string,
        items: NavItem[],
        sections?: Record<number, string>,
        badge = 0,
    ) => {
        const Icon = icon;
        return (
            <div className="mt-1">
                <button
                    type="button"
                    className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors",
                        active
                            ? "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={() => setOpen(!open)}
                >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{title}</span>
                    {badge > 0 ? (
                        <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center font-semibold text-[10px] text-primary-foreground tabular-nums">
                            <span className="sr-only">{ticketsT("unread", { count: badge })}</span>
                            <span aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
                        </span>
                    ) : null}
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
                </button>
                {open ? (
                    <div id={id} className="ms-5 mt-1 flex flex-col gap-0.5 border-sidebar-border border-s ps-2">
                        {items.map((item, index) => (
                            <div key={item.href}>
                                {sections?.[index] ? (
                                    <div className="px-2.5 pt-2 pb-1 font-medium text-[0.6rem] text-sidebar-foreground/40 uppercase tracking-wider">
                                        {sections[index]}
                                    </div>
                                ) : null}
                                {itemLink(item, true)}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <aside className="hidden w-64 shrink-0 flex-col gap-1 border-sidebar-border border-e bg-sidebar text-sidebar-foreground md:flex">
            <div className="flex h-14 items-center gap-2 border-sidebar-border border-b px-5">
                <div className="grid size-7 place-items-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground text-sm">
                    <Box className="size-4" aria-hidden="true" />
                </div>
                <span className="font-semibold text-sm tracking-tight">{siteT("name")}</span>
            </div>
            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 text-sm">
                {groups.slice(0, 3).map((group) => (
                    <div key={group.titleKey} className="flex flex-col gap-1">
                        <div className="px-3 pb-1 font-medium text-[0.65rem] text-sidebar-foreground/50 uppercase tracking-wider">
                            {navT(group.titleKey)}
                        </div>
                        {group.items.map((item) => itemLink(item))}
                    </div>
                ))}
                {collapsible(
                    "factor-sidebar-items",
                    factorActive,
                    factorOpen,
                    setFactorOpen,
                    ReceiptText,
                    navT("factor"),
                    factorItems,
                )}
                {collapsible(
                    "content-sidebar-items",
                    contentActive,
                    contentOpen,
                    setContentOpen,
                    PenLine,
                    navT("content"),
                    contentItems,
                )}
                {collapsible("seo-sidebar-items", seoActive, seoOpen, setSeoOpen, Search, navT("seo"), seoItems, {
                    0: navT("seoSectionControl"),
                    2: navT("seoSectionCatalog"),
                    6: navT("seoSectionContent"),
                    10: navT("seoSectionMonitoring"),
                    14: navT("seoSectionSystem"),
                })}
                <div className="flex flex-col gap-1">
                    <div className="px-3 pb-1 font-medium text-[0.65rem] text-sidebar-foreground/50 uppercase tracking-wider">
                        {navT("operations")}
                    </div>
                    <div className="px-3 pt-1 pb-0 font-medium text-[0.65rem] text-sidebar-foreground/50 uppercase tracking-wider">
                        {navT("growth")}
                    </div>
                    {collapsible(
                        "discovery-sidebar-items",
                        discoveryActive,
                        discoveryOpen,
                        setDiscoveryOpen,
                        Sparkles,
                        navT("discovery"),
                        discoveryItems,
                        {
                            0: navT("discoverySectionInsight"),
                            3: navT("discoverySectionControl"),
                            4: navT("discoverySectionKnowledge"),
                            6: navT("discoverySectionSystem"),
                        },
                    )}
                    {collapsible(
                        "ticket-sidebar-items",
                        ticketActive,
                        ticketOpen,
                        setTicketOpen,
                        MessageSquare,
                        navT("tickets"),
                        ticketItems,
                        undefined,
                        ticketUnread,
                    )}
                    {collapsible(
                        "trust-sidebar-items",
                        trustActive,
                        trustOpen,
                        setTrustOpen,
                        ShieldCheck,
                        navT("trust"),
                        trustItems,
                        {
                            0: navT("trustSectionReview"),
                            2: navT("trustSectionControl"),
                            4: navT("trustSectionIntelligence"),
                            6: navT("trustSectionQuality"),
                        },
                    )}
                    {collapsible(
                        "agentic-sidebar-items",
                        agenticActive,
                        agenticOpen,
                        setAgenticOpen,
                        Bot,
                        navT("agenticCommerce"),
                        agenticItems,
                    )}
                </div>
                {groups.slice(3).map((group) => (
                    <div key={group.titleKey} className="flex flex-col gap-1">
                        <div className="px-3 pb-1 font-medium text-[0.65rem] text-sidebar-foreground/50 uppercase tracking-wider">
                            {navT(group.titleKey)}
                        </div>
                        {group.items.map((item) => itemLink(item))}
                        {group.titleKey === "configuration" ? (
                            <div className="mt-1">
                                {collapsible(
                                    "identity-sidebar-items",
                                    identityActive,
                                    identityOpen,
                                    setIdentityOpen,
                                    ShieldCheck,
                                    "هویت و امنیت",
                                    identityItems,
                                    { 12: "تنظیمات" },
                                )}
                            </div>
                        ) : null}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
