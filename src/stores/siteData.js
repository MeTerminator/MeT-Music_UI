// 站点数据
import { defineStore } from "pinia";
import {
  getUserPlaylist,
} from "@/api/user";

const useSiteDataStore = defineStore("siteData", {
  state: () => {
    return {
      // 搜索历史
      searchHistory: [],
      // 用户部分
      userLoginStatus: false,
      userData: {
        userId: null, // 用户 id
        detail: {}, // 基础信息
      },
      userLikeData: {
        playlists: [],
      },
      // 每日推荐
      dailySongsData: {
        timestamp: null, // 储存时间
        data: [], // 歌曲数据
      },
      // 歌单分类
      plCatList: {
        allCat: [], // 总分类
        catList: [], // 普通分类
        hqCatList: [], // 精品分类
      },
    };
  },
  getters: {},
  actions: {
    // 获取用户信息
    async setUserProfile() {
      try {
        if (this.userData.userId == null) return;
        const allUserLikeResult = [
          this.setUserLikePlaylists(),
        ];
        await Promise.all(allUserLikeResult);
      } catch (error) {
        showError(error, "用户信息加载失败");
      }
    },
    // 获取用户喜欢歌单
    async setUserLikePlaylists() {
      try {
        // 获取数据
        getUserPlaylist(this.userData.userId, 0).then((res) => {
          this.userLikeData.playlists = res.playlist;
          this.userData.detail = {
            "profile": {
              "nickname": res.username,
              "avatarUrl": res.avatarUrl
            }
          };
          this.userLoginStatus = true;
        });
      } catch (error) {
        showError(error, "用户喜欢歌单加载失败");
      }
    },
    // 设置 userId
    async setUserId(userId) {
      this.userData.userId = userId;
    },
  },
  // 数据持久化
  persist: [
    {
      key: "siteData",
      storage: localStorage,
    },
  ],
});

// 输出错误
const showError = (error, msg, show = true) => {
  console.error(msg, error);
  if (show && typeof $message !== "undefined") $message.error(msg);
};



export default useSiteDataStore;
