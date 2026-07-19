import type { Metadata } from "next";
import { AppShell } from "@/src/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Lolit SEO V2",
  description: "داشبورد عملیاتی سئو برای مدیریت رشد ارگانیک",
};

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
