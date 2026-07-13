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
    description: "AI即时生成隐藏规律。你有六次自由行动，通过实验破解一个从未存在过的世界。",
    openGraph: {
      title: "星火档案",
      description: "AI此刻正在写下世界规律",
      type: "website",
      images: [{ url: `${origin}/og-v2.png`, width: 1672, height: 941, alt: "AI正在生成星火档案中的新世界" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "星火档案",
      description: "AI此刻正在写下世界规律",
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
