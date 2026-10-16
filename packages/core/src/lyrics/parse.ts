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
import { stripVocalLabels } from "./vocal-labels";
import { parseNeteaseLyric } from "./netease";
import { isTitleInfo, isArtistInfo, isPlanInfo, isByInfo, stripSongInfo } from "./song-info";

/** 角色后必须有冒号,避免把正文里以"词/曲/原"开头的句子误判(如"词穷"不会命中)。 */
const CREDIT_ROLES: string[] = [
  // 词曲作者
  "作词",
  "作曲",
  "说唱作曲",
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
  "製作",
  "音樂製作",
  "監製",
  // 录混
  "混音",
  "母带",
  "和声",
  "和音",
  "配唱",
  "人声",
  "录音勤务",
  "录音",
  "声乐指导",
  "配乐",
  "音频编辑",
  "剪辑",
  "音乐编辑",
  "母帶",
  "錄音",
  "剪輯",
  "和聲",
  // 演奏
  "器乐团队",
  "戏曲",
  "引用",
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
  "出品",
  "特别鸣谢",
  "歌曲营销",
  "策划",
  "策劃",
  "运营",
  "運營",
  "推广",
  "推廣",
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
  "音频",
  "音頻",
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
  "管理",
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
const lowerSet = (values: string[]): string[] => [...new Set(values.map((v) => v.toLowerCase()))];
const PREFIX_TOKENS = lowerSet(CREDIT_ROLE_PREFIXES);
const ROLE_TOKENS = lowerSet(CREDIT_ROLES);
const SUFFIX_TOKENS = lowerSet(CREDIT_ROLE_SUFFIXES);
const COPYRIGHT_NOTICE_RE = /未[经經].*[许許]可.*(?:不得|禁止)/;
/**
 * 冒号前的部分能否完整切分为「[前缀]角色[后缀…]」单元序列;单元之间可用 /、／、&、空格分隔或直接连写。
 * 按位置推进状态集合匹配,避免正则在连写角色上回溯爆炸。
 */
const isCreditHeader = (text: string): boolean => {
  const match = /^([^:：]+)[:：]/.exec(text);
  if (!match) return false;
  const head = match[1].trimEnd().toLowerCase();
  const n = head.length;
  const unitStart = new Set<number>([0]);
  const afterPrefix = new Set<number>();
  const afterRole = new Set<number>();
  const advance = (from: number, tokens: string[], into: Set<number>): void => {
    for (const token of tokens) if (head.startsWith(token, from)) into.add(from + token.length);
  };
  for (let i = 0; i <= n; i++) {
    if (afterRole.has(i)) {
      if (i === n) return true;
      advance(i, SUFFIX_TOKENS, afterRole);
      let j = i;
      while (j < n && /\s/.test(head[j])) j++;
      if (j < n && "/／&".includes(head[j])) {
        j++;
        while (j < n && /\s/.test(head[j])) j++;
      }
      unitStart.add(i);
      unitStart.add(j);
    }
    if (unitStart.has(i)) advance(i, PREFIX_TOKENS, afterPrefix);
    if (unitStart.has(i) || afterPrefix.has(i)) advance(i, ROLE_TOKENS, afterRole);
  }
  return false;
};
interface InfoLineInput {
  name?: string;
  artists?: string[];
  title?: string;
  text: string;
  isFirstContent: boolean;
  startTime: number;
  endTime: number;
  restDurations: number[];
}
/** 信息行:角色头 / 版权声明 / 首行「 - 」标题 / 整行无时间。不看匀速,见 parseAMData 注释。 */
const isInfoLine = ({
  name,
  artists,
  title,
  text,
  isFirstContent,
  startTime,
  endTime,
  restDurations,
}: InfoLineInput): boolean => {
  const trimmed = text.trim();
  return (
    isArtistInfo(trimmed, artists) ||
    isCreditHeader(trimmed) ||
    COPYRIGHT_NOTICE_RE.test(trimmed) ||
    (isFirstContent && (isTitleInfo(text, title, artists, name) || (startTime === 0 && /\s-\s/.test(text)))) ||
    (startTime === 0 && endTime === 0 && restDurations.every((d) => d === 0))
  );
};

/** 解析行为开关(对应旧 siteSettings 中的同名设置项) */
export interface ParseLyricOptions {
  name?: string;
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
      return stripVocalLabels(parseNeteaseLyric(data, ttmlLyric, options, notify));
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
      result.yrc = parseYrcData(lrcData.yrc, options.removeInfo, options.title, options.artists, options.name);
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

    if (options.removeInfo) {
      result.lrc = stripSongInfo(result.lrc, (line) => line.content, options.title, options.artists, options.name);
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
    let lrcAM = parseAMData(lrcParseData, tlyricParseData, romalrcParseData, options.removeAMInfo, options.title, options.artists, options.name);
    // 去除 lrcAM 中的空行
    lrcAM = lrcAM.filter((v) => v.words?.[0]?.word !== "");
    result.lrcAM = lrcAM;

    if (options.removeAMInfo) {
      // 头部 junk 行(标题/空行/创作者信息行)由 parseAMData 按内容判定跳过,
      // 不再按固定 slice(1):两边 junk 行数不对称时 slice 会让翻译系统性错位
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, true, options.title, options.artists, options.name);
    } else {
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, false, options.title, options.artists, options.name);
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

    return stripVocalLabels(result);
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
    return stripVocalLabels(result);
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
  title?: string,
  artists?: string[],
  name?: string,
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
          if (
            isPlanInfo(lineContent) || isByInfo(lineContent) || isInfoLine({
              name,
              title,
              artists,
              text: lineContent,
              isFirstContent: isFirstContentLine,
              startTime: Number(startTime),
              endTime: Number(endTime),
              restDurations: contentArray.slice(1).map((item) => item.duration),
            })
          ) {
            return null;
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
 * 如果单词的罗马音与原文一致,则 romanWord 置为空字符串以隐藏显示。
 *
 * 信息行规则见 isInfoLine；新增的标题/歌手标签规则在主行与辅助行配对后应用。
 * 翻译对齐:头部丢弃块按 min() 剥离占位;中段信息行仅在占位时跳过;BG 不消费翻译,
 * 「//」映射为空串；翻译/音译优先按时间匹配，旧 QQ 时间轴不一致时回退原顺序。
 */
export const parseAMData = (
  lrcData: LyricLine[],
  tranData: LyricLine[],
  romaData: LyricLine[],
  removeAMInfo = true,
  title?: string,
  artists?: string[],
  name?: string,
): AMLine[] => {
  const lineText = (line?: LyricLine): string =>
    (line?.words ?? []).map((w) => w.word).join("");
  const isTranPlaceholder = (line?: LyricLine): boolean => {
    const t = lineText(line).trim();
    return t === "" || t === "//";
  };

  const firstContentIndex = lrcData.findIndex((line) => lineText(line).trim() !== "");
  const isInfo = (line: LyricLine, index: number): boolean =>
    isInfoLine({
      text: lineText(line),
      isFirstContent: index === firstContentIndex,
      startTime: line.startTime,
      endTime: line.endTime,
      restDurations: (line.words ?? []).slice(1).map((word) => word.endTime - word.startTime),
    });

  // 有正文时间戳锚点时按时间配对，允许译文/音译省略标题或歌手标签。
  // 部分旧 QQ 数据的两条时间轴不同，仍保留原有顺序配对作为回退。
  const timedSidecar = (sidecar: LyricLine[]): Map<number, LyricLine> | undefined => {
    const byTime = new Map(sidecar.map((line) => [line.startTime, line]));
    // QQ 的翻译 LRC 只有百分之一秒精度，QRC 保留毫秒；同一行可相差 0–9ms。
    // 为主行查找最近的候选，精确匹配优先，不跨过 10ms 边界抢占其他行。
    for (const main of lrcData) {
      if (byTime.has(main.startTime)) continue;
      let nearest: LyricLine | undefined;
      let distance = 10;
      for (const candidate of sidecar) {
        const delta = Math.abs(candidate.startTime - main.startTime);
        if (delta < distance) {
          nearest = candidate;
          distance = delta;
        }
      }
      if (nearest) byTime.set(main.startTime, nearest);
    }
    const hasAnchor = lrcData.some((line, index) =>
      line.startTime > 0 && !line.isBG && lineText(line).trim() !== "" &&
      !isInfo(line, index) &&
      !(index === firstContentIndex && isTitleInfo(lineText(line), title, artists, name)) &&
      !isArtistInfo(lineText(line), artists) && byTime.has(line.startTime),
    );
    return hasAnchor ? byTime : undefined;
  };
  const timedTranslations = timedSidecar(tranData);
  const timedRomaji = timedSidecar(romaData);

  // 可丢弃的主行:空行,或 removeAMInfo 开启时的信息行
  const isDroppableMain = (line: LyricLine, index: number): boolean =>
    lineText(line).trim() === "" || (removeAMInfo && isInfo(line, index));

  let maxStrip = 0;
  while (maxStrip < lrcData.length && isDroppableMain(lrcData[maxStrip], maxStrip)) maxStrip++;
  let tranCursor = 0;
  while (
    tranCursor < maxStrip &&
    tranCursor < tranData.length &&
    isTranPlaceholder(tranData[tranCursor])
  ) {
    tranCursor++;
  }
  const skipTranPlaceholder = (): void => {
    if (tranCursor >= tranData.length) return;
    if (isTranPlaceholder(tranData[tranCursor])) tranCursor++;
  };

  // 顺序消费一条翻译;"//" 表示本行无翻译,条目缺失时兜底空串
  const takeTranslation = (line: LyricLine): string => {
    const text = lineText(timedTranslations ? timedTranslations.get(line.startTime) : tranData[tranCursor++]);
    return text.trim() === "//" ? "" : text;
  };

  // 处理每一行
  const processLine = (line: LyricLine, index: number, lines: LyricLine[]): AMLine | null => {
    const currentWords = line.words || [];
    const currentRomaWords = (timedRomaji ? timedRomaji.get(line.startTime) : romaData[index])?.words || [];

    // 1. 过滤信息行 / 空行
    if (removeAMInfo && isInfo(line, index)) {
      if (index >= maxStrip) skipTranPlaceholder();
      return null;
    }
    if (lineText(line).trim() === "") return null;

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
    return {
      words: words,
      translatedLyric: line.isBG === true ? "" : takeTranslation(line),
      romanLyric: "", // 已在 LyricWord 级别处理,整行字符串置空
      startTime: startTime,
      endTime: endTime,
      isBG: false,
      isDuet: false,
    };
  };

  // 先把正文、翻译和音译组成完整行，再一起删除新增规则命中的信息行。
  const paired = lrcData.map(processLine).filter((item): item is AMLine => item !== null);
  return removeAMInfo ? stripSongInfo(paired, lineText, title, artists, name) : paired;
};
