/**
 * localStorage that never throws. Private mode, blocked site data and quota errors all
 * surface as exceptions; a preference that fails to persist must not break the page.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The preference applies for this session only.
  }
}
