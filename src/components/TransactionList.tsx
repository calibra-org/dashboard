"use client";

import React from "react";
import { mockTransactions } from "@/src/lib/mockData";

export default function TransactionList() {
  const getStatusColor = (
    status: "completed" | "pending" | "failed"
  ): string => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const getStatusLabel = (status: "completed" | "pending" | "failed"): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th className="text-left py-3 px-4 font-semibold">ID</th>
            <th className="text-left py-3 px-4 font-semibold">Description</th>
            <th className="text-left py-3 px-4 font-semibold">Category</th>
            <th className="text-left py-3 px-4 font-semibold">Date</th>
            <th className="text-right py-3 px-4 font-semibold">Amount</th>
            <th className="text-center py-3 px-4 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {mockTransactions.map((transaction) => (
            <tr
              key={transaction.id}
              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <td className="py-3 px-4 text-slate-900 font-mono text-xs">
                {transaction.id}
              </td>
              <td className="py-3 px-4 text-slate-900">
                {transaction.description}
              </td>
              <td className="py-3 px-4 text-slate-600">{transaction.category}</td>
              <td className="py-3 px-4 text-slate-600">
                {new Date(transaction.date).toLocaleDateString()}
              </td>
              <td
                className={`py-3 px-4 text-right font-semibold ${
                  transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {transaction.amount >= 0 ? "+" : ""}
                ${Math.abs(transaction.amount).toFixed(2)}
              </td>
              <td className="py-3 px-4 text-center">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                    transaction.status
                  )}`}
                >
                  {getStatusLabel(transaction.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
