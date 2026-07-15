import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#070907" };

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "星火档案｜未完成问题的天球图",
      template: "%s｜星火档案",
    },
    description: "AI为每个陌生问题实时写出可操作的代码世界。探索100个领域，让知识从点、线、面生长成可以迁移的世界模型。",
    openGraph: {
      title: "星火档案｜未完成问题的天球图",
      description: "AI实时生成可操作的知识世界；探索100个领域，让点、线、面生长成你的世界模型。",
      type: "website",
      images: [{ url: `${origin}/og-v3.png`, width: 1536, height: 1024, alt: "星火档案个人知识宇宙" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "星火档案｜未完成问题的天球图",
      description: "AI实时生成可操作的知识世界；探索100个领域，让点、线、面生长成你的世界模型。",
      images: [`${origin}/og-v3.png`],
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
