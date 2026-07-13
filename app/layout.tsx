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
      default: "星火档案",
      template: "%s｜星火档案",
    },
    description: "一款让你在知识宇宙中发现兴趣、提出问题的探索游戏。",
    openGraph: {
      title: "星火档案",
      description: "探索你尚未发现的兴趣",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "星火档案知识宇宙" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "星火档案",
      description: "探索你尚未发现的兴趣",
      images: [`${origin}/og.png`],
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
