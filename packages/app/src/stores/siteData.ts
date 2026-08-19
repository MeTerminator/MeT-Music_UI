import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@met/core";
import { toast } from "sonner";
import { legacyStorage } from "./persist";

/**
 * 站点数据。字段与旧 stores/siteData.js 一致(persist key "siteData")。
 */
export interface SiteDataState {
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

/** 设置 userId(旧 siteData.setUserId) */
export const setUserId = (userId: number | string): void => {
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
export const setUserProfile = async (): Promise<void> => {
  try {
    if (useSiteDataStore.getState().userData.userId == null) return;
    await Promise.all([setUserLikePlaylists()]);
  } catch (error) {
    console.error("用户信息加载失败", error);
    toast.error("用户信息加载失败");
  }
};
