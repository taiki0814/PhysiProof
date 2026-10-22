/** Escape untrusted owner names before inserting Leaflet's HTML popup. */
export function escapeMapText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
