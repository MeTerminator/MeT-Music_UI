import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type Platform } from "@met/core";
import { toast } from "sonner";
import { legacyStorage } from "./persist";

/**
 * 站点数据。字段与旧 stores/siteData.js 一致(persist key "siteData")。
 */
export interface PlatformAccount {
  userId: number | string | null;
  loggedIn: boolean;
  detail: Record<string, unknown>;
  playlists: unknown[];
}
export interface SiteDataState {
  neteaseAccount: PlatformAccount;
  searchHistory: string[];
  userLoginStatus: boolean;
  userData: {
    userId: number | string | null;
    detail: Record<string, unknown>;
  };
  userLikeData: {
    playlists: unknown[];
  };
  dailySongsData: {
    timestamp: number | null;
    data: unknown[];
  };
  plCatList: {
    allCat: unknown[];
    catList: unknown[];
    hqCatList: unknown[];
  };
}

export const useSiteDataStore = create<SiteDataState>()(
  persist(
    (): SiteDataState => ({
      neteaseAccount: { userId: null, loggedIn: false, detail: {}, playlists: [] },
      searchHistory: [] as string[],
      userLoginStatus: false,
      userData: {
        userId: null as number | string | null,
        detail: {} as Record<string, unknown>,
      },
      userLikeData: {
        playlists: [] as unknown[],
      },
      dailySongsData: {
        timestamp: null as number | null,
        data: [] as unknown[],
      },
      plCatList: {
        allCat: [] as unknown[],
        catList: [] as unknown[],
        hqCatList: [] as unknown[],
      },
    }),
    {
      name: "siteData",
      storage: legacyStorage(),
    },
  ),
);

/** 清空搜索历史(旧 SearchHot.vue delSearchHistory 确认后 searchHistory = []) */
export const clearSearchHistory = (): void => {
  useSiteDataStore.setState({ searchHistory: [] });
};

/** 设置 userId(旧 siteData.setUserId) */
export const setUserId = (userId: number | string, platform: Platform = "qq"): void => {
  if (platform === "netease") {
    useSiteDataStore.setState(s => ({ neteaseAccount: { ...s.neteaseAccount, userId } }));
    return;
  }
  useSiteDataStore.setState((s) => ({ userData: { ...s.userData, userId } }));
};

/** 获取用户喜欢歌单(旧 siteData.setUserLikePlaylists) */
export const setUserLikePlaylists = async (): Promise<void> => {
  try {
    const { userId } = useSiteDataStore.getState().userData;
    if (userId == null) return;
    const res = await api.getUserPlaylist(userId, 0);
    useSiteDataStore.setState((s) => ({
      userLikeData: { ...s.userLikeData, playlists: res.playlist },
      userData: {
        ...s.userData,
        detail: {
          profile: {
            nickname: res.username,
            avatarUrl: res.avatarUrl,
          },
        },
      },
      userLoginStatus: true,
    }));
  } catch (error) {
    console.error("用户喜欢歌单加载失败", error);
    toast.error("用户喜欢歌单加载失败");
  }
};

/** 获取用户信息(旧 siteData.setUserProfile) */
export const setUserProfile = async (platform: Platform = "qq"): Promise<void> => {
  if (platform === "netease") {
    const uid = useSiteDataStore.getState().neteaseAccount.userId;
    if (uid == null) return;
    try {
      const res = await api.getUserPlaylist(uid, 1000, 0, "netease");
      if (useSiteDataStore.getState().neteaseAccount.userId !== uid) return;
      useSiteDataStore.setState({ neteaseAccount: { userId: uid, loggedIn: true, detail: { profile: { nickname: res.username, avatarUrl: res.avatarUrl } }, playlists: res.playlist } });
    } catch {
      toast.error("网易云用户信息加载失败");
    }
    return;
  }
  try {
    if (useSiteDataStore.getState().userData.userId == null) return;
    await Promise.all([setUserLikePlaylists()]);
  } catch (error) {
    console.error("用户信息加载失败", error);
    toast.error("用户信息加载失败");
  }
};

/**
 * 退出登录(旧 utils/auth.toLogout):清空 userData / userLikeData / userLoginStatus。
 * 启动时的自动登录检查(旧 Login.vue onBeforeMount 的 checkLoginStatus)
 * 由 components/user/UserPanel 挂载时调用 setUserProfile() 完成。
 */
export const logout = (show = true, platform: Platform = "qq"): void => {
  if (platform === "netease") {
    useSiteDataStore.setState({ neteaseAccount: { userId: null, loggedIn: false, detail: {}, playlists: [] } });
    if (show) toast.success("成功退出网易云音乐账号");
    return;
  }
  useSiteDataStore.setState({
    userLoginStatus: false,
    userData: { userId: null, detail: {} },
    userLikeData: { playlists: [] },
  });
  if (show) toast.success("成功退出登录");
};

/** Public account lookup commits only after success, preserving the other platform. */
export const loginPublicAccount = async (userId: string, platform: Platform): Promise<void> => {
  const res = await api.getUserPlaylist(userId, 1000, 0, platform);
  const detail = { profile: { nickname: res.username, avatarUrl: res.avatarUrl } };
  if (platform === "netease") {
    useSiteDataStore.setState({ neteaseAccount: { userId, loggedIn: true, detail, playlists: res.playlist } });
  } else {
    useSiteDataStore.setState({ userData: { userId, detail }, userLoginStatus: true, userLikeData: { playlists: res.playlist } });
  }
};
