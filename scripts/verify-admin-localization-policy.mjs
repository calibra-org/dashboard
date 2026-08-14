#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(root, relative));
}

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

function messages(locale) {
    const base = JSON.parse(read(`apps/admin/messages/${locale}.json`));
    const transactions = JSON.parse(read(`apps/admin/messages/transactions/${locale}.json`));
    return {
        ...base,
        ...transactions,
        Nav: {
            ...base.Nav,
            ...transactions.Nav,
        },
    };
}

const localizedSurfaces = [
    "apps/admin/src/views/transactions/transactions-center.tsx",
    "apps/admin/src/features/factor/documents-list.tsx",
    "apps/admin/src/features/factor/payments-page.tsx",
    "apps/admin/src/features/factor/reports-page.tsx",
    "apps/admin/src/features/factor/records-page.tsx",
    "apps/admin/src/features/factor/settings-page.tsx",
    "apps/admin/src/features/content/posts-page.tsx",
    "apps/admin/src/features/content/market-page.tsx",
    "apps/admin/src/features/content/agents-page.tsx",
    "apps/admin/src/features/content/studio-page.tsx",
    "apps/admin/src/features/content/calendar-page.tsx",
    "apps/admin/src/features/content/reports-page.tsx",
    "apps/admin/src/features/content/settings-page.tsx",
    "apps/admin/src/features/content/taxonomy-page.tsx",
    "apps/admin/src/features/seo/workspace.tsx",
];

for (const file of localizedSurfaces) {
    check(exists(file), `Missing release localization surface: ${file}`);
    if (!exists(file)) continue;
    const source = read(file);
    check(
        source.includes("useTranslations(") || source.includes("getTranslations("),
        `${file} must source ordinary visible copy from next-intl instead of a local Persian/bilingual catalog`,
    );
    check(!/const\s+COPY\s*=\s*\{/.test(source), `${file} must not keep a local bilingual COPY catalog`);
}

const factorFiles = localizedSurfaces.filter((file) => file.includes("/features/factor/"));
for (const file of factorFiles) {
    const source = read(file);
    check(
        !/type=["']date["']/.test(source),
        `${file} must use the Admin date-picker primitive instead of native input[type=date]`,
    );
}

const fa = messages("fa");
const en = messages("en");
for (const namespace of ["Transactions", "Factor", "Content", "Seo"]) {
    check(fa[namespace] && typeof fa[namespace] === "object", `Persian messages missing ${namespace} namespace`);
    check(en[namespace] && typeof en[namespace] === "object", `English messages missing ${namespace} namespace`);
}
check(typeof fa.Nav?.transactions === "string", "Persian Nav.transactions is missing");
check(typeof en.Nav?.transactions === "string", "English Nav.transactions is missing");

if (failures.length > 0) {
    console.error(`Admin localization policy failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Admin localization policy passed: ${checks} checks`);
