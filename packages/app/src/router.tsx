/**
 * 代码式路由表(TanStack Router,不使用文件式路由插件)。
 *
 * 结构逐条复刻旧 src/router/routes.js(27 条 hash 路由):
 * hash history 与旧 vue-router createWebHashHistory 一致(部署于 /app/ 子路径)。
 * 旧路由的 query 传参对应此处的宽松 validateSearch,不做严格校验:
 * 歌曲类深链旧契约为 ?mid=(idSearch 兼容映射为 id),搜索为 ?keywords=,
 * 下载页额外有 ?music_quality=。
 * search 序列化按纯字符串处理(见 parseSearch/stringifySearch),与旧 URL 形态一致。
 * document.title 已由宿主引擎托管,不做 meta.title 联动。
 */
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import RootLayout from "@/layout/RootLayout";
import Home from "@/pages/Home";
import History from "@/pages/History";
import VideosPlayer from "@/pages/VideosPlayer";
import Album from "@/pages/Album";
import ArtistLayout from "@/pages/artist/ArtistLayout";
import ArtistHot from "@/pages/artist/Hot";
import ArtistSongs from "@/pages/artist/Songs";
import ArtistAlbums from "@/pages/artist/Albums";
import ArtistVideos from "@/pages/artist/Videos";
import Setting from "@/pages/Setting";
import SongDetail from "@/pages/Song";
import Download from "@/pages/Download";
import Comments from "@/pages/Comments";
import ListenTogether from "@/pages/ListenTogether";
import TestPage from "@/pages/Test";
import NotFound from "@/pages/state/NotFound";
import Forbidden from "@/pages/state/Forbidden";
import ServerError from "@/pages/state/ServerError";
// —— 以下页面由并行任务实现;文件尚未落地时的 TS2307 属预期 ——
import SearchLayout from "@/pages/search/SearchLayout";
import SearchSongs from "@/pages/search/Songs";
import SearchArtists from "@/pages/search/Artists";
import SearchAlbums from "@/pages/search/Albums";
import SearchVideos from "@/pages/search/Videos";
import SearchPlaylists from "@/pages/search/Playlists";
import Playlist from "@/pages/list/Playlist";

/**
 * search 参数序列化:值全部按纯字符串处理(替代 TanStack Router 默认的
 * JSON parse/stringify)。效果:?id=123 读出 "123",String(id) 导航产出
 * ?id=123(与旧 vue-router 的 URL 形态一致),react-query 的 queryKey 不再
 * 因 123/"123" 双形态分裂。本仓 search 值不使用数组/对象场景。
 */
const parseSearch = (searchStr: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(searchStr)) {
    result[key] = value;
  }
  return result;
};

const stringifySearch = (search: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
};

/** 宽松 search 参数:?id=(旧歌曲深链契约为 ?mid=,此处兼容映射) */
const idSearch = (search: Record<string, unknown>): { id?: string } => ({
  id: (search.id ?? search.mid) as string | undefined,
});

/** /download 专用:在 idSearch 基础上额外透传 ?music_quality=(旧深链契约) */
const downloadSearch = (
  search: Record<string, unknown>,
): { id?: string; music_quality?: string } => ({
  id: (search.id ?? search.mid) as string | undefined,
  music_quality: search.music_quality as string | undefined,
});

/** 宽松 search 参数:?keywords=(旧 query.keywords) */
const keywordsSearch = (search: Record<string, unknown>): { keywords?: string } => ({
  keywords: search.keywords as string | undefined,
});

/** 分页子路由:?page= 透传(旧 query.page 契约;字符串宽松,页面侧 parseInt 容错) */
const pageSearch = (search: Record<string, unknown>): { page?: string } => ({
  page: search.page as string | undefined,
});

// __root
const rootRoute = createRootRoute({
  component: RootLayout,
});

// 首页 /
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

