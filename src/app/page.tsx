"use client";

import Sidebar from "@/src/components/layout/Sidebar";
import Header from "@/src/components/layout/Header";
import MainContent from "@/src/components/layout/MainContent";

export default function Home() {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <MainContent />
      </div>
    </div>
  );
}
