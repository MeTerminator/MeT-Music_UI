/** 可用于专辑页跳转的 id；空值及 0 占位值表示未知专辑。 */
export const getAlbumPageId = (id: number | string | null | undefined): string | null => {
  if (id == null) return null;
  const value = String(id).trim();
  return value && value !== "0" ? value : null;
};
