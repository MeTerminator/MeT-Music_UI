import { api, platformName, type Platform } from "@met/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { ChevronDown, Heart, ListMusic, LogIn, LogOut, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/menu";
import { getCoverUrl } from "@/lib/formatData";
import { logout, setUserProfile, useSiteDataStore } from "@/stores/siteData";
import { useMusicStore } from "@/stores/music";
import { useSettingsStore } from "@/stores/settings";
import LoginDialog from "./LoginDialog";
import { toast } from "sonner";
import PlatformIcon from "@/components/PlatformIcon";

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

/**
 * 数字滚动动画(mount 时 0→N,300ms;对照旧 Nav/UserData.vue 的
 * NNumberAnimation 意图的 requestAnimationFrame 简版)。
 */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value <= 0) {
      setDisplay(0);
      return;
    }
    const duration = 300;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(value * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="text-sm font-semibold tabular-nums text-[var(--met-fg)]">{display}</span>;
}

/** 歌单行样式;active = 当前路由正在展示该歌单(高亮) */
const rowCls = (active: boolean) =>
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left " +
  "text-sm transition-colors " +
  (active
    ? "bg-[var(--met-bg-elevated)] font-semibold text-[var(--met-primary)]"
    : "text-[var(--met-fg)] hover:bg-[var(--met-bg-hover)]");

/**
 * 侧栏用户面板(旧 Modal/Login.vue 登录入口 + Global/Menu.vue 用户歌单分组)。
 * 挂载约定:default export、无 props,由侧栏(RootLayout)直接渲染;
 * 纵向布局,窄空间友好,歌单列表区域自带 overflow-y-auto。
 */
