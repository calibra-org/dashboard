from pathlib import Path

root = Path(__file__).resolve().parents[1]
admin = root / "docs/api/reference/openapi/admin.phase17.v1.yaml"
text = admin.read_text(encoding="utf-8")
text = text.replace(
    "{ tags: [Admin / Experiments], operationId:",
    "{ tags: [Admin / Experiments], security: [{ bearerAuth: [] }], operationId:",
)
admin.write_text(text, encoding="utf-8")
print("Phase 17 OpenAPI security policy aligned with the existing Admin API overlays")
