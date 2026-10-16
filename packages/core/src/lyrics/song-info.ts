/** 首行同时包含当前歌曲名和连字符时，视为歌曲信息；不限制时间戳或分隔符空格。 */
export const isTitleInfo = (text: string, title?: string): boolean => {
  const name = title?.trim();
  return Boolean(name && text.includes(name) && text.includes("-"));
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
): T[] => {
  const first = lines.findIndex((line) => getText(line).trim() !== "");
  return lines.filter((line, index) => {
    const text = getText(line);
    return !(index === first && isTitleInfo(text, title)) && !isArtistInfo(text, artists);
  });
};
