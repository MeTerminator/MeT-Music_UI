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
    return !(index === first && isTitleInfo(text, title, artists, name)) && !isArtistInfo(text, artists);
  });
};
