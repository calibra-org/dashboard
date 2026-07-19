"use client";

import React from "react";
import { mockStats, mockSalesData, mockTrafficSources } from "@/src/lib/mockData";
import StatCard from "@/src/components/StatCard";
import ChartSection from "@/src/components/ChartSection";
import TransactionList from "@/src/components/TransactionList";

export default function MainContent() {
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockStats.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSection
            title="Sales Overview"
            data={mockSalesData}
            type="line"
          />
          <ChartSection
            title="Traffic Sources"
            data={mockTrafficSources}
            type="pie"
          />
        </div>

        {/* Transactions Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Recent Transactions
          </h3>
          <TransactionList />
        </div>
      </div>
    </main>
  );
}
