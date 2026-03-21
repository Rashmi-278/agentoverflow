// TOON format encoder/decoder — lightweight tabular format for agent communication
// TOON is simpler than JSON: key-value pairs or tabular arrays

export function encodeToon(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function encodeToonTable(
  name: string,
  fields: string[],
  rows: unknown[][],
): string {
  const header = `${name}[${rows.length}]{${fields.join(",")}}:`;
  const body = rows.map((row) => `  ${row.join(",")}`).join("\n");
  return `${header}\n${body}`;
}

export function decodeToon(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

export function decodeToonTable(
  text: string,
): { name: string; fields: string[]; rows: Record<string, string>[] } | null {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  if (!firstLine) return null;
  const headerMatch = firstLine.match(/^(\w+)\[(\d+)\]\{([^}]+)\}:$/);
  if (!headerMatch) return null;

  const name = headerMatch[1] as string;
  const fields = (headerMatch[3] as string).split(",");
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.trim().split(",");
    const row: Record<string, string> = {};
    for (let j = 0; j < fields.length; j++) {
      const fieldName = fields[j] as string;
      row[fieldName] = values[j] || "";
    }
    rows.push(row);
  }

  return { name, fields, rows };
}
