import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#080907" };

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
    description: "在100个领域里各带走一个提问起点，让AI把走过的知识连成你的个人星座。",
    openGraph: {
      title: "星火档案｜未完成问题的天球图",
      description: "探索100个领域，让AI把走过的知识连成你的个人星座。",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "星火档案｜未完成问题的天球图",
      description: "探索100个领域，让AI把走过的知识连成你的个人星座。",
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
