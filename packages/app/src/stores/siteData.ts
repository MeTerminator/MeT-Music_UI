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
export interface AddedPlaylist {
  id: string;
  name: string;
  coverImgUrl?: string;
}

export interface SiteDataState {
  addedPlaylists: Record<Platform, AddedPlaylist[]>;
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
      addedPlaylists: { qq: [], netease: [] },
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

/** 登录前验证公开资料;空歌单合法,缺少用户昵称则不能确认账号存在。 */
const fetchPublicAccount = async (userId: number | string, platform: Platform) => {
  const res = await api.getUserPlaylist(userId, 1000, 0, platform);
  if (res.code !== 200 || !res.username?.trim()) {
    throw new Error("用户不存在或用户资料无效");
  }
  return res;
};

/** 获取用户喜欢歌单,与启动时账号检查共用验证流程。 */
export const setUserLikePlaylists = async (): Promise<void> => setUserProfile("qq");

/** 启动时重新验证已保存账号;失败时撤销该平台的登录状态。 */
export const setUserProfile = async (platform: Platform = "qq"): Promise<void> => {
  const getCurrentId = () => platform === "qq"
    ? useSiteDataStore.getState().userData.userId
    : useSiteDataStore.getState().neteaseAccount.userId;
  const uid = getCurrentId();
  if (uid == null) return;
  try {
    const res = await fetchPublicAccount(uid, platform);
    if (getCurrentId() !== uid) return;
    commitPublicAccount(uid, platform, res);
  } catch {
    if (getCurrentId() !== uid) return;
    logout(false, platform);
    toast.error("登录失效：用户不存在或用户信息请求失败，请重新登录");
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

/** 仅在请求及用户资料验证成功后提交登录状态。 */
const commitPublicAccount = (userId: number | string, platform: Platform, res: Awaited<ReturnType<typeof fetchPublicAccount>>): void => {
  const detail = { profile: { nickname: res.username, avatarUrl: res.avatarUrl } };
  if (platform === "netease") {
    useSiteDataStore.setState({ neteaseAccount: { userId, loggedIn: true, detail, playlists: res.playlist } });
  } else {
    useSiteDataStore.setState({ userData: { userId, detail }, userLoginStatus: true, userLikeData: { playlists: res.playlist } });
  }
};

export const loginPublicAccount = async (userId: string, platform: Platform): Promise<void> => {
  const res = await fetchPublicAccount(userId, platform);
  commitPublicAccount(userId, platform, res);
};
