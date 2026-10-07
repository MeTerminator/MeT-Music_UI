/** Native NetEase pipeline, following SPlayer-Next's lyric-kit parsing and stripping.
 * Reference: https://github.com/SPlayer-Dev/SPlayer-Next/blob/dev/src/stores/media.ts
 * Metadata: https://github.com/SPlayer-Dev/SPlayer-Next/blob/dev/src/utils/lyric/lyricStripper.ts
 */
import { parseLyric as parseNative, normalizeLyricLines, stripLyricMetadata, type LyricLine } from "lyric-kit";
import { parseTTML } from "@applemusic-like-lyrics/lyric";
import type { LyricApiData, ParseLyricOptions, TtmlLyricData } from "./parse";
import type { AMLine, LrcLine, ParsedLyric, YrcLine } from "../types/song";
import type { Notifier } from "../types/notify";

const text = (line: LyricLine): string => line.words.map((word) => word.word).join("");
const nonEmpty = (value?: string | null): string | undefined => value?.trim() ? value : undefined;
const PURE_MUSIC = /纯音乐[，,]?\s*请(您)?欣赏/;

const toAM = (line: LyricLine): AMLine => ({
  ...line,
  words: line.words.map((word) => ({
    ...word,
    romanWord: word.romanWord ?? "",
    obscene: word.obscene ?? false,
  })),
});

const toLrc = (line: LyricLine): LrcLine => ({
  time: line.startTime / 1000,
  content: text(line),
  tran: line.translatedLyric,
  roma: line.romanLyric,
});

const toYrc = (line: LyricLine): YrcLine => ({
  time: line.startTime / 1000,
  endTime: line.endTime / 1000,
  content: line.words.map((word) => ({
    time: word.startTime / 1000,
    duration: (word.endTime - word.startTime) / 1000,
    content: word.word,
    endsWithSpace: word.word.endsWith(" "),
  })),
  tran: line.translatedLyric,
  roma: line.romanLyric,
});

export const parseNeteaseLyric = (
  data: LyricApiData,
  ttml: TtmlLyricData | null,
  options: ParseLyricOptions,
  notify?: Notifier,
): ParsedLyric => {
  const parseOptions = { cleanKangxi: true, extractMetadata: true, preferredLang: "zh-CN" };
  // Old backend responses contain converted QRC. Accept these only for migration;
  // an explicitly present native YRC field takes precedence, including when empty.
  const hasNative = data.yrc !== undefined;
  const wordContent = nonEmpty(hasNative ? data.yrc : data.qrc);
  const wordTranslation = nonEmpty(data.ytlrc) ?? nonEmpty(data.qrctrans) ?? nonEmpty(data.lrctrans);
  const wordRomaji = nonEmpty(data.yromalrc) ?? nonEmpty(data.romalrc) ?? nonEmpty(data.qrcroma);
  const wordLines = wordContent ? parseNative({
    content: wordContent,
    format: hasNative ? "yrc" : "qrc",
    translation: wordTranslation,
    translationFormat: "lrc",
    romaji: wordRomaji,
    romajiFormat: "lrc",
  }, parseOptions).lines : [];
  const lrcLines = nonEmpty(data.lrc) ? parseNative({
    content: data.lrc!,
    format: "lrc",
    translation: nonEmpty(data.lrctrans) ?? wordTranslation,
    translationFormat: "lrc",
    romaji: nonEmpty(data.romalrc) ?? wordRomaji,
    romajiFormat: "lrc",
  }, parseOptions).lines : [];

  const clean = (lines: LyricLine[], removeInfo: boolean): LyricLine[] => {
    let result = lines.map((line) => ({ ...line, words: line.words.map((word) => ({ ...word })) }));
    if (removeInfo) result = stripLyricMetadata(result, {
      useDefaultRules: true,
      matchMetadata: { title: options.title, artists: options.artists },
    });
    normalizeLyricLines(result);
    result = result.filter((line) => text(line).trim());
    if (result.length && result.every((line) => PURE_MUSIC.test(text(line)))) return [];
    return result;
  };
  const normalWords = clean(wordLines, options.removeInfo);
  const normalLines = clean(lrcLines.length ? lrcLines : wordLines, options.removeInfo);
  const amWords = clean(wordLines, options.removeAMInfo);
  const amLines = clean(lrcLines.length ? lrcLines : wordLines, options.removeAMInfo);
  const result: ParsedLyric = {
    hasLrcTran: normalLines.some((line) => Boolean(line.translatedLyric)),
    hasLrcRoma: normalLines.some((line) => Boolean(line.romanLyric)),
    hasYrc: normalWords.length > 0,
    hasYrcTran: normalWords.some((line) => Boolean(line.translatedLyric)),
    hasYrcRoma: normalWords.some((line) => Boolean(line.romanLyric)),
    hasTtml: Boolean(ttml?.content),
    lrc: normalLines.map(toLrc),
    yrc: normalWords.map(toYrc),
    lrcAM: amLines.map(toAM),
    yrcAM: amWords.map(toAM),
    ttml: [],
    ttmlMeta: [],
    lyricResponse: data,
    ttmlLyricResponse: ttml,
  };
  if (ttml?.content) {
    const parsed = parseTTML(ttml.content);
    result.ttml = parsed.lines;
    result.ttmlMeta = parsed.metadata;
    const authors = parsed.metadata.find(([key]) => key === "ttmlAuthorGithubLogin")?.[1];
    notify?.info(authors?.length ? `TTML 歌词作者：${authors.join(" / ")}` : "使用 TTML 歌词");
  }
  return result;
};
