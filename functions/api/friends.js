import {
  friendLinks,
  originalHost,
  pagesOrigin,
} from "../../data/friend-links.js";
import {
  checkBacklink,
  publicHttpsUrl,
  readText,
  resolvesPublicly,
  siteHost,
  siteKey,
} from "../../server/friend-backlink.js";

const ownHosts = new Set([originalHost, new URL(pagesOrigin).hostname]);
const existingKeys = new Set(
  friendLinks.map(({ url }) => siteKey(new URL(url))),
);
const originalOrigins = new Set([
  `http://${originalHost}`,
  `https://${originalHost}`,
]);

export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin");
  const crossOrigin = origin && origin !== new URL(request.url).origin;
  const headers = { "Cache-Control": "no-store", Vary: "Origin" };
  const json = (value, status = 200) =>
    Response.json(value, { status, headers });
  if (crossOrigin && !originalOrigins.has(origin))
    return json({ error: "不支持此来源。" }, 403);
  if (crossOrigin) headers["Access-Control-Allow-Origin"] = origin;
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

  const db = env.FRIEND_APPLICATIONS;
  if (!db) return json({ error: "站内申请暂未开放。" }, 503);
  if (request.method === "GET") {
    const { results } = await db
      .prepare(
        "SELECT name, description, url, avatar FROM friend_applications WHERE status = 'approved' ORDER BY id",
      )
      .all();
    return json({ friends: results });
  }
  if (request.method !== "POST") return json({ error: "请求方法无效。" }, 405);
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  ) {
    return json({ error: "请求格式无效。" }, 415);
  }

  let application;
  try {
    application = JSON.parse(await readText(request.body, 8192));
  } catch {
    return json({ error: "请检查申请内容的格式和长度。" }, 400);
  }
  const text = (key, max) => {
    const value =
      typeof application?.[key] === "string" ? application[key].trim() : "";
    return value.length <= max ? value : "";
  };
  const name = text("name", 60);
  const description = text("description", 180);
  const url = publicHttpsUrl(text("url", 500));
  const avatar = publicHttpsUrl(text("avatar", 500));
  const backlink = publicHttpsUrl(text("backlink", 500));
  if (!name || !description || !url || !avatar || !backlink) {
    return json(
      { error: "请填写完整资料，三个网址都需要是公开的 HTTPS 地址。" },
      400,
    );
  }
  if (siteHost(url) !== siteHost(backlink))
    return json({ error: "互链页面需要在你的博客域名下。" }, 400);
  const key = siteKey(url);
  if (ownHosts.has(siteHost(url)))
    return json({ error: "请填写你的博客网址。" }, 400);
  if (
    existingKeys.has(key) ||
    (await db
      .prepare("SELECT id FROM friend_applications WHERE site_key = ?")
      .bind(key)
      .first())
  ) {
    return json({ error: "这个站点已经申请或已在星图中。" }, 409);
  }

  const bucket = Math.floor(Date.now() / 600000);
  const visitor = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${bucket}:${visitor}`),
  );
  const visitorKey = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const [, limit] = await db.batch([
    db
      .prepare("DELETE FROM friend_application_limits WHERE bucket < ?")
      .bind(bucket),
    db
      .prepare(
        `INSERT INTO friend_application_limits (visitor, bucket, attempts) VALUES (?, ?, 1)
      ON CONFLICT (visitor) DO UPDATE SET attempts = attempts + 1 WHERE attempts < 6 RETURNING attempts`,
      )
      .bind(visitorKey, bucket),
  ]);
  if (!limit.results.length)
    return json({ error: "尝试次数较多，请稍后再试。" }, 429);

  try {
    const signal = AbortSignal.timeout(10000);
    const result = await checkBacklink(backlink, ownHosts, signal);
    if (result === "missing")
      return json(
        { error: "在互链页面里没找到指向本站的链接。添加后再提交。" },
        422,
      );
    if (result !== "verified")
      return json({ error: "暂时读不到互链页面，请确认页面可公开访问。" }, 422);
    if (!(await resolvesPublicly(avatar.hostname, signal)))
      return json({ error: "头像网址需要能从公网访问。" }, 422);
  } catch {
    return json({ error: "校验超时或页面无法读取，请稍后重试。" }, 422);
  }

  const inserted = await db
    .prepare(
      `INSERT INTO friend_applications
    (site_key, name, description, url, avatar, backlink) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (site_key) DO NOTHING RETURNING id`,
    )
    .bind(key, name, description, url.href, avatar.href, backlink.href)
    .first();
  if (!inserted) return json({ error: "这个站点已经申请或已在星图中。" }, 409);
  return json({ message: "互链已通过检查，申请已提交，等待审核。" }, 201);
}
