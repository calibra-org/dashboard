from pathlib import Path

root = Path(__file__).resolve().parents[1]
for relative in (
    "docs/api/reference/openapi/admin.phase17.v1.yaml",
    "docs/api/reference/openapi/storefront.phase17.v1.yaml",
):
    path = root / relative
    text = path.read_text(encoding="utf-8")
    if "\nservers:\n" not in text:
        text = text.replace("\ntags:\n", "\nservers:\n  - url: /\ntags:\n", 1)
    path.write_text(text, encoding="utf-8")

print("Phase 17 OpenAPI overlays use a relative server URL without inventing environment hosts")
