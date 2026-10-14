/**
 * 歌词解析。移植自旧 src/utils/parseLyric.js(514 行版本),逻辑逐行等价:
 * - siteSettings() 的 removeInfo / removeAMInfo 改为显式 options 参数;
 * - $message.info 改为可选注入的 notify?.info;
 * - 解析失败由返回 false 改为返回 null。
 * QQ 路径保持旧算法；网易云由独立的原生 YRC 解析器处理。
 */
import {
  parseLrc,
  parseQrc,
  parseTTML,
  type LyricLine,
} from "@applemusic-like-lyrics/lyric";
import type { AMLine, LrcLine, ParsedLyric, YrcLine, YrcWord } from "../types/song";
import type { Notifier } from "../types/notify";
import type { Platform } from "../types/platform";
import { parseNeteaseLyric } from "./netease";

/**
 * 创作者信息头:行首为「角色 + 冒号」的信息行,如「词:」「曲:」「编曲:」「制作人:」。
 * 冒号是强制的,避免把正文里以"词/曲/原"开头的句子误判(如"词穷"不会命中);
 * 角色支持「A/B:」复合形式及空格连接的中英双语形式(如「词 Lyricist:」),分隔符可为 /、／、& 或空格。
 */
const CREDIT_ROLES: string[] = [
  // 词曲作者
  "作词",
  "作曲",
  "原唱",
  "中文填词",
  "说唱填词",
  "填词",
  "改编词",
  "词曲",
  "作词作曲",
  "填詞",
  "中文填詞",
  "词",
  "曲",
  "原",
  "作詞",
  "詞",
  // 制作
  "总制作人",
  "联合制作人",
  "制作助理",
  "制作人",
  "音乐制作",
  "监制",
  "音乐总监",
  "项目总监",
  "营销推广",
  "编曲",
  "編曲",
  "制作",
  "總製作人",
  "聯合製作人",
  "製作人",
  "製作",
  "音樂製作",
  "監製",
  // 录混
  "混音师",
  "混音",
  "母带工程师",
  "母带",
  "和声",
  "和音",
  "配唱",
  "人声",
  "录音室",
  "录音助理",
  "录音勤务",
  "录音统筹",
  "录音师",
  "录音",
  "声乐指导",
  "配乐",
  "音频编辑",
  "音乐编辑",
  "混音師",
  "母帶",
  "錄音",
  "錄音師",
  "和聲",
  // 演奏
  "乐队",
  "吉他",
  "贝斯",
  "鼓",
  "键盘",
  "弦乐",
  "管乐",
  "打击乐",
  "演唱",
  "合唱",
  "貝斯",
  "鍵盤",
  "弦樂",
  // 发行宣传
  "出品人",
  "出品",
  "特别鸣谢",
  "歌曲营销",
  "策划",
  "策劃",
  "运营",
  "運營",
  "推广",
  "推廣",
  "发行统筹",
  "商务统筹",
  "项目企划",
  "企划",
  "统筹",
  "总监",
  "總監",
  "版权",
  "版權",
  "发行",
  "商务",
  "营销",
  "宣传",
  "發行",
  "企劃",
  "統籌",
  // 英文
  "OP",
  "SP",
  "Lyrics",
  "Lyricist",
  "Lyrics by",
  "Written by",
  "Words by",
  "Music",
  "Music by",
  "Composer",
  "Composed by",
  "Arranger",
  "Arranged by",
  "Arrangement",
  "Producer",
  "Produced by",
  "Executive Producer",
  "Co-Producer",
  "Mixing",
  "Mixed by",
  "Mixing Engineer",
  "Mastering",
  "Mastered by",
  "Mastering Engineer",
  "Recording",
  "Recorded by",
  "Recording Engineer",
  "Vocal Producer",
  "Vocal Director",
  "Backing Vocals",
  "Vocal",
  "Vocals",
  "Backing Vocal",
  "Crowd Vocals",
  "Studio",
  "Guitar",
  "Bass",
  "Drums",
  "Keyboard",
  "Piano",
  "Strings",
  "Programming",
  "Publisher",
  "Label",
  "Coordinator",
];
const CREDIT_ROLE_PREFIXES = [
  "总",
  "總",
  "大",
  "联合",
  "聯合",
  "共同",
  "执行",
  "執行",
  "项目",
  "項目",
  "艺术",
  "藝術",
  "音乐",
  "音樂",
  "人声",
  "人聲",
  "弦乐",
  "弦樂",
  "乐队",
  "樂隊",
  "和声",
  "和聲",
  "歌曲",
  "版权",
  "版權",
  "宣传",
  "宣傳",
];
const CREDIT_ROLE_SUFFIXES = [
  "师",
  "師",
  "工程师",
  "工程師",
  "后期",
  "後期",
  "室",
  "棚",
  "助理",
  "统筹",
  "統籌",
  "处理",
  "處理",
  "录音",
  "錄音",
  "编写",
  "編寫",
  "指导",
  "指導",
  "协力",
  "協力",
  "总监",
  "總監",
  "监制",
  "監製",
  "编辑",
  "編輯",
  "策划",
  "策劃",
  "企划",
  "企劃",
  "人",
  "方",
];
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (values: string[]): string =>
  [...new Set(values)].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
