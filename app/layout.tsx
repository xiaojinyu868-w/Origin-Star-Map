import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "星火档案｜让好奇心长成一片宇宙",
      template: "%s｜星火档案",
    },
    description: "探索陌生领域、留下知识火种，让AI把每次好奇连接成一张持续生长的个人星图。",
    openGraph: {
      title: "星火档案｜个人知识宇宙",
      description: "不是选一个专业，是先看见世界有多大。",
      type: "website",
      images: [{ url: `${origin}/og-v2.png`, width: 1672, height: 941, alt: "由AI持续生长的个人知识星图" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "星火档案｜个人知识宇宙",
      description: "让每一次好奇，都变成通向陌生领域的新航线。",
      images: [`${origin}/og-v2.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
