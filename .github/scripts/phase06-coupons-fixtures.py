from pathlib import Path


def replace_all(path: str, replacements: dict[str, str]) -> None:
    file = Path(path)
    text = file.read_text()
    for old, new in replacements.items():
        if old not in text:
            raise SystemExit(f"{path}: missing expected fixture {old!r}")
        text = text.replace(old, new)
    file.write_text(text)


# The Phase 06 wire contract is 4-64 characters. Keep internal/unit snapshot shorthand alone,
# but functional HTTP fixtures must exercise valid public coupon codes.
replace_all(
    "apps/api/tests/functional/coupons/cart_apply.spec.ts",
    {
        '"P10"': '"PCT10"',
        '"OFF"': '"OFFX"',
        '"OLD"': '"OLDX"',
        '"DUP"': '"DUPX"',
    },
)
replace_all(
    "apps/api/tests/functional/coupons/cart_remove.spec.ts",
    {
        '"P10"': '"PCT10"',
        '/P10': '/PCT10',
    },
)
replace_all(
    "apps/api/tests/functional/coupons/usage_limit_global.spec.ts",
    {
        '"G1"': '"GL01"',
        '"G2"': '"GL02"',
    },
)
replace_all(
    "apps/api/tests/functional/coupons/usage_limit_per_user.spec.ts",
    {
        '"U1"': '"USR1"',
        '"U2"': '"USR2"',
    },
)
replace_all(
    "apps/api/tests/functional/coupons/admin_coupons_crud.spec.ts",
    {
        '"DEL"': '"DELX"',
        '"OLD"': '"OLDX"',
    },
)
replace_all(
    "apps/api/tests/functional/coupons/admin_coupons_extra.spec.ts",
    {
        'returns invalid_length when below the 2-char floor': 'returns invalid_length when below the 4-char floor',
    },
)

# Keep the live uniqueness probe consistent with create/apply validators, including character rules.
controller = Path("apps/api/app/controllers/admin/coupons_controller.ts")
text = controller.read_text()
old = '''        if (code.length < 2 || code.length > 64) {
            return { data: { available: false, suggestion: null, reason: "invalid_length" } };
        }'''
new = '''        if (code.length < 4 || code.length > 64) {
            return { data: { available: false, suggestion: null, reason: "invalid_length" } };
        }
        if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) {
            return { data: { available: false, suggestion: null, reason: "invalid_format" } };
        }'''
if old not in text:
    raise SystemExit("admin coupon code-check length guard not found")
controller.write_text(text.replace(old, new, 1))
