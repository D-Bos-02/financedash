// Whether a listen address only accepts connections from this computer.
export function isLocalHost(host) {
  const h = String(host).trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}
