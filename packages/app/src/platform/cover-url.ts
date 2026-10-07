/** Use same-origin artwork for canvas/WebGL and downloads. */
export const toCoverProxyUrl = (src: string, highResolution = false): string => {
  const endpoint = highResolution ? "highpic" : "pic";
  if (/^https?:\/\/p[1-4]\.music\.126\.net\//.test(src)) {
    return `/api/web/album/cover/${endpoint}?platform=netease&pic=${encodeURIComponent(src)}`;
  }
  const qqPrefix = "https://y.qq.com/music/photo_new/";
  if (src.startsWith(qqPrefix)) {
    const path = src.slice(qqPrefix.length).split("?")[0];
    return `/api/web/album/cover/${endpoint}?platform=qq&pic=${encodeURIComponent(path)}`;
  }
  return src;
};
