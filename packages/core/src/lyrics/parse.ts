/**
 * 歌词解析。移植自旧 src/utils/parseLyric.js(514 行版本),逻辑逐行等价:
 * - siteSettings() 的 removeInfo / removeAMInfo 改为显式 options 参数;
 * - $message.info 改为可选注入的 notify?.info;
 * - 解析失败由返回 false 改为返回 null。
 * 其余算法、正则、怪癖行为(见各处注释)与源码保持一致。
 */
import {
  parseLrc,
  parseQrc,
  parseTTML,
  type LyricLine,
} from "@applemusic-like-lyrics/lyric";
import type { AMLine, LrcLine, ParsedLyric, YrcLine, YrcWord } from "../types/song";
import type { Notifier } from "../types/notify";

/** 解析行为开关(对应旧 siteSettings 中的同名设置项) */
export interface ParseLyricOptions {
  /** 逐字歌词中移除歌曲信息行("所有字持续时间相等"启发式) */
  removeInfo: boolean;
  /** AM 歌词中移除歌曲信息行 */
  removeAMInfo: boolean;
}

/** 歌词接口原始返回(仅声明解析用到的字段) */
export interface LyricApiData {
  lrc?: string | null;
  lrctrans?: string | null;
  qrc?: string | null;
  qrctrans?: string | null;
  qrcroma?: string | null;
  [key: string]: unknown;
}

/** TTML 歌词接口原始返回 */
export interface TtmlLyricData {
  content?: string | null;
  [key: string]: unknown;
}

/** 可写入 tran/roma 的歌词行(LrcLine 与 YrcLine 的公共子集) */
type TranTarget = { time: number; tran?: string; roma?: string };

/**
 * 将歌词接口数据解析出对应数据
 * @param data 接口数据
 * @param ttmlLyric TTML 歌词接口数据
 * @param options 解析行为开关
 * @param notify 可选 UI 提示(TTML 作者信息)
 * @returns 解析结果,失败返回 null(源码返回 false)
 */
