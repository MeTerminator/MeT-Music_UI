/** 首行含连字符及任一歌曲名/歌手名时视为歌曲信息，不限制时间戳或空格。 */
export const isTitleInfo = (text: string, title?: string, artists: string[] = [], name?: string): boolean => {
  if (!text.includes("-")) return false;
  return [name, title, ...artists].some((value) => {
    const candidate = value?.trim();
    return Boolean(candidate && text.includes(candidate));
  });
};

/** 歌手标签可出现在任意行，冒号必须位于去掉首尾空白后的行尾。 */
export const isArtistInfo = (text: string, artists: string[] = []): boolean => {
  const trimmed = text.trim();
  return /[：:]$/.test(trimmed) && artists.some((artist) => {
    const name = artist.trim();
    return name !== "" && trimmed.includes(name);
  });
};

/** 平台推广/音乐人计划信息，两组关键词需出现在同一行，顺序不限。 */
export const isPlanInfo = (text: string): boolean =>
  text.includes("计划") && ["酷狗", "音乐人", "QQ音乐"].some((keyword) => text.includes(keyword));

/** 任意位置含 by: 或 by：时过滤整行。 */
export const isByInfo = (text: string): boolean => /by[:：]/i.test(text);

export const stripSongInfo = <T>(
  lines: T[],
  getText: (line: T) => string,
  title?: string,
  artists?: string[],
  name?: string,
): T[] => {
  const first = lines.findIndex((line) => getText(line).trim() !== "");
  return lines.filter((line, index) => {
    const text = getText(line);
    return !(index === first && isTitleInfo(text, title, artists, name)) && !isArtistInfo(text, artists) && !isPlanInfo(text) && !isByInfo(text) && !/^\s*(?:器乐团队|说唱作曲|戏曲|引用)\s*[：:]/.test(text);
  });
};
