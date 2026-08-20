from pathlib import Path
import json
import re


def namespace_routes(path: str, namespace: str) -> None:
    p = Path(path)
    source = p.read_text()
    pattern = re.compile(r'(router\.(?:get|post|put|patch|delete)\("[^"]+",\[Controller,"([^"]+)"\]\))(?!\.as\()')

    def replace(match: re.Match[str]) -> str:
        call = match.group(1)
        action = match.group(2)
        return f'{call}.as("{namespace}.{action}")'

    updated, count = pattern.subn(replace, source)
    if count == 0:
        existing = re.findall(r'\.as\("' + re.escape(namespace) + r'\.[^"]+"\)', source)
        if not existing:
            raise SystemExit(f'No routes named for {path}')
        updated = source

    names = re.findall(r'\.as\("([^"]+)"\)', updated)
    if len(names) != len(set(names)):
        raise SystemExit(f'Duplicate explicit route names in {path}: {names}')
    if any(not name.startswith(namespace + ".") for name in names):
        raise SystemExit(f'Unexpected route namespace in {path}: {names}')

    unnamed = pattern.findall(updated)
    if unnamed:
        raise SystemExit(f'Unnamed controller routes remain in {path}: {unnamed}')

    p.write_text(updated)


def wire_storefront_openapi() -> None:
    package_path = Path('docs/api/package.json')
    package = json.loads(package_path.read_text())
    scripts = package['scripts']
    scripts['build:json:storefront-discovery'] = (
        'redocly bundle reference/openapi/storefront.discovery.v1.yaml '
        '-o dist/storefront.discovery.v1.json --ext json'
    )
    pipeline = scripts['build:json:storefront']
    needle = 'pnpm build:json:storefront-phase17 && pnpm build:json:storefront-merge'
    replacement = (
        'pnpm build:json:storefront-phase17 && '
        'pnpm build:json:storefront-discovery && pnpm build:json:storefront-merge'
    )
    if needle in pipeline:
        scripts['build:json:storefront'] = pipeline.replace(needle, replacement)
    elif 'build:json:storefront-discovery' not in pipeline:
        raise SystemExit('Unexpected storefront OpenAPI build pipeline')
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=4) + '\n')

    merge_path = Path('docs/api/scripts/merge-storefront-spec.js')
    merge = merge_path.read_text()
    phase17_line = 'const phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));'
    discovery_line = 'const discovery = JSON.parse(readFileSync(resolve(root, "dist/storefront.discovery.v1.json"), "utf8"));'
    if discovery_line not in merge:
        if phase17_line not in merge:
            raise SystemExit('Storefront phase17 overlay anchor missing')
        merge = merge.replace(phase17_line, phase17_line + '\n' + discovery_line)
    old_overlays = 'for (const overlay of [completion, identity, phase9, phase17]) {'
    new_overlays = 'for (const overlay of [completion, identity, phase9, phase17, discovery]) {'
    if old_overlays in merge:
        merge = merge.replace(old_overlays, new_overlays)
    elif new_overlays not in merge:
        raise SystemExit('Storefront overlay merge anchor missing')
    merge_path.write_text(merge)

    build_path = Path('docs/api/scripts/build.js')
    build = build_path.read_text()
    build = build.replace(
        'const DIRECT_SPECS = ["storefront.v1.yaml", "platform.v1.yaml"];',
        'const DIRECT_SPECS = ["platform.v1.yaml"];',
    )
    build = build.replace(
        '    buildAdminSpec();\n    copyIndex();',
        '    buildStorefrontSpec();\n    buildAdminSpec();\n    copyIndex();',
    )
    if 'function buildStorefrontSpec()' not in build:
        anchor = 'function buildAdminSpec() {'
        if anchor not in build:
            raise SystemExit('Admin OpenAPI build anchor missing')
        function = '''function buildStorefrontSpec() {\n    try {\n        execSync("pnpm build:json:storefront", { cwd: ROOT, stdio: "inherit" });\n        copyFileSync(join(OUT_DIR, "storefront.v1.json"), join(OUT_DIR, "storefront.v1.yaml"));\n        console.log("✓ Built composed storefront spec");\n    } catch (err) {\n        console.error("✗ Building composed storefront spec failed:", err.message);\n        process.exit(1);\n    }\n}\n\n'''
        build = build.replace(anchor, function + anchor)
    build_path.write_text(build)


def clean_discovery_imports() -> None:
    path = Path('apps/admin/src/features/discovery/workspace.tsx')
    source = path.read_text()
    source = source.replace('useEffect, useMemo, useState', 'useEffect, useState')
    source = source.replace('CheckCircle2, ', '')
    source = source.replace(', CheckCircle2', '')
    path.write_text(source)


namespace_routes('apps/api/start/routes/admin_discovery.ts', 'discovery.admin')
namespace_routes('apps/api/start/routes/discovery_storefront.ts', 'discovery.storefront')
wire_storefront_openapi()
clean_discovery_imports()
