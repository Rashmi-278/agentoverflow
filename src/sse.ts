type SSEListener = (event: string, data: string) => void;

const listeners = new Set<SSEListener>();

export function addSSEListener(listener: SSEListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSSE(event: string, data: unknown): void {
  const json = JSON.stringify(data);
  for (const listener of listeners) {
    try {
      listener(event, json);
    } catch {
      // listener disconnected, will be cleaned up
    }
  }
}
