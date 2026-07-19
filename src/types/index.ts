export interface StatCard {
  id: string;
  title: string;
  value: string | number;
  change: number;
  changeType: "increase" | "decrease";
  icon: string;
}

export interface ChartData {
  name: string;
  value: number;
  percentage?: number;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  status: "completed" | "pending" | "failed";
  category: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  status: "online" | "offline" | "away";
}
