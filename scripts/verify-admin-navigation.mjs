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
    const transactionsPath = `apps/admin/messages/transactions/${locale}.json`;
    const ticketsPath = `apps/admin/messages/tickets/${locale}.json`;
    const transactions = exists(transactionsPath) ? JSON.parse(read(transactionsPath)) : {};
    const tickets = exists(ticketsPath) ? JSON.parse(read(ticketsPath)) : {};
    return {
        ...base,
        ...transactions,
        ...tickets,
        Nav: {
            ...base.Nav,
            ...(transactions.Nav ?? {}),
            ...(tickets.Nav ?? {}),
        },
    };
}

function collectPagePatterns(directory, urlSegments = []) {
    const patterns = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const nextDirectory = path.join(directory, entry.name);
        const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
        const nextSegments = isRouteGroup ? urlSegments : [...urlSegments, entry.name];
        if (fs.existsSync(path.join(nextDirectory, "page.tsx"))) patterns.push(nextSegments);
        patterns.push(...collectPagePatterns(nextDirectory, nextSegments));
    }
    return patterns;
}

function routePatternMatches(pattern, href) {
    const target = href.split("/").filter(Boolean);
    if (pattern.length !== target.length) return false;
    return pattern.every((segment, index) => {
        if (segment.startsWith("[") && segment.endsWith("]")) return true;
        return segment === target[index];
    });
}

const sidebarPath = "apps/admin/src/components/Sidebar.tsx";
const sidebar = read(sidebarPath);
const authenticatedRoot = path.join(root, "apps/admin/src/app/[locale]/(authenticated)");
const pagePatterns = collectPagePatterns(authenticatedRoot);

const hrefs = [...sidebar.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]);
check(hrefs.length > 0, "Sidebar contains no static navigation hrefs");
check(new Set(hrefs).size === hrefs.length, "Sidebar contains duplicate href entries");

for (const href of hrefs) {
    check(
        pagePatterns.some((pattern) => routePatternMatches(pattern, href)),
        `Sidebar dead link: ${href} has no authenticated page`,
    );
}

const importMatch = sidebar.match(/import\s*\{\s*([^}]*)\}\s*from\s*"#\/icons";/);
check(Boolean(importMatch), "Sidebar must import icons through #/icons");
const importedIcons = importMatch
    ? importMatch[1]
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => {
              const alias = entry.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/);
              return alias ? { exported: alias[1], local: alias[2] } : { exported: entry, local: entry };
          })
    : [];
const generatedIcons = read("packages/panel-kit/src/icons/icons.generated.ts");
const directionalIcons = read("packages/panel-kit/src/icons/directional.tsx");
for (const icon of importedIcons) {
    check(
        generatedIcons.includes(icon.exported) || directionalIcons.includes(icon.exported),
        `Sidebar icon ${icon.exported} is not exported by @calibra/panel-kit/icons`,
    );
}

const localIconNames = new Set(importedIcons.map((icon) => icon.local));
const itemIconNames = [...sidebar.matchAll(/icon:\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]);
for (const icon of itemIconNames) {
    check(localIconNames.has(icon), `Sidebar uses icon ${icon} without importing it from #/icons`);
}

for (const control of ["ChevronDown", "Box"]) {
    if (sidebar.includes(`<${control}`)) check(localIconNames.has(control), `Sidebar JSX uses ${control} without importing it`);
}

check(!sidebar.includes("label: { fa:"), "Sidebar must not carry local bilingual navigation copy; use Nav translation keys");

const fa = messages("fa");
const en = messages("en");
const labelKeys = [...sidebar.matchAll(/labelKey:\s*"([^"]+)"/g)].map((match) => match[1]);
for (const key of new Set(labelKeys)) {
    check(typeof fa.Nav?.[key] === "string" && fa.Nav[key].length > 0, `Persian Nav.${key} is missing`);
    check(typeof en.Nav?.[key] === "string" && en.Nav[key].length > 0, `English Nav.${key} is missing`);
}

for (const buttonMatch of sidebar.matchAll(/<button([\s\S]*?)<\/button>/g)) {
    const button = buttonMatch[0];
    const hasVisibleContent = /<span\b/.test(button) || /\{[^}]+\}/.test(button);
    const hasAccessibleName = /aria-label=/.test(button) || /aria-labelledby=/.test(button);
    if (!hasVisibleContent && /<[A-Z][A-Za-z0-9_]*\b/.test(button)) {
        check(hasAccessibleName, "Sidebar icon-only button is missing an accessible name");
    }
}

if (failures.length > 0) {
    console.error(`Admin navigation verifier failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Admin navigation verifier passed: ${checks} checks across ${hrefs.length} routes`);
