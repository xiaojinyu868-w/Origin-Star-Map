import type { Metadata } from "next";
import { CuriosityGame } from "./game";

export const metadata: Metadata = {
  title: "星火档案｜AI此刻正在写下世界规律",
  description: "每颗星球都由AI即时生成。用六次自由实验，破解一条从未存在过的世界规律。",
};

export default function Home() {
  return <CuriosityGame />;
}
