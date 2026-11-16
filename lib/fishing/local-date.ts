/** Today's date in the device's local time as YYYY-MM-DD. Never use toISOString (that is UTC). */
export function localIsoDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