const ROLE_PART =
  `(?:${alt(CREDIT_ROLE_PREFIXES)})?(?:${alt(CREDIT_ROLES)})(?:${alt(CREDIT_ROLE_SUFFIXES)})*`;
const COPYRIGHT_NOTICE_RE = /未[经經].*[许許]可.*(?:不得|禁止)/;
const CREDIT_HEADER_RE = new RegExp(
  `^(?:${ROLE_PART})(?:(?:\\s*[/／&]\\s*|\\s+)(?:${ROLE_PART}))*\\s*[:：]`,
  "i",
);
const isCreditHeader = (text: string): boolean =>
  CREDIT_HEADER_RE.test(text.trim());

/** 解析行为开关(对应旧 siteSettings 中的同名设置项) */
export interface ParseLyricOptions {
  platform?: Platform;
  title?: string;
  artists?: string[];
  /** 移除歌曲信息行：QQ 使用旧启发式，网易云使用元数据规则 */
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
  yrc?: string | null;
  ytlrc?: string | null;
  yromalrc?: string | null;
  romalrc?: string | null;
}

/** TTML 歌词接口原始返回 */
export interface TtmlLyricData {
  status?: "success" | "no_lyrics";
  content?: string | null;
}

/**
 * 「纯音乐」提示行。
 *
 * 接口对没有填词的曲子不会返回空歌词,而是回一句提示占位,措辞随源不同:
 *   QQ:  [00:00:00]此歌曲为没有填词的纯音乐，请您欣赏
 *   网易:[00:00.000]纯音乐，请欣赏
 * 半角逗号与「请欣赏 / 请您欣赏」都见过,故一并放宽。
 */
const PURE_MUSIC_RE = /纯音乐[，,]?\s*请(您)?欣赏/;

/** 整份歌词是否只剩提示行(空行忽略;一行真歌词都没有才算数) */
const isPureMusicOnly = (texts: string[]): boolean => {
  const lines = texts.map((text) => text.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => PURE_MUSIC_RE.test(line));
};

