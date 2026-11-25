// Wave 1 offline support: the last data loaded is kept on the device, so the calendar can still be
// read when the internet is down. Full offline editing comes in Wave 4 (docs/pms/features.md).

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`cache:${key}`, JSON.stringify(value));
  } catch {}
}

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`cache:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