function AccountPanel({ compact = false, platform }: { compact?: boolean; platform: Platform }) {
  const navigate = useNavigate();
  const userLoginStatus = useSiteDataStore((s) => platform === "qq" ? s.userLoginStatus : s.neteaseAccount.loggedIn);
  const userId = useSiteDataStore((s) => platform === "qq" ? s.userData.userId : s.neteaseAccount.userId);
  const detail = useSiteDataStore((s) => platform === "qq" ? s.userData.detail : s.neteaseAccount.detail) as UserDetail;
  const playlists = useSiteDataStore(
    (s) => platform === "qq" ? s.userLikeData.playlists : s.neteaseAccount.playlists,
  ) as RawUserPlaylist[];
  const addedPlaylists = useSiteDataStore((s) => s.addedPlaylists[platform]);
  // 统计:最近播放数(对照旧 Nav/UserData.vue 统计区的 historyPlaylist)
  const historyCount = useMusicStore((s) => s.historyPlaylist.length);
  // 歌单行封面/图标双模式(对照旧 Menu.vue 消费 siderShowCover)
  const siderShowCover = useSettingsStore((s) => s.siderShowCover);

  // 当前路由高亮:/playlist?id=xx 高亮对应歌单行,/like-songs 高亮「喜欢的音乐」
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false }) as { id?: string };
  const activePlaylistId = pathname === "/playlist" && ((search as { platform?: Platform }).platform ?? "qq") === platform ? search.id : undefined;
  const likeActive = pathname === "/like-songs" && ((search as { platform?: Platform }).platform ?? "qq") === platform;

  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [playlistId, setPlaylistId] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const addPlaylist = async () => {
    if (addingRef.current) return;
    const id = playlistId.trim();
    if (!/^\d+$/.test(id)) {
      toast.error("请输入有效的数字歌单 ID");
      return;
    }
    const exists = (value: string) => {
      const state = useSiteDataStore.getState();
      const owned = platform === "qq" ? state.userLikeData.playlists : state.neteaseAccount.playlists;
      return [...owned as RawUserPlaylist[], ...state.addedPlaylists[platform]].some(pl => String(pl.id) === value);
    };
    if (exists(id)) {
      toast.info("该歌单已在列表中");
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      const { playlist } = await api.getPlayListDetail(id, platform);
      if (playlist.id == null || !playlist.name) throw new Error("歌单不存在或无法访问");
      const resolvedId = String(playlist.id);
      if (exists(resolvedId)) {
        toast.info("该歌单已在列表中");
        return;
      }
      useSiteDataStore.setState(state => ({ addedPlaylists: {
        ...state.addedPlaylists,
        [platform]: [...state.addedPlaylists[platform], {
          id: resolvedId, name: playlist.name!, coverImgUrl: playlist.coverImgUrl ?? undefined,
        }],
      } }));
      setListOpen(true);
      setAddOpen(false);
      setPlaylistId("");
      toast.success("歌单已添加");
    } catch {
      toast.error("添加失败，请检查歌单 ID 和访问权限后重试");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  // 启动时检查登录状态(旧 Login.vue onBeforeMount 的 checkLoginStatus):
  // userId 非空则自动拉取用户信息
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const state = useSiteDataStore.getState();
    const uid = platform === "qq" ? state.userData.userId : state.neteaseAccount.userId;
    if (uid != null && uid !== "") void setUserProfile(platform);
  }, []);

  // 未登录:登录入口(窄栏 compact 用圆形图标钮,避免两字竖排挤压)
  if (!userLoginStatus) {
    return (
      <div
        className={`flex flex-col gap-2 py-2 ${
          compact ? "h-full items-center justify-end px-0" : "px-2"
        }`}
      >
        {compact ? (
          <button
            type="button"
            title={`登录${platformName(platform)}`}
            aria-label={`登录${platformName(platform)}`}
            onClick={() => setLoginOpen(true)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--met-border)] text-[var(--met-fg-dim)] transition-colors hover:border-[var(--met-primary)] hover:text-[var(--met-primary)]"
          >
            <PlatformIcon platform={platform} />
          </button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setLoginOpen(true)}
          >
            <LogIn className="h-4 w-4" aria-hidden />
            登录{platformName(platform)}
          </Button>
        )}
        <LoginDialog initialPlatform={platform} open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  const nickname = detail.profile?.nickname ?? "未知用户名";
  const avatarUrl =
    detail.profile?.avatarUrl || `https://q1.qlogo.cn/g?b=qq&nk=${userId ?? ""}&s=100`;
  // 「我喜欢」歌单(对照旧 playlist.vue:playlists[0] 即喜欢的音乐)
  const likePlaylist = playlists[0];
  // 创建的歌单(对照旧 Menu.vue:slice(1))
  const userPlaylists = [...playlists.slice(1), ...addedPlaylists.filter(pl => !playlists.some(owned => String(owned.id) === pl.id))];
  const addDialog = (
    <Dialog open={addOpen} onOpenChange={open => { if (!adding) setAddOpen(open); }} title={`添加${platformName(platform)}歌单`}
      footer={<>
        <Button variant="outline" size="sm" disabled={adding} onClick={() => setAddOpen(false)}>取消</Button>
        <Button size="sm" type="submit" form={`add-playlist-${platform}`} disabled={adding || !playlistId.trim()}>{adding ? "添加中…" : "添加"}</Button>
      </>}
    >
      <form id={`add-playlist-${platform}`} onSubmit={event => { event.preventDefault(); void addPlaylist(); }}>
        <label htmlFor={`playlist-id-${platform}`} className="mb-2 block">歌单 ID</label>
        <input id={`playlist-id-${platform}`} value={playlistId} onChange={event => setPlaylistId(event.target.value)} inputMode="numeric" autoFocus disabled={adding}
          placeholder="请输入歌单 ID" className="w-full rounded-lg border border-[var(--met-border)] bg-[var(--met-bg)] px-3 py-2 outline-none focus:border-[var(--met-primary)]" />
      </form>
    </Dialog>
  );

  // 退出登录二次确认(旧 Login.vue 的 $dialog.warning;compact/完整两形态共用)
  const logoutDialog = (
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
              logout(true, platform);
            }}
          >
            登出
          </Button>
        </>
      }
    >
      确认退出当前用户登录？
    </Dialog>
  );

  // 已登录 + 窄轨:纵向图标列(头像点开退出确认;喜欢/歌单仅图标,title 提示名称),
  // 完整面板的文字信息在窄轨宽度下会逐字竖排挤压,故整体收纳为图标形态
  if (compact) {
    const compactCls = (active: boolean) =>
      "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors " +
      (active
        ? "bg-[var(--met-bg-elevated)] text-[var(--met-primary)]"
        : "text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]");
    // 沉底布局:头像最底,喜欢/歌单自下而上堆叠(justify-end + 渲染序倒置)
    return (
      <div className="flex h-full flex-col items-center justify-end gap-1.5 py-2">
        {/* 我的歌单:封面平铺在窄轨里难辨认,收进折叠菜单(封面 + 标题行) */}
        {userPlaylists.length > 0 && (
          <DropdownMenu
            side="right"
            align="start"
            title="我的歌单"
            ariaLabel="我的歌单"
            triggerClassName={compactCls(
              userPlaylists.some((pl) => activePlaylistId === String(pl.id)),
            )}
            items={userPlaylists.map((pl) => ({
              key: String(pl.id),
              label: (
                <span className="flex min-w-0 items-center gap-2">
                  {siderShowCover && pl.coverImgUrl ? (
                    <img
                      src={getCoverUrl(pl.coverImgUrl, 90)}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-md bg-[var(--met-bg)] object-cover"
                    />
                  ) : (
                    <ListMusic size={16} className="shrink-0 text-[var(--met-fg-dim)]" aria-hidden />
                  )}
                  <span className="max-w-44 truncate">{pl.name}</span>
                </span>
              ),
              onSelect: () =>
                void navigate({ to: "/playlist", search: { platform, id: String(pl.id) } }),
            }))}
          >
            <ListMusic size={18} aria-hidden />
          </DropdownMenu>
        )}
        {likePlaylist ? (
          <button
            type="button"
            title="喜欢的音乐"
            className={compactCls(likeActive)}
            onClick={() => void navigate({ to: "/like-songs", search: { platform, id: String(likePlaylist.id) } })}
          >
            {/* 颜色随 compactCls 走(非激活 dim/激活主题色),与 rail 导航项一致 */}
            <Heart size={18} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          title={`${nickname}(点击退出登录)`}
          className="cursor-pointer"
          onClick={() => setLogoutOpen(true)}
        >
          <img
            src={avatarUrl}
            alt="头像"
            className="h-9 w-9 rounded-full border border-[var(--met-border)] bg-[var(--met-bg-elevated)] object-cover"
          />
        </button>
        {logoutDialog}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col px-2 py-2">
      <div className="px-2 text-xs text-[var(--met-fg-dim)]">{platformName(platform)}</div>
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

      {/* 数量统计(对照旧 Nav/UserData.vue 统计区:歌单 / 播放) */}
      <div className="mb-1 flex items-center gap-5 px-2 py-1">
        <div className="flex flex-col">
          <AnimatedNumber value={playlists.length + userPlaylists.length - playlists.slice(1).length} />
          <span className="text-xs text-[var(--met-fg-dim)]">歌单</span>
        </div>
        <div className="flex flex-col">
          <AnimatedNumber value={historyCount} />
          <span className="text-xs text-[var(--met-fg-dim)]">播放</span>
        </div>
      </div>

      {/* 喜欢的音乐(置顶,跳 /like-songs) */}
      {likePlaylist ? (
        <button
          type="button"
          className={rowCls(likeActive)}
          onClick={() => void navigate({ to: "/like-songs", search: { platform, id: String(likePlaylist.id) } })}
        >
          <Heart size={16} className="shrink-0 text-[var(--met-primary)]" />
          <span className="min-w-0 flex-1 truncate">喜欢的音乐</span>
        </button>
      ) : null}

      {/* 我的歌单:添加入口与折叠按钮分别操作。 */}
      <div className="mt-1 flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--met-fg-dim)]">
        <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center justify-between" aria-expanded={listOpen} onClick={() => setListOpen(value => !value)}>
          <span>我的歌单</span>
        </button>
        <button type="button" title="添加歌单" aria-label={`添加${platformName(platform)}歌单`} onClick={() => setAddOpen(true)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-primary)]">
          <Plus size={16} aria-hidden />
        </button>
        <button type="button" aria-label={`${listOpen ? "收起" : "展开"}${platformName(platform)}歌单`} aria-expanded={listOpen} onClick={() => setListOpen(value => !value)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--met-bg-hover)]">
          <ChevronDown size={14} className={`transition-transform ${listOpen ? "" : "-rotate-90"}`} aria-hidden />
        </button>
      </div>
      {addDialog}
      {listOpen ? (
        <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {userPlaylists.length ? (
            userPlaylists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                className={rowCls(activePlaylistId === String(pl.id))}
                title={pl.name}
                onClick={() =>
                  void navigate({ to: "/playlist", search: { platform, id: String(pl.id) } })
                }
              >
                {siderShowCover && pl.coverImgUrl ? (
                  <img
                    src={getCoverUrl(pl.coverImgUrl, 90)}
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

      {logoutDialog}
    </div>
  );
}

export default function UserPanel({ compact = false }: { compact?: boolean }) {
  return <div className="flex min-h-0 flex-col overflow-y-auto"><AccountPanel platform="qq" compact={compact} /><AccountPanel platform="netease" compact={compact} /></div>;
}
