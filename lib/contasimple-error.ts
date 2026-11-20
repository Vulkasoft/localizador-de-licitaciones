// Extract a human-readable message from a thrown Contasimple API error.
export function contasimpleErrorMessage(e: unknown): string {
  const m = String((e as any)?.message || "");
  const jsonStart = m.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(m.slice(jsonStart));
      if (parsed?.errorMessage) return String(parsed.errorMessage).replace(/\r?\n/g, " ").trim();
    } catch {
      /* ignore */
    }
  }
  return m || "Error desconocido";
}
