import React from "react";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-primary-900 text-white shadow-lg hidden md:flex md:flex-col">
      <div className="p-6 border-b border-primary-800">
        <h1 className="text-2xl font-bold">Calibra</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          <li>
            <a
              href="#"
              className="block px-4 py-2 rounded hover:bg-primary-800 transition-colors"
            >
              Dashboard
            </a>
          </li>
          <li>
            <a
              href="#"
              className="block px-4 py-2 rounded hover:bg-primary-800 transition-colors"
            >
              Analytics
            </a>
          </li>
          <li>
            <a
              href="#"
              className="block px-4 py-2 rounded hover:bg-primary-800 transition-colors"
            >
              Reports
            </a>
          </li>
          <li>
            <a
              href="#"
              className="block px-4 py-2 rounded hover:bg-primary-800 transition-colors"
            >
              Settings
            </a>
          </li>
        </ul>
      </nav>
      <div className="p-4 border-t border-primary-800">
        <button className="w-full bg-primary-600 hover:bg-primary-500 px-4 py-2 rounded transition-colors">
          Logout
        </button>
      </div>
    </aside>
  );
}