export const parseLyric = async (
  data: LyricApiData,
  ttmlLyric: TtmlLyricData | null,
  options: ParseLyricOptions,
  notify?: Notifier,
): Promise<ParsedLyric | null> => {
  try {
    // 以下逻辑保持不变

    // 判断是否具有内容
    const checkLyric = (lyric: unknown): boolean => Boolean(lyric);
    // 初始化数据
    const { lrc, lrctrans, qrc, qrctrans, qrcroma } = data;
    const lrcData = {
      lrc: lrc || null,
      tlyric: lrctrans || null,
      romalrc: null as string | null,
      yrc: qrc,
      ytlrc: qrctrans,
      yromalrc: qrcroma,
      ttml: ttmlLyric?.content || null,
    };
    // 初始化输出结果
    const result: ParsedLyric = {
      // 是否具有普通翻译
      hasLrcTran: checkLyric(lrctrans),
      // 是否具有普通音译(源码即以 qrcroma 判断)
      hasLrcRoma: checkLyric(qrcroma),
      // 是否具有逐字歌词
      hasYrc: checkLyric(qrc),
      // 是否具有逐字翻译
      hasYrcTran: checkLyric(qrctrans),
      // 是否具有逐字音译
      hasYrcRoma: checkLyric(qrcroma),
      // 是否有 Apple Music 特效歌词
      hasTtml: checkLyric(lrcData.ttml),
      // 普通歌词数组
      lrc: [],
      // 逐字歌词数据
      yrc: [],
      // Apple Music 普通歌词数组
      lrcAM: [],
      // Apple Music 逐字歌词数据
      yrcAM: [],
      // Apple Music 特效歌词数据
      ttml: [],
      ttmlMeta: [],

      lyricResponse: data,
      ttmlLyricResponse: ttmlLyric,
    };
    // 处理后歌词
    let lrcParseData: LyricLine[] = [];
    let tlyricParseData: LyricLine[] = [];
    let romalrcParseData: LyricLine[] = [];
    let qrcParseData: LyricLine[] = [];
    let ytlrcParseData: LyricLine[] = [];
    let yromalrcParseData: LyricLine[] = [];
    // 普通歌词
    if (lrcData.lrc) {
      lrcParseData = parseLrc(lrcData.lrc);
      result.lrc = parseLrcData(lrcData.lrc);
      // 判断是否有其他翻译
      if (lrcData.tlyric) {
        tlyricParseData = parseLrc(lrcData.tlyric);
        result.lrc = parseOtherLrc(result.lrc, parseLrcData(lrcData.tlyric), "tran");
      }
      if (lrcData.yromalrc) {
        result.lrc = parseOtherYrc(
          result.lrc,
          parseYrcData(lrcData.yromalrc, options.removeInfo),
          "roma",
        );
      }
    }
    // 逐字歌词
    if (lrcData.yrc) {
      qrcParseData = parseQrc(lrcData.yrc);
      result.yrc = parseYrcData(lrcData.yrc, options.removeInfo);
      // 判断是否有其他翻译
      if (lrcData.ytlrc) {
        ytlrcParseData = parseLrc(lrcData.ytlrc);
        result.yrc = parseOtherLrc(result.yrc, parseLrcData(lrcData.ytlrc), "tran");
      }
      if (lrcData.yromalrc) {
        // lrcAM 与 yrcAM 共用同一份 QRC 音译解析结果
        yromalrcParseData = parseQrc(lrcData.yromalrc);
        romalrcParseData = yromalrcParseData;
        result.yrc = parseOtherYrc(
          result.yrc,
          parseYrcData(lrcData.yromalrc, options.removeInfo),
          "roma",
        );
      }
    }
    // 当仅有 逐字歌词 ,没有 普通歌词 时
    if (result.yrc.length && !result.lrc.length) {
      result.lrc = result.yrc.map((v) => {
        return {
          time: v.time,
          content: v.content.map((x) => x.content).join(""),
        };
      });
    }

    // 重写修正:旧实现此处无视 removeAMInfo 设置恒用默认值 true,
    // 导致关闭"去除 AM 歌词歌曲信息"设置时 lrcAM 仍被过滤
    let lrcAM = parseAMData(lrcParseData, tlyricParseData, romalrcParseData, options.removeAMInfo);
    // 去除 lrcAM 中的空行
    lrcAM = lrcAM.filter((v) => v.words?.[0]?.word !== "");
    result.lrcAM = lrcAM;

    if (options.removeAMInfo) {
      result.yrcAM = parseAMData(
        qrcParseData.slice(1),
        ytlrcParseData.slice(1),
        yromalrcParseData.slice(1),
        true,
      );
    } else {
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, false);
    }

    if (lrcData.ttml) {
      const ttmlParsed = parseTTML(lrcData.ttml);
      result.ttml = ttmlParsed.lines;
      result.ttmlMeta = ttmlParsed.metadata;

      // 1. 找到 key 为 "ttmlAuthorGithubLogin" 的那一个条目
      const authorEntry = ttmlParsed.metadata.find((item) => item[0] === "ttmlAuthorGithubLogin");

      // 2. 提取该条目的第二个元素(即所有的作者数组)
      const ttmlAuthors: string[] | string = authorEntry?.[1] || [];

      if (Array.isArray(ttmlAuthors) && ttmlAuthors.length > 0) {
        // 使用 / 分隔显示所有作者
        const authorsDisplay = ttmlAuthors.join(" / ");
        notify?.info("TTML 歌词作者：" + authorsDisplay);
      } else if (typeof ttmlAuthors === "string" && ttmlAuthors !== "") {
        // 兼容处理:如果解析器有时返回字符串而非数组
        notify?.info("TTML 歌词作者：" + ttmlAuthors);
      } else {
        notify?.info("使用 TTML 歌词");
      }
    }

    return result;
  } catch (error) {
    console.error("解析歌词时出现错误：", error);
    return null;
  }
};

/**
 * 解析本地歌词数据
 * @param data 歌词字符串
 * @returns 包含解析后的歌词信息的对象,失败返回 null(源码返回 false)
 */
export const parseLocalLrc = (data: string): ParsedLyric | null => {
  try {
    const lyric = parseLrcData(data);
    const parsedLyrics: LrcLine[] = [];
    // 初始化输出结果
    const result: ParsedLyric = {
      hasLrcTran: false,
      hasLrcRoma: false,
      hasYrc: false,
      hasYrcTran: false,
      hasYrcRoma: false,
      lrc: [],
      yrc: [],
    };
    // 遍历本地歌词数据
    for (let i = 0; i < lyric.length; i++) {
      // 当前歌词
      const currentObj = lyric[i];
      // 是否有相同时间
      const existingObj = parsedLyrics.find((v) => Number(v.time) === Number(currentObj.time));
      // 如果存在翻译
      if (existingObj) {
        result.hasLrcTran = true;
        existingObj.tran = currentObj.content;
      }
      // 若不存在翻译
      else {
        parsedLyrics.push({
          time: currentObj.time,
          content: currentObj.content,
        });
      }
    }
    // 改变输出结果
    result.lrc = parsedLyrics;
    return result;
  } catch (error) {
    console.error("解析本地歌词时出现错误：", error);
    return null;
  }
};

/**
 * 翻译文本对齐
 * @param lrc 歌词对象数组
 * @param tranLrc 翻译歌词对象数组
 * @param name 写入字段名
 * @returns 包含翻译的歌词对象数组
 */
