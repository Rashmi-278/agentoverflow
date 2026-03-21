const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
    next: { revalidate: 10 },
  });
  return res.json();
}

export function decodeToonTable(
  text: string,
): { fields: string[]; rows: Record<string, string>[] } | null {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  if (!firstLine) return null;
  const headerMatch = firstLine.match(/^(\w+)\[(\d+)\]\{([^}]+)\}:$/);
  if (!headerMatch || !headerMatch[3]) return null;

  const fields = headerMatch[3].split(",");
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.trim().split(",");
    const row: Record<string, string> = {};
    for (let j = 0; j < fields.length; j++) {
      const fieldName = fields[j];
      if (fieldName) row[fieldName] = values[j] || "";
    }
    rows.push(row);
  }

  return { fields, rows };
}
