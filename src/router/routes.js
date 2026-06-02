const routes = [
  // 首页
  {
    path: "/",
    name: "home",
    meta: {
      title: "主页",
    },
    component: () => import("@/views/Home.vue"),
  },
  // 搜索
  {
    path: "/search",
    name: "search",
    meta: {
      title: "搜索",
    },
    component: () => import("@/views/Search/index.vue"),
    redirect: "/search/songs",
    children: [
      {
        path: "songs",
        name: "sea-songs",
        component: () => import("@/views/Search/songs.vue"),
      },
      {
        path: "artists",
        name: "sea-artists",
        component: () => import("@/views/Search/artists.vue"),
      },
      {
        path: "albums",
        name: "sea-albums",
        component: () => import("@/views/Search/albums.vue"),
      },
      {
        path: "videos",
        name: "sea-videos",
        component: () => import("@/views/Search/videos.vue"),
      },
      {
        path: "playlists",
        name: "sea-playlists",
        component: () => import("@/views/Search/playlists.vue"),
      },
    ],
  },
  // 视频播放
  {
    path: "/videos-player",
    name: "videos-player",
    meta: {
      title: "视频播放器",
    },
    component: () => import("@/views/Player.vue"),
  },
  // 最近播放
  {
    path: "/history",
    name: "history",
    meta: {
      title: "最近播放",
    },
    component: () => import("@/views/History.vue"),
  },
  // 歌单
  {
    path: "/playlist",
    name: "playlist",
    meta: {
      title: "歌单",
    },
    component: () => import("@/views/List/playlist.vue"),
  },
  // 歌单 - 用户喜欢
  {
    path: "/like-songs",
    name: "like-songs",
    meta: {
      title: "歌单",
      needLogin: true,
    },
    component: () => import("@/views/List/playlist.vue"),
  },
  // 专辑
  {
    path: "/album",
    name: "album",
    meta: {
      title: "歌单",
    },
    component: () => import("@/views/List/album.vue"),
  },
  // 歌手
  {
    path: "/artist",
    name: "artist",
    meta: {
      title: "歌手",
    },
    component: () => import("@/views/Artist/index.vue"),
    redirect: "/artist/hot",
    children: [
      {
        path: "hot",
        name: "ar-hot",
        component: () => import("@/views/Artist/hot.vue"),
      },
      {
        path: "songs",
        name: "ar-songs",
        component: () => import("@/views/Artist/songs.vue"),
      },
      {
        path: "albums",
        name: "ar-albums",
        component: () => import("@/views/Artist/albums.vue"),
      },
      {
        path: "videos",
        name: "ar-videos",
        component: () => import("@/views/Artist/videos.vue"),
      },
    ],
  },
  // 全局设置
  {
    path: "/setting",
    name: "setting",
    meta: {
      title: "全局设置",
    },
    component: () => import("@/views/Setting/index.vue"),
  },
  // 歌曲详情
  {
    path: "/song",
    name: "song",
    meta: {
      title: "歌曲详情",
    },
    component: () => import("@/views/SongDetail.vue"),
  },
  // 歌曲下载
  {
    path: "/download",
    name: "download",
    meta: {
      title: "歌曲下载",
    },
    component: () => import("@/views/Download.vue"),
  },
  // 歌曲评论
  {
    path: "/comments",
    name: "comments",
    meta: {
      title: "歌曲评论",
    },
    component: () => import("@/views/Comments.vue"),
  },
  // 一起听歌
  {
    path: "/listen-together",
    name: "listen-together",
    meta: {
      title: "一起听歌",
    },
    component: () => import("@/views/ListenTogether.vue"),
  },
  // 测试页面
  {
    path: "/test",
    name: "test",
    meta: {
      title: "测试页面",
    },
    component: () => import("@/views/Test.vue"),
  },
  // 状态页
  {
    path: "/404",
    name: "404",
    meta: {
      title: "404",
    },
    component: () => import("@/views/State/404.vue"),
  },
  {
    path: "/403",
    name: "403",
    meta: {
      title: "403",
    },
    component: () => import("@/views/State/403.vue"),
  },
  {
    path: "/500",
    name: "500",
    meta: {
      title: "500",
    },
    component: () => import("@/views/State/500.vue"),
  },
  {
    path: "/:pathMatch(.*)",
    redirect: "/404",
  },
];

export default routes;