export const parseOtherLrc = <T extends TranTarget>(
  lrc: T[],
  tranLrc: LrcLine[],
  name: "tran" | "roma",
): T[] => {
  const lyric = lrc;
  const tranLyric = tranLrc;
  if (lyric[0] && tranLyric[0]) {
    lyric.forEach((v) => {
      tranLyric.forEach((x) => {
        if (Number(v.time) === Number(x.time) || Math.abs(Number(v.time) - Number(x.time)) < 0.1) {
          if (x.content == "//") {
            (v as TranTarget)[name] = "";
          } else {
            (v as TranTarget)[name] = x.content;
          }
        }
      });
    });
  }
  return lyric;
};

/**
 * 音译文本对齐 MeT
 * @param lrc 歌词对象数组
 * @param tranLrc 逐字音译歌词对象数组
 * @param name 写入字段名
 * @returns 包含音译的歌词对象数组
 */
export const parseOtherYrc = <T extends TranTarget>(
  lrc: T[],
  tranLrc: YrcLine[],
  name: "tran" | "roma",
): T[] => {
  const lyric = lrc;
  const tranLyric = tranLrc;
  if (lyric[0] && tranLyric[0]) {
    lyric.forEach((v) => {
      tranLyric.forEach((x) => {
        if (Number(v.time) === Number(x.time) || Math.abs(Number(v.time) - Number(x.time)) < 0.1) {
          const target = v as unknown as Record<string, string>;
          target[name] = "";
          x.content.forEach((y) => {
            target[name] += y.content;
          });
        }
      });
    });
  }
  return lyric;
};

/**
 * 普通歌词解析
 * @param lyrics 歌词字符串
 * @param isTrim 是否去除首尾空白
 * @returns 歌词对象数组
 */
export const parseLrcData = (lyrics: string | null | undefined, isTrim = true): LrcLine[] => {
  if (!lyrics) return [];
  try {
    // 匹配时间轴和歌词文本的正则表达式
    const regex = /^\[([^\]]+)\]\s*(.+?)\s*$/;
    // 将歌词字符串按行分割为数组
    const lines = lyrics.split("\n");
    // 对每一行进行转换
    const parsedLyrics = lines
      // 筛选出包含时间轴和歌词文本的行
      .filter((line) => regex.test(line))
      // 转换时间轴和歌词文本为对象
      .map((line) => {
        const [, time, text] = line.match(regex)!;
        const parts = time.split(":");
        const seconds =
          Number(parts[0]) * 60 +
          Number(parts[1]) +
          (parts.length > 2 ? Number(parts[2]) / 1000 : 0);
        return { time: Number(seconds.toFixed(2)), content: isTrim ? text.trim() : text };
      })
      .filter((c) => c && c.content.trim() !== "");
    // 检查是否为纯音乐,是则返回空数组
    if (parsedLyrics.length && /纯音乐，请您欣赏/.test(parsedLyrics[0].content)) {
      console.log("该歌曲为纯音乐");
      return [];
    }
    return parsedLyrics;
  } catch (err) {
    console.error("普通歌词处理出错：" + err);
    return [];
  }
};

/**
 * 逐字歌词解析
 * @param qrcSource 逐字歌词字符串(QRC 原始格式)
 * @param removeInfo 是否移除歌曲信息行(对应旧 siteSettings().removeInfo)
 * @returns 歌词对象数组
 */
