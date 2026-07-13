import type { Metadata } from "next";
import { CuriosityGame } from "./game";

export const metadata: Metadata = {
  title: "星火档案｜探索你尚未发现的兴趣",
  description:
    "驾驶火种号穿越知识宇宙，在谜题中点亮属于你的好奇心星图。",
};

export default function Home() {
  return <CuriosityGame />;
}
