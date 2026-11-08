const maxPageBytes = 768 * 1024;
const hostPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function publicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !hostPattern.test(url.hostname) ||
      /\.(?:local|localhost|internal|test|invalid|example)$/.test(url.hostname)
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export const siteHost = (url) => url.hostname.replace(/^www\./, "");
export const siteKey = (url) =>
  siteHost(url) + url.pathname.replace(/\/+$/, "");

function publicAddress(address) {
  if (address.includes(":")) {
    const first = Number.parseInt(address.split(":")[0], 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !/^(?:2002:|2001:0{0,3}db8:|2001:0{0,3}0:)/i.test(address)
    );
  }
  const [a, b, c, d, extra] = address.split(".").map(Number);
  if (
    ![a, b, c, d].every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ||
    extra !== undefined
  )
    return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function resolvesPublicly(hostname, signal) {
  const results = await Promise.all(
    [1, 28].map(async (type) => {
      const dns = new URL("https://cloudflare-dns.com/dns-query");
      dns.searchParams.set("name", hostname);
      dns.searchParams.set("type", String(type));
      const response = await fetch(dns, {
        headers: { Accept: "application/dns-json" },
        signal,
      });
      if (!response.ok) throw new Error("DNS lookup failed");
      const answer = await response.json();
      if (answer.Status !== 0) throw new Error("DNS lookup failed");
      return (answer.Answer ?? [])
        .filter((record) => record.type === type)
        .map((record) => record.data);
    }),
  );
  const addresses = results.flat();
  return addresses.length > 0 && addresses.every(publicAddress);
}

export async function readText(body, limit) {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("Body too large");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

export async function checkBacklink(backlink, ownHosts, signal) {
  let url = backlink;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!(await resolvesPublicly(url.hostname, signal))) return "unreachable";
    const response = await fetch(url, {
      headers: { Accept: "text/html, application/xhtml+xml" },
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("Location");
      const next = location && publicHttpsUrl(new URL(location, url).href);
      if (!next || siteHost(next) !== siteHost(backlink)) return "unreachable";
      url = next;
      continue;
    }
    if (
      !response.ok ||
      !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
        response.headers.get("Content-Type") ?? "",
      )
    ) {
      await response.body?.cancel();
      return "unreachable";
    }

    const html = await readText(response.body, maxPageBytes);
    let documentBase = url;
    let hasBase = false;
    let found = false;
    const resolve = (href, base) => {
      try {
        return new URL(href, base);
      } catch {
        return null;
      }
    };
    await new HTMLRewriter()
      .on("base[href]", {
        element(element) {
          if (hasBase) return;
          hasBase = true;
          documentBase = resolve(element.getAttribute("href"), url) ?? url;
        },
      })
      .on("a[href]", {
        element(element) {
          const target = resolve(element.getAttribute("href"), documentBase);
          if (
            target &&
            !target.username &&
            !target.password &&
            !target.port &&
            ["http:", "https:"].includes(target.protocol) &&
            ownHosts.has(siteHost(target))
          )
            found = true;
        },
      })
      .transform(
        new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      )
      .arrayBuffer();
    return found ? "verified" : "missing";
  }
  return "unreachable";
}
