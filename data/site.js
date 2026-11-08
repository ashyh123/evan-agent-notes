export const site = {
  author: "Evan Huang",
  name: "Evan 的 Agent 手记",
  description:
    "记录 Agent 的源码阅读、工程实践与项目构建。写给正在学习、动手做项目的你。",
  github: "https://github.com/ashyh123",
  x: "https://x.com/asomer666",
  repository: "https://github.com/ashyh123/evan-agent-notes",
  email: "ashyh666@gmail.com",
};
export const friendLinks = [
  {
    name: "Joye Blog",
    url: "https://www.joyehuang.me/",
    avatar: "/images/friends/joye.webp",
  },
  {
    name: "clerimia",
    description: "一边创作，一边成为自己",
    url: "https://clerimia.github.io/",
    avatar: "/images/friends/clerimia.jpg",
  },
];
export const siteUrl = (
  process.env.SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

// RSS is opt-in for release builds; local previews do not expose a feed.
export const rssEnabled = process.env.RSS_ENABLED === "true";