// 搜索 /search(重定向 /search/songs,子路由 songs/artists/albums/videos/playlists)
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchLayout,
  validateSearch: keywordsSearch,
});
const searchIndexRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "/",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/search/songs", search });
  },
});
const searchSongsRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "songs",
  component: SearchSongs,
  validateSearch: pageSearch,
});
const searchArtistsRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "artists",
  component: SearchArtists,
  validateSearch: pageSearch,
});
const searchAlbumsRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "albums",
  component: SearchAlbums,
  validateSearch: pageSearch,
});
const searchVideosRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "videos",
  component: SearchVideos,
  validateSearch: pageSearch,
});
const searchPlaylistsRoute = createRoute({
  getParentRoute: () => searchRoute,
  path: "playlists",
  component: SearchPlaylists,
  validateSearch: pageSearch,
});

// 视频播放 /videos-player
const videosPlayerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/videos-player",
  component: VideosPlayer,
  validateSearch: idSearch,
});

// 最近播放 /history
const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: History,
});

// 歌单 /playlist
const playlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/playlist",
  component: Playlist,
  validateSearch: idSearch,
});

// 歌单 - 用户喜欢 /like-songs(与 /playlist 共用组件)
const likeSongsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/like-songs",
  component: Playlist,
  validateSearch: idSearch,
});

// 专辑 /album
const albumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/album",
  component: Album,
  validateSearch: idSearch,
});

// 歌手 /artist(重定向 /artist/hot,子路由 hot/songs/albums/videos)
const artistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/artist",
  component: ArtistLayout,
  validateSearch: idSearch,
});
const artistIndexRoute = createRoute({
  getParentRoute: () => artistRoute,
  path: "/",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/artist/hot", search });
  },
});
const artistHotRoute = createRoute({
  getParentRoute: () => artistRoute,
  path: "hot",
  component: ArtistHot,
});
const artistSongsRoute = createRoute({
  getParentRoute: () => artistRoute,
  path: "songs",
  component: ArtistSongs,
  validateSearch: pageSearch,
});
const artistAlbumsRoute = createRoute({
  getParentRoute: () => artistRoute,
  path: "albums",
  component: ArtistAlbums,
  validateSearch: pageSearch,
});
const artistVideosRoute = createRoute({
  getParentRoute: () => artistRoute,
  path: "videos",
  component: ArtistVideos,
  validateSearch: pageSearch,
});

// 全局设置 /setting
const settingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setting",
  component: Setting,
});

// 歌曲详情 /song
const songRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/song",
  component: SongDetail,
  validateSearch: idSearch,
});

// 歌曲下载 /download
const downloadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/download",
  component: Download,
  validateSearch: downloadSearch,
});

// 歌曲评论 /comments
const commentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comments",
  component: Comments,
  validateSearch: idSearch,
});

// 一起听歌 /listen-together
const listenTogetherRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/listen-together",
  component: ListenTogether,
});

// 测试页面 /test
const testRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/test",
  component: TestPage,
});

// 状态页 /404 /403 /500
const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/404",
  component: NotFound,
});
const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/403",
  component: Forbidden,
});
const serverErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/500",
  component: ServerError,
});

// 通配 → /404(旧 /:pathMatch(.*) redirect)
const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/404" });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  searchRoute.addChildren([
    searchIndexRoute,
    searchSongsRoute,
    searchArtistsRoute,
    searchAlbumsRoute,
    searchVideosRoute,
    searchPlaylistsRoute,
  ]),
  videosPlayerRoute,
  historyRoute,
  playlistRoute,
  likeSongsRoute,
  albumRoute,
  artistRoute.addChildren([
    artistIndexRoute,
    artistHotRoute,
    artistSongsRoute,
    artistAlbumsRoute,
    artistVideosRoute,
  ]),
  settingRoute,
  songRoute,
  downloadRoute,
  commentsRoute,
  listenTogetherRoute,
  testRoute,
  notFoundRoute,
  forbiddenRoute,
  serverErrorRoute,
  catchAllRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  parseSearch,
  stringifySearch,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
