// 站点设置
import { defineStore } from "pinia";

const useSiteSettingsStore = defineStore("siteSettings", {
  state: () => {
    return {
      // 基础配置
      closeTip: true, // 关闭软件提醒弹窗
      closeType: "hide", // 关闭方式 close 直接关闭 / hide 最小化到任务栏
      showTaskbarProgress: false, // 显示歌曲任务栏进度
      showSearchHistory: true, // 搜索历史
      showSider: true, // 显示侧边栏
      siderShowCover: true, // 侧边栏显示封面
      siteFont: 'harmony_reg',
      lyricFont: 'harmony_bold',
      // 主题部分
      themeType: "dark",
      themeAuto: true,
      themeTypeName: "green",
      themeTypeData: {},
      themeAutoCover: true, // 主题色跟随封面
      themeAutoCoverType: "secondary",
      // 播放部分
      html5Player: true, // 是否使用 HTML5 播放器
      playCoverType: "cover", // 播放器样式
      songLevel: "hq", // 歌曲音质
      autoPlay: false, // 程序启动时自动播放
      songVolumeFade: true, // 歌曲渐入渐出
      countDownShow: true, // 是否显示前奏等待
      bottomLyricShow: true, // 底栏歌词显示
      playerBackgroundType: "amllAnimation", // 播放器背景类别  animation 流动 / blur 模糊
      amllPlayerBackgroundFlowSpeed: 2, // AMLL 流动背景速度
      memorySeek: true, // 记忆上次播放位置
      playSearch: false, // 是否播放全部搜索结果
      showPlaylistCount: true, // 是否显示播放列表数量
      showSpectrums: true, // 是否显示音乐频谱
      useMusicCache: false, // 是否采用音乐缓存
      simulationPlaying: false, // 模拟播放
      // 数量部分
      loadSize: 100, // 每页加载数量
      searchLoadSize: 30, // 搜索结果加载数量
      // 歌词部分
      lyricsOffset: 0.4, // 歌词偏转
      lyricsAMOffset: 150, // Apple Music 歌词偏转
      lyricsAMEndTimeOffset: 250, // Apple Music 歌词提前切到下一行  仅对非 TTML 歌词有效
      lyricsAMttmlUseOffset: false, // Apple Music TMLL 歌词是否使用偏转
      lyricsHookOffset: 0.3, // Hook 歌词偏移
      useAMLyrics: true, // 使用 Apple Music 歌词
      useAMSpring: true, // 使用 Apple Music 物理效果弹簧歌词
      useAMScale: true, // 使用 Apple Music 歌词缩放
      useAMttmlDB: true, // 使用 Apple Music 歌词 特效歌词库
      removeInfo: false, // 去除歌曲信息
      removeAMInfo: true, // 去除 Apple Music 歌词歌曲信息
      lrcMousePause: true, // 鼠标移入歌词区域暂停滚动
      lyricsFontSize: 46, // 歌词大小
      lyricsBlur: false, // 歌词模糊
      showYrc: true, // 是否显示逐字歌词
      showYrcAnimation: true, // 是否显示逐字歌词动画
      lyricsPosition: "left", // 歌词位置
      lyricsBlock: "start", // 歌词滚动位置
      showTransl: true, // 是否显示歌词翻译
      showRoma: true, // 是否显示歌词音译
    };
  },
  getters: {},
  actions: {
    // 调整主题类别
    setThemeType(value) {
      this.themeType = value;
      this.themeAuto = false;
      $message.info(`已切换至${value === "light" ? "浅色" : "深色"}模式`, { showIcon: false });
    },
  },
  // 数据持久化
  persist: [
    {
      key: "siteSettings",
      storage: localStorage,
    },
  ],
});

export default useSiteSettingsStore;