/** AM 行 → 整行文本(逐字拼接) */
const amLineText = (line: AMLine): string => (line.words ?? []).map((w) => w.word).join("");

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
    if (options.platform === "netease") {
      return parseNeteaseLyric(data, ttmlLyric, options, notify);
    }
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
        const roma = parseYrcData(lrcData.yromalrc, options.removeInfo);
        result.lrc = roma.length
          ? parseOtherYrc(result.lrc, roma, "roma")
          : parseOtherLrc(result.lrc, parseLrcData(lrcData.yromalrc), "roma");
        romalrcParseData = roma.length ? parseQrc(lrcData.yromalrc) : parseLrc(lrcData.yromalrc);
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
        const roma = parseYrcData(lrcData.yromalrc, options.removeInfo);
        yromalrcParseData = roma.length ? parseQrc(lrcData.yromalrc) : parseLrc(lrcData.yromalrc);
        romalrcParseData = yromalrcParseData;
        result.yrc = roma.length
          ? parseOtherYrc(result.yrc, roma, "roma")
          : parseOtherLrc(result.yrc, parseLrcData(lrcData.yromalrc), "roma");
      }
    }
    // 重写修正:hasYrc 初值只看 qrc 字段是否存在,但接口对没有逐字时间轴的歌曲
    // 也会在 qrc 里回落一份 base64 的普通 lrc(如 004VU57w4JZWAg《爱如火》),
    // parseYrcData / parseQrc 都解析不出行,结果是 hasYrc=true 而 yrc/yrcAM 全空。
    // 这会让引擎的歌词索引去空数组里 findIndex(恒 -1 → playSongLyricIndex 恒 -1,
    // 整首歌不高亮、不滚动、底栏无歌词),全屏播放器也会因 useYrcAM 命中空的
    // yrcAM 而放弃 AMLL。故以「确实解析出了逐字行」为准。
    result.hasYrc = result.yrc.length > 0;

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
      // 头部 junk 行(标题/空行/创作者信息行)由 parseAMData 按内容判定跳过,
      // 不再按固定 slice(1):两边 junk 行数不对称时 slice 会让翻译系统性错位
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, true);
    } else {
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, false);
    }

    // 纯音乐清场:parseLrcData 只把提示行挡在 result.lrc 之外,AM 路线
    // (parseLrc / parseQrc → parseAMData)不经过那道过滤,于是 lrcAM 里会留下
    // 「此歌曲为没有填词的纯音乐，请您欣赏」这一行 —— 全屏播放器的 hasLyric 看的是
    // amLines.length,一行提示就足够让它按「有歌词」排布,把提示语当歌词滚给用户看。
    // 故在所有解析结果都只剩提示行时,整份歌词一并清空。
    const allLineTexts = [
      ...result.lrc.map((line) => line.content),
      ...result.yrc.map((line) => line.content.map((word) => word.content).join("")),
      ...result.lrcAM.map(amLineText),
      ...result.yrcAM.map(amLineText),
    ];
    if (isPureMusicOnly(allLineTexts)) {
      console.log("该歌曲为纯音乐");
      result.lrc = [];
      result.yrc = [];
      result.lrcAM = [];
      result.yrcAM = [];
      // 提示行的翻译/音译同样没有意义,一并归零(hasTtml 不动:TTML 另有来源)
      result.hasLrcTran = false;
      result.hasLrcRoma = false;
      result.hasYrc = false;
      result.hasYrcTran = false;
      result.hasYrcRoma = false;
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
    if (parsedLyrics.length && PURE_MUSIC_RE.test(parsedLyrics[0].content)) {
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
    let seenContent = false;
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
        if (removeInfo && contentArray.length > 0) {
          const lineContent = contentArray.map((item) => item.content).join("");
          const isFirstContentLine = !seenContent;
          seenContent = true;
          if (isCreditHeader(lineContent)) {
            return null; // 返回 null 表示跳过当前元素
          }
          if (COPYRIGHT_NOTICE_RE.test(lineContent.trim())) {
            return null;
          }
          if (
            isFirstContentLine &&
            Number(startTime) === 0 &&
            /\s-\s/.test(lineContent)
          ) {
            return null;
          }
          const restDurations = contentArray.slice(1).map((item) => item.duration);
          const hasNoTiming =
            Number(startTime) === 0 &&
            Number(endTime) === 0 &&
            restDurations.every((duration) => duration === 0);

          // 如果该行确实没有任何时间信息,则跳过当前元素
          if (hasNoTiming) {
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
 *
 * 信息行判定不设字数门槛:①行首为创作者信息头(角色后必须有冒号);②整行没有任何
 * 时间信息(行起止为 0 且逐字时长全 0);③未经许可的版权声明;④首个非空内容行从
 * 0ms 开始且含「 - 」的标题行。不能只看逐字时长匀速,否则会误杀 AI 生成的机械
 * 匀速卡拉 OK 正文行(如正文第一句全行每字 198ms)。
 *
 * 翻译对齐规则(对应 QQ 接口的数据结构),分两步:
 * - ① 头部连续丢弃块:翻译侧的 "//" 占位与空行只去掉「主数组头部同样会被丢弃」
 *   的部分(取两者较小值);② 块外中途被丢弃的信息行逐行同步跳过其翻译占位
 *   (仍是占位才跳,占位缺失的不对称数据不会吃掉有效翻译)。空行丢弃不同步跳过。
 *   (不再按固定 slice(1) 去头,旧写法在两边 junk 行数不对称时会让所有翻译
 *   系统性错位一行)
 * - 之后翻译条目按顺序分配:BG 行(一般是译文本身或和声)不消费翻译,
 *   translatedLyric 置空;其余存活行各消费一条,正文区的 "//" 映射为空串。
 *   removeAMInfo=false 时被保留的信息行按位置消费一条翻译(一般为 "//" 占位)。
 * roma 对齐保持原数组下标(roma 与主歌词同构),不受翻译消费顺序影响。
 */
export const parseAMData = (
  lrcData: LyricLine[],
  tranData: LyricLine[],
  romaData: LyricLine[],
  removeAMInfo = true,
): AMLine[] => {
  const lineText = (line?: LyricLine): string =>
    (line?.words ?? []).map((w) => w.word).join("");

  const firstContentIndex = lrcData.findIndex((line) => lineText(line).trim() !== "");
  const isInfoLine = (line: LyricLine, index: number): boolean => {
    const text = lineText(line);
    const words = line.words ?? [];
    if (isCreditHeader(text)) return true;
    if (COPYRIGHT_NOTICE_RE.test(text.trim())) return true;
    if (index === firstContentIndex && line.startTime === 0 && /\s-\s/.test(text)) {
      return true;
    }
    const durations = words.slice(1).map((word) => word.endTime - word.startTime);
    return (
      line.startTime === 0 &&
      line.endTime === 0 &&
      durations.every((d) => d === 0)
    );
  };

  // 可丢弃的主行:空行,或 removeAMInfo 开启时的信息行
  const isDroppableMain = (line: LyricLine, index: number): boolean =>
    lineText(line).trim() === "" || (removeAMInfo && isInfoLine(line, index));

  // 翻译头部占位与丢弃行同步规则见函数注释。
  let maxStrip = 0;
  while (maxStrip < lrcData.length && isDroppableMain(lrcData[maxStrip], maxStrip)) maxStrip++;
  let tranCursor = 0;
  while (
    tranCursor < maxStrip &&
    tranCursor < tranData.length &&
    (lineText(tranData[tranCursor]).trim() === "" ||
      lineText(tranData[tranCursor]).trim() === "//")
  ) {
    tranCursor++;
  }
  const skipTranPlaceholder = (): void => {
    if (tranCursor >= tranData.length) return;
    const t = lineText(tranData[tranCursor]).trim();
    if (t === "" || t === "//") tranCursor++;
  };

  // 顺序消费一条翻译;"//" 表示本行无翻译,条目缺失时兜底空串
  const takeTranslation = (): string => {
    const text = lineText(tranData[tranCursor]);
    tranCursor++;
    return text.trim() === "//" ? "" : text;
  };

  // 处理每一行
  const processLine = (line: LyricLine, index: number, lines: LyricLine[]): AMLine | null => {
    const currentWords = line.words || [];
    // roma 对齐用原数组下标 index(roma 与主歌词同构),不受翻译消费顺序影响
    const currentRomaWords = romaData?.[index]?.words || [];
    const info = isInfoLine(line, index);

    // 1. 过滤信息行 / 空行;头部占位已预处理,中段信息行仅同步跳过对应占位。
    if ((info && removeAMInfo) || lineText(line).trim() === "") {
      if (info && removeAMInfo && index >= maxStrip) skipTranPlaceholder();
      return null;
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
    // BG 行(一般是译文本身或和声)不配翻译,置空;其余行按顺序消费翻译条目
    // (被保留的信息行也消费一条,与其 "//" 占位位置对应)
    return {
      words: words,
      translatedLyric: line.isBG === true ? "" : takeTranslation(),
      romanLyric: "", // 已在 LyricWord 级别处理,整行字符串置空
      startTime: startTime,
      endTime: endTime,
      isBG: false,
      isDuet: false,
    };
  };

  return lrcData.map(processLine).filter((item): item is AMLine => item !== null);
};
