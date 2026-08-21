import { describe, expect, it } from "vitest";
import {
  parseLyric,
  parseLocalLrc,
  parseLrcData,
  parseYrcData,
  type LyricApiData,
  type ParseLyricOptions,
} from "../src/lyrics/parse";
import { computeWordProgress } from "../src/lyrics/word-progress";
import type { YrcLine } from "../src/types/song";

const defaultOptions: ParseLyricOptions = { removeInfo: false, removeAMInfo: false };

/** 标准 LRC 字符串 */
const LRC = "[00:12.500]Hello world\n[00:17.000]Second line\n";
/** 对应翻译:第二行为 "//"(应置空) */
const LRC_TRAN = "[00:12.500]你好世界\n[00:17.000]//\n";
/** 最小 QRC 字符串:行头 [start,duration],字标记为 字(time,duration) 圆括号格式 */
const QRC =
  "[ti:test]\n[offset:0]\n" +
  "[600,2000]你(1000,500)好(1500,600)\n" +
  "[3000,2000]信(3000,400)息(3400,400)行(3800,400)\n";

describe("parseLrcData", () => {
  it("解析 [mm:ss.xxx] 时间轴与文本", () => {
    const result = parseLrcData(LRC);
    expect(result).toEqual([
      { time: 12.5, content: "Hello world" },
      { time: 17, content: "Second line" },
    ]);
  });

  it("纯音乐歌词返回空数组", () => {
    const result = parseLrcData("[00:00.000]纯音乐，请您欣赏\n");
    expect(result).toEqual([]);
  });

  it("空输入返回空数组", () => {
    expect(parseLrcData(null)).toEqual([]);
    expect(parseLrcData("")).toEqual([]);
  });
});

describe("翻译对齐 (parseLyric lrc + tlyric)", () => {
  it("相同时间戳合并出 tran,\"//\" 翻译置空", async () => {
    const data: LyricApiData = { lrc: LRC, lrctrans: LRC_TRAN };
    const result = await parseLyric(data, null, defaultOptions);
    expect(result).not.toBeNull();
    expect(result!.hasLrcTran).toBe(true);
    expect(result!.lrc[0]).toMatchObject({ time: 12.5, content: "Hello world", tran: "你好世界" });
    expect(result!.lrc[1]).toMatchObject({ time: 17, content: "Second line", tran: "" });
  });
});

describe("parseYrcData", () => {
  it("解析 QRC 行头与逐字时间戳(圆括号先替换为花括号)", () => {
    const result = parseYrcData(QRC, false);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      time: 0.6,
      endTime: 2,
      content: [
        { time: 1, duration: 0.5, content: "你", endsWithSpace: false },
        { time: 1.5, duration: 0.6, content: "好", endsWithSpace: false },
      ],
    });
    expect(result[1].time).toBe(3);
    expect(result[1].content.map((w) => w.content).join("")).toBe("信息行");
  });

  it("removeInfo=true 时,字数 >2 且第 2 字起持续时间全等的行被丢弃", () => {
    const result = parseYrcData(QRC, true);
    // 第二行 3 个字持续时间均为 400ms,被判定为信息行丢弃;第一行仅 2 字,保留
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(0.6);
  });

  it("缺少 [offset:0] 前缀时安全返回空数组", () => {
    expect(parseYrcData("[600,2000]你(1000,500)\n", false)).toEqual([]);
  });
});

