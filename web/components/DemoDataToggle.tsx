"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function DemoDataToggle() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/demo/status`)
      .then((r) => r.json())
      .then((data) => {
        setLoaded(data.loaded);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, []);

  async function handleLoad() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/demo/load`, { method: "POST" });
      setLoaded(true);
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/demo/clear`, { method: "POST" });
      setLoaded(false);
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (!checked) return null;

  return (
    <div className="flex items-center gap-2">
      {loaded ? (
        <button
          onClick={handleClear}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-accent-red/30 text-accent-red hover:bg-accent-red/10 transition disabled:opacity-50"
        >
          {loading ? "Clearing..." : "Clear Demo Data"}
        </button>
      ) : (
        <button
          onClick={handleLoad}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load Demo Data"}
        </button>
      )}
    </div>
  );
}
