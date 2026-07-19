import { StatCard, ChartData, Transaction, User } from "@/src/types";

export const mockStats: StatCard[] = [
  {
    id: "1",
    title: "Total Users",
    value: "12,458",
    change: 12,
    changeType: "increase",
    icon: "👥",
  },
  {
    id: "2",
    title: "Revenue",
    value: "$45,231.89",
    change: 8,
    changeType: "increase",
    icon: "💰",
  },
  {
    id: "3",
    title: "Active Sessions",
    value: "582",
    change: 3,
    changeType: "increase",
    icon: "🔄",
  },
  {
    id: "4",
    title: "Conversion Rate",
    value: "3.24%",
    change: -0.5,
    changeType: "decrease",
    icon: "📈",
  },
];

export const mockSalesData: ChartData[] = [
  { name: "Jan", value: 4000, percentage: 40 },
  { name: "Feb", value: 3000, percentage: 30 },
  { name: "Mar", value: 2000, percentage: 20 },
  { name: "Apr", value: 2780, percentage: 28 },
  { name: "May", value: 1890, percentage: 19 },
  { name: "Jun", value: 2390, percentage: 24 },
  { name: "Jul", value: 3490, percentage: 35 },
];

export const mockTrafficSources: ChartData[] = [
  { name: "Direct", value: 2800, percentage: 28 },
  { name: "Organic Search", value: 3200, percentage: 32 },
  { name: "Social Media", value: 2100, percentage: 21 },
  { name: "Referral", value: 1900, percentage: 19 },
];

export const mockTransactions: Transaction[] = [
  {
    id: "TXN001",
    description: "Payment from Customer A",
    amount: 1250.0,
    date: "2026-07-19",
    status: "completed",
    category: "Incoming",
  },
  {
    id: "TXN002",
    description: "Subscription payment",
    amount: -99.99,
    date: "2026-07-18",
    status: "completed",
    category: "Outgoing",
  },
  {
    id: "TXN003",
    description: "Refund - Order #1234",
    amount: -450.0,
    date: "2026-07-17",
    status: "completed",
    category: "Refund",
  },
  {
    id: "TXN004",
    description: "Invoice payment pending",
    amount: 2500.0,
    date: "2026-07-16",
    status: "pending",
    category: "Incoming",
  },
  {
    id: "TXN005",
    description: "Failed transaction",
    amount: -300.0,
    date: "2026-07-15",
    status: "failed",
    category: "Outgoing",
  },
];

export const mockUsers: User[] = [
  {
    id: "USR001",
    name: "Alice Johnson",
    email: "alice.johnson@calibra.io",
    role: "Admin",
    avatar: "AJ",
    status: "online",
  },
  {
    id: "USR002",
    name: "Bob Smith",
    email: "bob.smith@calibra.io",
    role: "Manager",
    avatar: "BS",
    status: "online",
  },
  {
    id: "USR003",
    name: "Carol Williams",
    email: "carol.williams@calibra.io",
    role: "Analyst",
    avatar: "CW",
    status: "away",
  },
  {
    id: "USR004",
    name: "David Brown",
    email: "david.brown@calibra.io",
    role: "Developer",
    avatar: "DB",
    status: "offline",
  },
];
