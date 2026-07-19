"use client";

import React from "react";
import { ChartData } from "@/src/types";

interface Props {
  title: string;
  data: ChartData[];
  type: "line" | "pie" | "bar";
}

export default function ChartSection({ title, data, type }: Props) {
  const renderChart = () => {
    if (type === "line") {
      return <LineChart data={data} />;
    } else if (type === "pie") {
      return <PieChart data={data} />;
    } else {
      return <BarChart data={data} />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">{title}</h3>
      {renderChart()}
    </div>
  );
}

function LineChart({ data }: { data: ChartData[] }) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-4">
      <div className="relative h-48 bg-slate-50 rounded p-4">
        <svg
          viewBox="0 0 400 200"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <polyline
            points={data
              .map((d, i) => {
                const x = (i / (data.length - 1)) * 400;
                const y = 200 - (d.value / maxValue) * 180;
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#0284c7"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="grid grid-cols-7 gap-2 text-xs text-slate-600">
        {data.map((d, i) => (
          <div key={i} className="text-center">
            <div className="font-medium">{d.name}</div>
            <div className="text-slate-500">${(d.value / 1000).toFixed(1)}k</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ data }: { data: ChartData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  const slices = data.map((d) => {
    const sliceAngle = (d.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    return { name: d.name, value: d.value, percentage: d.percentage || 0, startAngle, endAngle };
  });

  const colors = ["#0284c7", "#06b6d4", "#10b981", "#f59e0b"];

  const pathData = slices.map((slice, index) => {
    const startRad = (slice.startAngle * Math.PI) / 180;
    const endRad = (slice.endAngle * Math.PI) / 180;
    const largeArc = slice.endAngle - slice.startAngle > 180 ? 1 : 0;

    const x1 = 100 + 80 * Math.cos(startRad);
    const y1 = 100 + 80 * Math.sin(startRad);
    const x2 = 100 + 80 * Math.cos(endRad);
    const y2 = 100 + 80 * Math.sin(endRad);

    const pathStr = `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return (
      <path key={index} d={pathStr} fill={colors[index % colors.length]} />
    );
  });

  return (
    <div className="flex items-center justify-between">
      <svg viewBox="0 0 200 200" className="w-40 h-40">
        {pathData}
      </svg>
      <div className="space-y-2">
        {slices.map((slice, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-slate-700">
              {slice.name}: {slice.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: ChartData[] }) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-12 text-xs font-medium text-slate-600">{d.name}</div>
            <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-end pr-3"
                style={{ width: `${(d.value / maxValue) * 100}%` }}
              >
                <span className="text-xs font-semibold text-white">
                  {((d.value / maxValue) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="w-12 text-right text-xs font-medium text-slate-600">
              ${(d.value / 1000).toFixed(1)}k
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
