import type { Page } from "@playwright/test";

/**
 * localStorage 种子(旧 pinia-plugin-persistedstate 裸对象格式,见 src/stores/persist.ts)。
 *
 * - siteSettings:仅写 simulationPlaying,其余字段由 zustand persist 浅合并默认值补齐,
 *   避免测试硬编码整份设置在 schema 演进时腐烂;
 * - musicData:两首种子歌曲(duration 为 "mm:ss",模拟播放引擎据此推进进度);
 * - siteStatus:仅写持久化白名单内会影响播放链路的字段(playIndex/playMode/playSongMode)。
 */

/** 与 @met/core Song 对齐的种子歌曲(coverSize 为空对象,规避 WebGL 封面背景与图床请求) */
export interface SeedSong {
  id: string;
  name: string;
  artists: { id: number; name: string }[];
  album: { name: string };
  duration: string;
  coverSize: Record<string, never>;
}

export const SEED_SONGS: SeedSong[] = [
  {
    id: "0039MnYb0qxYhV",
    name: "晴天",
    artists: [{ id: 0, name: "周杰伦" }],
    album: { name: "叶惠美" },
    duration: "04:29",
    coverSize: {},
  },
  {
    id: "003OUlho2HcRHC",
    name: "稻香",
    artists: [{ id: 0, name: "周杰伦" }],
    album: { name: "魔杰座" },
    duration: "03:43",
    coverSize: {},
  },
];

/** 播放链路种子:开启模拟播放并预置两首歌的播放列表 */
export const seedPlayback = async (page: Page): Promise<void> => {
  await page.addInitScript((songs: SeedSong[]) => {
    try {
      const emptyLyric = {
        hasLrcTran: false,
        hasLrcRoma: false,
        hasYrc: false,
        hasYrcTran: false,
        hasYrcRoma: false,
        lrc: [],
        yrc: [],
      };
      localStorage.setItem("siteSettings", JSON.stringify({ simulationPlaying: true }));
      localStorage.setItem(
        "musicData",
        JSON.stringify({
          playList: songs,
          playListOld: [],
          historyPlaylist: [],
          playSongData: songs[0],
          playSongSource: 0,
          playSongLyric: emptyLyric,
          localSongPath: [],
        }),
      );
      localStorage.setItem(
        "siteStatus",
        JSON.stringify({ playIndex: 0, playMode: "normal", playSongMode: "normal" }),
      );
    } catch {
      // about:blank 等无 storage 环境下忽略
    }
  }, SEED_SONGS);
};

/** 一起听种子:开启模拟播放(不产生真实音频)并预置非匿名身份,使昵称输入框可用 */
export const seedListenTogether = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("siteSettings", JSON.stringify({ simulationPlaying: true }));
      localStorage.setItem("listen_together_is_anonymous", "false");
    } catch {
      // 忽略
    }
  });
};

/** dev 调试出口的最小类型(src/main.tsx 挂载的 window.__debugStores) */
export interface DebugWindow {
  $MeTMusic_next?: () => void;
  __debugStores?: {
    music: {
      getState: () => Record<string, unknown>;
      setState: (partial: Record<string, unknown>) => void;
    };
    status: {
      getState: () => { playTimeData: { currentTime: number } };
      setState: (partial: Record<string, unknown>) => void;
    };
  };
}
