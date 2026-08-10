from pathlib import Path

path = Path("apps/api/app/services/seo/seo_service.ts")
text = path.read_text()
old = '    device?: "desktop" | "mobile" | "tablet";'
new = '    device?: "all" | "desktop" | "mobile" | "tablet";'
count = text.count(old)
if count != 1:
    raise SystemExit(f"SeoKeywordInput device union: expected one match, found {count}")
path.write_text(text.replace(old, new, 1))
