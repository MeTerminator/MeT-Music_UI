// 音乐数据
import { defineStore } from "pinia";
import { siteStatus } from "@/stores";

const useMusicDataStore = defineStore("musicData", {
  state: () => {
    return {
      // 播放列表
      playList: [],
      playListOld: [],
      historyPlaylist: [],
      // 当前歌曲数据
      playSongData: {},
      // 当前歌曲来源
      playSongSource: 0,
      // 当前歌曲歌词数据
      playSongLyric: {
        // 是否具有普通翻译
        hasLrcTran: false,
        // 是否具有普通音译
        hasLrcRoma: false,
        // 是否具有逐字歌词
        hasYrc: false,
        // 是否具有逐字翻译
        hasYrcTran: false,
        // 是否具有逐字音译
        hasYrcRoma: false,
        // 普通歌词数组
        lrc: [],
        // 逐字歌词数据
        yrc: [],
      },
      // 本地歌曲目录
      localSongPath: [],
    };
  },
  getters: {
    // 获取当前播放歌曲
    getPlaySongData(state) {
      const status = siteStatus();
      return status.playMode === "fm" && state.privateFmSong
        ? state.privateFmSong
        : state.playSongData;
    },
  },
  actions: {
    // 更改播放历史
    setPlayHistory(data, clean = false) {
      if (clean) {
        this.historyPlaylist = [];
      } else {
        const index = this.historyPlaylist.findIndex((item) => item?.id === data?.id);
        if (index !== -1) {
          this.historyPlaylist.splice(index, 1);
        }
        // 只有在数据存在时才进行插入操作
        if (data && Object.keys(data).length > 0) {
          // 如果数组为空，则直接插入
          if (this.historyPlaylist.length === 0) {
            this.historyPlaylist.push(data);
          } else {
            // 避免插入重复数据
            const existingIndex = this.historyPlaylist.findIndex((item) => item?.id === data?.id);
            if (existingIndex === -1) {
              // 在数组头部插入数据
              this.historyPlaylist.unshift(data);
              // 限制历史记录长度为 500
              if (this.historyPlaylist.length > 500) {
                this.historyPlaylist.pop();
              }
            }
          }
        }
      }
    },
  },
  // 数据持久化
  persist: [
    {
      key: "musicData",
      storage: localStorage,
    },
  ],
});

export default useMusicDataStore;
