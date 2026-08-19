import { getGreetings } from "@met/core";

/** 主页(U2 骨架:问候语 + 说明;推荐内容将在 U3 迁移) */
const Home = () => (
  <div className="px-8 py-10">
    <h1 className="text-3xl font-bold text-[var(--met-fg)]">{getGreetings()}</h1>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--met-fg-dim)]">
      欢迎使用 MeT Music。当前为 React 重写的路由骨架阶段(U2),
      个性化推荐、排行榜等主页内容将在 U3 阶段迁移完成。
      可以先试试顶部的全局搜索,或从左侧进入最近播放。
    </p>
  </div>
);

export default Home;
