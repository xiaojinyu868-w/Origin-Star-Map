import type { Metadata } from "next";
import { CuriosityGame } from "./game";

export const metadata: Metadata = {
  title: "星火档案｜让好奇心长成一片宇宙",
  description: "探索陌生领域、留下知识火种，让AI把每次好奇连接成一张持续生长的个人星图。",
};

export default function Home() {
  return <CuriosityGame />;
}
