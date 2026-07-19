export function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}٪`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency: "IRR",
    maximumFractionDigits: 0,
  }).format(value);
}
