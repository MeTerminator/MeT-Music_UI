import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Heart, ListMusic, LogOut } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCoverUrl } from "@/lib/formatData";
import { logout, setUserProfile, useSiteDataStore } from "@/stores/siteData";
import LoginDialog from "./LoginDialog";

/** 用户歌单原始字段(对照旧 Menu.vue 的消费:id / name / coverImgUrl) */
interface RawUserPlaylist {
  id: number | string;
  name: string;
  coverImgUrl?: string;
}

/** 用户信息 detail(对照旧 setUserLikePlaylists 写入的 profile 结构) */
interface UserDetail {
  profile?: {
    nickname?: string;
    avatarUrl?: string;
  };
}

const rowCls =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left " +
  "text-sm text-[var(--met-fg)] transition-colors hover:bg-[var(--met-bg-hover)]";

/**
 * 侧栏用户面板(旧 Modal/Login.vue 登录入口 + Global/Menu.vue 用户歌单分组)。
 * 挂载约定:default export、无 props,由侧栏(RootLayout)直接渲染;
 * 纵向布局,窄空间友好,歌单列表区域自带 overflow-y-auto。
 */
export default function UserPanel() {
  const navigate = useNavigate();
  const userLoginStatus = useSiteDataStore((s) => s.userLoginStatus);
  const userId = useSiteDataStore((s) => s.userData.userId);
  const detail = useSiteDataStore((s) => s.userData.detail) as UserDetail;
  const playlists = useSiteDataStore(
    (s) => s.userLikeData.playlists,
  ) as RawUserPlaylist[];

  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);

  // 启动时检查登录状态(旧 Login.vue onBeforeMount 的 checkLoginStatus):
  // userId 非空则自动拉取用户信息
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const { userId: uid } = useSiteDataStore.getState().userData;
    if (uid != null && uid !== "") void setUserProfile();
  }, []);

  // 未登录:登录入口
  if (!userLoginStatus) {
    return (
      <div className="flex flex-col gap-2 px-2 py-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setLoginOpen(true)}>
          登录
        </Button>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  const nickname = detail.profile?.nickname ?? "未知用户名";
  const avatarUrl =
    detail.profile?.avatarUrl || `https://q1.qlogo.cn/g?b=qq&nk=${userId ?? ""}&s=100`;
  // 「我喜欢」歌单(对照旧 playlist.vue:playlists[0] 即喜欢的音乐)
  const likePlaylist = playlists[0];
  // 创建的歌单(对照旧 Menu.vue:slice(1))
  const userPlaylists = playlists.slice(1);

  return (
    <div className="flex min-h-0 flex-col px-2 py-2">
      {/* 用户信息 + 退出 */}
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <img
          src={avatarUrl}
          alt="头像"
          className="h-8 w-8 shrink-0 rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] object-cover"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--met-fg)]" title={nickname}>
          {nickname}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-[var(--met-fg-dim)]"
          title="退出登录"
          onClick={() => setLogoutOpen(true)}
        >
          <LogOut size={15} />
        </Button>
      </div>

      {/* 喜欢的音乐(置顶,跳 /like-songs) */}
      {likePlaylist ? (
        <button
          type="button"
          className={rowCls}
          onClick={() => void navigate({ to: "/like-songs" })}
        >
          <Heart size={16} className="shrink-0 text-[var(--met-primary)]" />
          <span className="min-w-0 flex-1 truncate">喜欢的音乐</span>
        </button>
      ) : null}

      {/* 我的歌单(可折叠) */}
      <button
        type="button"
        className="mt-1 flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs text-[var(--met-fg-dim)] transition-colors hover:bg-[var(--met-bg-hover)]"
        onClick={() => setListOpen((v) => !v)}
      >
        <span>我的歌单</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${listOpen ? "" : "-rotate-90"}`}
        />
      </button>
      {listOpen ? (
        <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {userPlaylists.length ? (
            userPlaylists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                className={rowCls}
                title={pl.name}
                onClick={() =>
                  void navigate({ to: "/playlist", search: { id: String(pl.id) } })
                }
              >
                {pl.coverImgUrl ? (
                  <img
                    src={getCoverUrl(pl.coverImgUrl, 100)}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-md bg-[var(--met-bg-elevated)] object-cover"
                  />
                ) : (
                  <ListMusic size={16} className="shrink-0 text-[var(--met-fg-dim)]" />
                )}
                <span className="min-w-0 flex-1 truncate">{pl.name}</span>
              </button>
            ))
          ) : (
            <span className="px-2 py-1.5 text-xs text-[var(--met-fg-dim)]">暂无歌单</span>
          )}
        </div>
      ) : null}

      {/* 退出登录二次确认(旧 Login.vue 的 $dialog.warning) */}
      <Dialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="退出登录"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setLogoutOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setLogoutOpen(false);
                logout();
              }}
            >
              登出
            </Button>
          </>
        }
      >
        确认退出当前用户登录？
      </Dialog>
    </div>
  );
}
