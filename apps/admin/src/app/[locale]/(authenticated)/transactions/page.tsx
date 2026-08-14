import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { TransactionsCenter } from "#/views/transactions/transactions-center";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export const metadata: Metadata = { title: "Transactions | Calibra" };

export default async function TransactionsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TransactionsCenter />;
}
