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
      default: "星火档案｜未完成问题的天球图",
      template: "%s｜星火档案",
    },
    description: "一座只为你生长的夜间天文档案馆。观测陌生领域，让走过的问题慢慢成为星座。",
    openGraph: {
      title: "星火档案｜未完成问题的天球图",
      description: "观测陌生领域，让走过的问题慢慢成为星座。",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: "星火档案｜未完成问题的天球图",
      description: "观测陌生领域，让走过的问题慢慢成为星座。",
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