export const parseYrcData = (
  qrcSource: string | null | undefined,
  removeInfo: boolean,
): YrcLine[] => {
  if (!qrcSource) return [];
  try {
    // qrc -> yrc
    let qrc: string | undefined = qrcSource.replace(/\r\n/g, "\n");
    // 重写修正:旧实现无 [offset:0] 前缀时靠 undefined 上抛 TypeError 被 catch 吞掉;
    // 行为不变(仍返回 []),改为显式判断
    qrc = qrc.split("[offset:0]\n")[1];
    if (qrc === undefined) return [];
    qrc = qrc.replace(/\n\"\/>\n<\/LyricInfo>\n<\/QrcInfos>/g, "");
    qrc = qrc.replace(/\((\d+,\d+)\)/g, "{$1}");

    // 遍历每一行逐字歌词
    const parsedLyrics = qrc
      .split("\n")
      .map((line) => {
        // 匹配每一行中的时间戳信息
        const timeReg = /\[(\d+),(\d+)\]/;
        const timeMatch = line.match(timeReg);
        if (!timeMatch) {
          return null;
        }
        // 解构出起始时间和结束时间
        const [, startTime, endTime] = timeMatch;
        if (isNaN(Number(startTime)) || isNaN(Number(endTime))) {
          return null;
        }
        // 去除当前行中的时间戳信息,得到歌词内容
        const content = line.replace(timeReg, "");
        if (!content) {
          return null;
        }
        // 对歌词内容中的时间戳和歌词内容分离
        const contentArray = content
          .split(/([^}]*\{[1-9]\d*,[1-9]\d*\})/g)
          .filter((c) => c.trim())
          .map((c) => {
            // 匹配当前片段中的时间戳信息
            const wordTimeReg = /\{(\d+),(\d+)\}/;
            const wordTimeMatch = c.match(wordTimeReg);
            if (!wordTimeMatch) {
              return null;
            }
            // 解构出时间戳,持续时间和歌词内容
            const [, time, duration] = wordTimeMatch;
            const contentReg = /\{\d+,\d+\}/g;
            const wordContent = c.replace(wordTimeReg, "").replace(contentReg, "");
            if (!wordContent || (!wordContent.trim() && wordContent !== " ")) {
              return null;
            }
            return {
              time: Number(time) / 1000,
              duration: Number(duration) / 1000,
              content: wordContent,
              endsWithSpace: wordContent.endsWith(" "),
            };
          })
          .filter((c): c is YrcWord => c !== null);
        if (removeInfo && contentArray.length > 2) {
          const allDurationsEqual = contentArray
            .slice(1)
            .every((item) => item.duration === contentArray[1].duration);

          // 如果所有持续时间相等,则跳过当前元素
          if (allDurationsEqual) {
            return null; // 返回 null 表示跳过当前元素
          }
        }
        // 返回当前行解析出的时间信息和歌词内容信息
        return {
          time: Number(startTime) / 1000,
          endTime: Number(endTime) / 1000,
          content: contentArray,
        };
      })
      .filter((line): line is YrcLine => line !== null);
    return parsedLyrics;
  } catch (err) {
    console.error("逐字歌词处理出错：" + err);
    return [];
  }
};

/**
 * 处理 AM 歌词并适配 LyricLine 和 LyricWord 接口
 * 如果单词的罗马音与原文一致,则 romanWord 置为空字符串以隐藏显示
 */
export const parseAMData = (
  lrcData: LyricLine[],
  tranData: LyricLine[],
  romaData: LyricLine[],
  removeAMInfo = true,
): AMLine[] => {
  // 过滤翻译数据中无效的空行
  const filteredTranData = tranData.filter(
    (item) => !(item?.words?.length === 1 && item.words[0]?.word === ""),
  );

  // 获取整行翻译文本
  const getTranslationString = (index: number): string => {
    const lyric = filteredTranData?.[index]?.words?.map((w) => w.word).join("") ?? "";
    return lyric === "//" ? "" : lyric;
  };

  // 处理每一行
  const processLine = (line: LyricLine, index: number, lines: LyricLine[]): AMLine | null => {
    const currentWords = line.words || [];
    const currentRomaWords = romaData?.[index]?.words || [];

    // 1. 过滤冗余的 AM 信息行
    if (removeAMInfo && currentWords.length > 2) {
      const timeDifferences = currentWords.slice(1).map((word) => word.endTime - word.startTime);
      const allDifferencesEqual = timeDifferences.every((diff) => diff === timeDifferences[0]);
      if (allDifferencesEqual) return null;
    }

    // 2. 映射 LyricWord 数组
    const words = currentWords.map((wordObj, wordIndex) => {
      const originalWord = wordObj.word ?? "";
      const rawRomanWord = currentRomaWords[wordIndex]?.word ?? "";

      // 判断逻辑:如果罗马音去掉首尾空格后与原文相同(不区分大小写),则置为空
      // 这样在 UI 渲染时,判断 romanWord 为空即可不显示
      const shouldShowRoman = rawRomanWord.trim().toLowerCase() !== originalWord.trim().toLowerCase();

      return {
        startTime: wordObj.startTime ?? 0,
        endTime: wordObj.endTime ?? 0,
        word: originalWord,
        romanWord: shouldShowRoman ? rawRomanWord : "",
        obscene: false,
      };
    });

    // 3. 计算行级别的起始和结束时间
    const startTime = words[0]?.startTime ?? 0;
    const endTime =
      lines[index + 1]?.words?.[0]?.startTime ?? words[words.length - 1]?.endTime ?? Infinity;

    // 4. 构建符合 LyricLine 接口的对象
    return {
      words: words,
      translatedLyric: getTranslationString(index),
      romanLyric: "", // 已在 LyricWord 级别处理,整行字符串置空
      startTime: startTime,
      endTime: endTime,
      isBG: false,
      isDuet: false,
    };
  };

  return lrcData.map(processLine).filter((item): item is AMLine => item !== null);
};
