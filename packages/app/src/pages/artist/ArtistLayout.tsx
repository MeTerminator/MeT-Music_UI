import { Outlet } from "@tanstack/react-router";

/** 歌手页布局(U2 骨架:仅承载子路由 Outlet;头部与 tab 导航在 U3 迁移) */
const ArtistLayout = () => (
  <div className="flex h-full flex-col">
    <div className="min-h-0 flex-1">
      <Outlet />
    </div>
  </div>
);

export default ArtistLayout;
