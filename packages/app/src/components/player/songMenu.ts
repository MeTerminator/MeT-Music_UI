/**
 * 当前播放歌曲的「更多操作」菜单项(对照旧 MainControl.vue 的 songMoreOptions)。
 * 底部播放条(PlayerBar)与全屏播放器控制条(FullPlayerControls)共用同一份定义,
 * 保证两处菜单内容完全一致。
 */
import { useNavigate } from "@tanstack/react-router";
import type { Song } from "@met/core";
import type { MenuItemDef } from "@/components/ui/menu";
import { copyText } from "@/lib/clipboard";

export interface SongMoreMenu {
  items: MenuItemDef[];
  /** 无当前歌曲或为本地歌曲(旧逻辑 v-if="!path")时禁用整个菜单 */
  disabled: boolean;
  /** 当前歌曲的 MV id;无 MV 为 null */
  mvId: string | null;
  /** 站内跳转(带 beforeNavigate 收尾),供控制条上的快捷按钮复用 */
  go: (to: string, id: string) => void;
  /** 当前歌曲 id(字符串化;无歌曲为空串) */
  songId: string;
}

export interface UseSongMoreItemsOptions {
  /** 站内跳转前的收尾动作(全屏播放器需先收起自身,否则跳过去被它盖住) */
  beforeNavigate?: () => void;
}

export const useSongMoreItems = (
  song: Song | undefined,
  { beforeNavigate }: UseSongMoreItemsOptions = {},
): SongMoreMenu => {
  const navigate = useNavigate();

  const songId = song?.id;
  const disabled = songId == null || songId === "" || !!song?.path;

  const go = (to: string, id: string): void => {
    beforeNavigate?.();
    void navigate({ to, search: { id } });
  };

  // 当前歌曲 MV id(formatData 的 song.mv 字段;0 / "0" / 空值视为无 MV)
  const rawMv = (song as { mv?: unknown } | undefined)?.mv;
  const mvId =
    typeof rawMv === "number" && rawMv !== 0
      ? String(rawMv)
      : typeof rawMv === "string" && rawMv !== "" && rawMv !== "0"
        ? rawMv
        : null;

  const items: MenuItemDef[] = [
    {
      key: "comment",
      label: "查看评论",
      onSelect: () => go("/comments", String(songId)),
    },
    {
      key: "original-page",
      label: "查看原始页面",
      onSelect: () => {
        window.open(`https://y.qq.com/n/ryqq/songDetail/${String(songId)}`);
      },
    },
    {
      key: "song-detail",
      label: "查看单曲详情",
      onSelect: () => go("/song", String(songId)),
    },
    {
      key: "download",
      label: "下载歌曲",
      onSelect: () => go("/download", String(songId)),
    },
    {
      key: "share",
      label: "复制歌曲链接",
      onSelect: () =>
        void copyText(
          `https://y.qq.com/n/ryqq/songDetail/${String(songId)}`,
          "复制歌曲链接成功",
        ),
    },
    {
      key: "copy-id",
      label: "复制歌曲 ID",
      onSelect: () => void copyText(String(songId), "复制歌曲 ID 成功"),
    },
  ];

  // 观看 MV(对照旧 SongListDropdown 的「观看 MV」;有 MV 时插入到「查看评论」之后)
  if (mvId) {
    items.splice(1, 0, {
      key: "mv",
      label: "观看 MV",
      onSelect: () => go("/videos-player", mvId),
    });
  }

  return { items, disabled, mvId, go, songId: songId == null ? "" : String(songId) };
};