describe("parseLyric 整体", () => {
  it("仅有 yrc 无 lrc 时自动由逐字歌词生成 lrc", async () => {
    const data: LyricApiData = { qrc: QRC };
    const result = await parseLyric(data, null, defaultOptions);
    expect(result).not.toBeNull();
    expect(result!.hasYrc).toBe(true);
    expect(result!.yrc).toHaveLength(2);
    expect(result!.lrc).toEqual([
      { time: 0.6, content: "你好" },
      { time: 3, content: "信息行" },
    ]);
  });

  it("传入 { lrc } 最小对象返回完整 ParsedLyric 结构", async () => {
    const result = await parseLyric({ lrc: LRC }, null, defaultOptions);
    expect(result).not.toBeNull();
    expect(result!.hasLrcTran).toBe(false);
    expect(result!.hasYrc).toBe(false);
    expect(result!.lrc).toHaveLength(2);
    expect(result!.yrc).toEqual([]);
    expect(Array.isArray(result!.lrcAM)).toBe(true);
    expect(result!.yrcAM).toEqual([]);
    expect(result!.lyricResponse).toEqual({ lrc: LRC });
  });

  it("传入空对象返回安全空结构(源码不抛错)", async () => {
    const result = await parseLyric({}, null, defaultOptions);
    expect(result).not.toBeNull();
    expect(result!.lrc).toEqual([]);
    expect(result!.yrc).toEqual([]);
    expect(result!.hasYrc).toBe(false);
  });

  it("传入垃圾数据(null)返回 null(源码返回 false)", async () => {
    const result = await parseLyric(null as unknown as LyricApiData, null, defaultOptions);
    expect(result).toBeNull();
  });

  /**
   * 回归:接口对没有逐字时间轴的歌曲(如 004VU57w4JZWAg《爱如火》)会在 qrc 字段里
   * 回落一份 base64 的普通 lrc。此前 hasYrc 只看字段是否存在,于是出现
   * hasYrc=true 而 yrc/yrcAM 全空的组合,引擎在空数组上算歌词索引恒得 -1,
   * 整首歌不高亮、不滚动、底栏也没有歌词。
   */
  it("qrc 回落为 base64 普通 lrc 时 hasYrc 为 false,回落到 lrc / lrcAM", async () => {
    const result = await parseLyric(
      { lrc: LRC, qrc: btoa(LRC) },
      null,
      defaultOptions,
    );
    expect(result).not.toBeNull();
    expect(result!.yrc).toEqual([]);
    expect(result!.hasYrc).toBe(false);
    expect(result!.lrc).toHaveLength(2);
    expect(result!.lrcAM!.length).toBeGreaterThan(0);
  });

  it("qrc 确为逐字歌词时 hasYrc 仍为 true", async () => {
    const result = await parseLyric({ lrc: LRC, qrc: QRC }, null, defaultOptions);
    expect(result!.yrc.length).toBeGreaterThan(0);
    expect(result!.hasYrc).toBe(true);
  });

  /**
   * 回归:没有填词的曲子,接口回的是一句提示占位而非空歌词。
   * parseLrcData 只把提示行挡在 result.lrc 之外,AM 路线不经过那道过滤,
   * lrcAM 里会留下这一行 —— 全屏播放器按 amLines.length 判「有歌词」,
   * 于是把「此歌曲为没有填词的纯音乐，请您欣赏」当歌词滚给用户看。
   */
  it("纯音乐:提示行不落进 lrc / lrcAM,标志位一并归零", async () => {
    const result = await parseLyric(
      {
        lrc: "[00:00:00]此歌曲为没有填词的纯音乐，请您欣赏",
        lrctrans: "",
        // 提示行在 qrc 里的 base64 回落(与接口实际返回一致)
        qrc: btoa(
          String.fromCharCode(
            ...new TextEncoder().encode("[00:00:00]此歌曲为没有填词的纯音乐，请您欣赏"),
          ),
        ),
        qrctrans: "",
        qrcroma: "",
      },
      null,
      defaultOptions,
    );
    expect(result).not.toBeNull();
    expect(result!.lrc).toEqual([]);
    expect(result!.yrc).toEqual([]);
    expect(result!.lrcAM).toEqual([]);
    expect(result!.yrcAM).toEqual([]);
    expect(result!.hasYrc).toBe(false);
    expect(result!.hasLrcTran).toBe(false);
    expect(result!.hasLrcRoma).toBe(false);
  });

  it("纯音乐:网易措辞(纯音乐，请欣赏)同样清空", async () => {
    const result = await parseLyric(
      { lrc: "[00:00.000]纯音乐，请欣赏\n" },
      null,
      defaultOptions,
    );
    expect(result!.lrc).toEqual([]);
    expect(result!.lrcAM).toEqual([]);
  });

  it("真歌词里混着提示行不会被误清空", async () => {
    const result = await parseLyric(
      { lrc: "[00:00.000]纯音乐，请您欣赏\n" + LRC },
      null,
      defaultOptions,
    );
    // 首行命中旧规则 → result.lrc 为空,但 AM 路线仍有真歌词,不该整份清掉
    expect(result!.lrcAM!.length).toBeGreaterThan(1);
  });
});

describe("parseLocalLrc", () => {
  it("相同时间戳的第二行合并为翻译", () => {
    const result = parseLocalLrc("[00:10.000]Line one\n[00:10.000]翻译一\n[00:15.000]Line two\n");
    expect(result).not.toBeNull();
    expect(result!.hasLrcTran).toBe(true);
    expect(result!.lrc).toEqual([
      { time: 10, content: "Line one", tran: "翻译一" },
      { time: 15, content: "Line two" },
    ]);
  });
});

describe("computeWordProgress", () => {
  const line: YrcLine = {
    time: 0.6,
    endTime: 2,
    content: [
      { time: 1, duration: 0.5, content: "你", endsWithSpace: false },
      { time: 1.5, duration: 0.6, content: "好", endsWithSpace: false },
    ],
  };

  it("未播:全部 percent 为 0", () => {
    expect(computeWordProgress(line, 0.5, 0)).toEqual([
      { content: "你", percent: 0 },
      { content: "好", percent: 0 },
    ]);
  });

  it("进行中:区间内为 (offset-start)/duration", () => {
    const result = computeWordProgress(line, 1.25, 0);
    expect(result[0]).toEqual({ content: "你", percent: 0.5 });
    expect(result[1]).toEqual({ content: "好", percent: 0 });
  });

  it("已完成:>=end 为 1", () => {
    expect(computeWordProgress(line, 3, 0)).toEqual([
      { content: "你", percent: 1 },
      { content: "好", percent: 1 },
    ]);
  });

  it("hookOffset 参与偏移计算", () => {
    // offsetCurrentTime = 1.0 + 0.25 = 1.25 → 第一个字 50%
    const result = computeWordProgress(line, 1.0, 0.25);
    expect(result[0].percent).toBe(0.5);
  });

  it("percent 保留 6 位小数", () => {
    const oneWord: YrcLine = {
      time: 1,
      endTime: 2,
      content: [{ time: 1, duration: 0.3, content: "字", endsWithSpace: false }],
    };
    const result = computeWordProgress(oneWord, 1.1, 0);
    expect(result[0].percent).toBe(0.333333);
  });

  it("line 为空返回 []", () => {
    expect(computeWordProgress(undefined, 1, 0)).toEqual([]);
  });
});
