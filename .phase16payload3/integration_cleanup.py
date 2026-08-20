from pathlib import Path
import json

# Wire the Discovery storefront overlay into the canonical composed storefront contract.
pkg_path = Path('docs/api/package.json')
pkg = json.loads(pkg_path.read_text())
scripts = pkg['scripts']
scripts['build:json:storefront-discovery'] = (
    'redocly bundle reference/openapi/storefront.discovery.v1.yaml '
    '-o dist/storefront.discovery.v1.json --ext json'
)
old = scripts['build:json:storefront']
needle = 'pnpm build:json:storefront-phase17 && pnpm build:json:storefront-merge'
replacement = (
    'pnpm build:json:storefront-phase17 && '
    'pnpm build:json:storefront-discovery && pnpm build:json:storefront-merge'
)
if needle in old:
    scripts['build:json:storefront'] = old.replace(needle, replacement)
elif 'build:json:storefront-discovery' not in old:
    raise SystemExit('Unexpected storefront build pipeline')
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=4) + '\n')

merge_path = Path('docs/api/scripts/merge-storefront-spec.js')
merge = merge_path.read_text()
phase17_line = 'const phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));'
discovery_line = 'const discovery = JSON.parse(readFileSync(resolve(root, "dist/storefront.discovery.v1.json"), "utf8"));'
if discovery_line not in merge:
    if phase17_line not in merge:
        raise SystemExit('Storefront phase17 merge anchor missing')
    merge = merge.replace(phase17_line, phase17_line + '\n' + discovery_line)
old_overlays = 'for (const overlay of [completion, identity, phase9, phase17]) {'
new_overlays = 'for (const overlay of [completion, identity, phase9, phase17, discovery]) {'
if old_overlays in merge:
    merge = merge.replace(old_overlays, new_overlays)
elif new_overlays not in merge:
    raise SystemExit('Storefront overlay merge anchor missing')
merge_path.write_text(merge)

# docs/api build must publish the composed storefront spec rather than the uncomposed base file.
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
        raise SystemExit('Admin build function anchor missing')
    function = '''function buildStorefrontSpec() {\n    try {\n        execSync("pnpm build:json:storefront", { cwd: ROOT, stdio: "inherit" });\n        copyFileSync(join(OUT_DIR, "storefront.v1.json"), join(OUT_DIR, "storefront.v1.yaml"));\n        console.log("✓ Built composed storefront spec");\n    } catch (err) {\n        console.error("✗ Building composed storefront spec failed:", err.message);\n        process.exit(1);\n    }\n}\n\n'''
    build = build.replace(anchor, function + anchor)
build_path.write_text(build)

# Remove two imports that materialize but are unused; keep Biome gates strict instead of suppressing them.
workspace_path = Path('apps/admin/src/features/discovery/workspace.tsx')
workspace = workspace_path.read_text()
workspace = workspace.replace('useEffect, useMemo, useState', 'useEffect, useState')
workspace = workspace.replace('CheckCircle2, ', '')
workspace = workspace.replace(', CheckCircle2', '')
workspace_path.write_text(workspace)
