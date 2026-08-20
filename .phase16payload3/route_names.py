from pathlib import Path
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


namespace_routes('apps/api/start/routes/admin_discovery.ts', 'discovery.admin')
namespace_routes('apps/api/start/routes/discovery_storefront.ts', 'discovery.storefront')
