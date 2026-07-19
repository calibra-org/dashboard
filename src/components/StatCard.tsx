"use client";

import React from "react";
import { StatCard as StatCardType } from "@/src/types";

interface Props {
  stat: StatCardType;
}

export default function StatCard({ stat }: Props) {
  const isIncrease = stat.changeType === "increase";
  const changeColor = isIncrease ? "text-green-600" : "text-red-600";
  const changeIcon = isIncrease ? "↑" : "↓";

  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-600 text-sm font-medium">{stat.title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
          <p className={`text-xs mt-2 ${changeColor}`}>
            {changeIcon} {Math.abs(stat.change)}% from last month
          </p>
        </div>
        <div className="text-4xl">{stat.icon}</div>
      </div>
    </div>
  );
}
