// OTA host allow-list: the same rule as the firmware (ota_control.h), so the dialog refuses exactly what
// the board would refuse, before anything is written to control.

export const ALLOWED_DOMAINS = ["nabatechworld.com", "wafacredence.com"] as const;

/** "https://host[:443][/path]" with host equal to, or a subdomain of, an allowed domain.
 *  Returns the normalized base URL (lowercase host, no trailing slash) or "" when refused. */
export function allowedBase(url: string): string {
  const scheme = "https://";
  if (url.length <= scheme.length || url.length > 200) return "";
  if (url.slice(0, scheme.length).toLowerCase() !== scheme) return "";
  for (const c of url) {
    if (c <= " " || c === "\\" || c === '"' || c === "?" || c === "#" || c === "%") return "";
  }
  const rest = url.slice(scheme.length);
  const slash = rest.indexOf("/");
  let authority = slash < 0 ? rest : rest.slice(0, slash);
  let path = slash < 0 ? "" : rest.slice(slash);
  if (authority.includes("@")) return "";
  const colon = authority.indexOf(":");
  if (colon >= 0) {
    if (authority.slice(colon) !== ":443") return "";
    authority = authority.slice(0, colon);
  }
  if (!/^[A-Za-z0-9.-]+$/.test(authority)) return "";
  const host = authority.toLowerCase();
  if (!host || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return "";
  const ok = ALLOWED_DOMAINS.some((d) => host === d || (host.length > d.length && host.endsWith("." + d)));
  if (!ok) return "";
  path = path.replace(/\/+$/, "");
  return scheme + host + path;
}

/** "ota.wafacredence.com/fw" part of an allowed base, for the /ota-site/<...> dev proxy. */
export const proxyPath = (base: string) => base.replace(/^https:\/\//, "");
