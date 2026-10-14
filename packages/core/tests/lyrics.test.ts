import { QRC_CREDITS } from "./fixtures/qrc-credits-quanshijiedeyu";
import { describe, expect, it } from "vitest";
import { parseLrc, parseQrc } from "@applemusic-like-lyrics/lyric";
import {
  parseAMData,
  parseLyric,
  parseLocalLrc,
  parseLrcData,
  parseYrcData,
  type LyricApiData,
  type ParseLyricOptions,
} from "../src/lyrics/parse";
import { computeWordProgress } from "../src/lyrics/word-progress";
import type { AMLine, YrcLine } from "../src/types/song";

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

describe("parseAMData 信息行过滤与翻译对齐", () => {
  // 贴近真实 QQ QRC 的结构:标题行/空行/创作者信息行(均为零时长) +
  // 正文第一句(匀速卡拉 OK,逐字时长全相等) + 交错的 BG 翻译行;
  // 翻译文件头部是创作者行对应的 "//" 占位
  const QRC_AM = [
    "[0,0]歌(0,0)名(0,0)-(0,0)手(0,0)",
    "[0,0](0,0)",
    "[0,0]作(0,0)词(0,0):(0,0)某(0,0)某(0,0)",
    "[0,2178]This (0,198)is (198,198)a (396,198)test (594,198)",
    "[2385,2160](你(2385,216)是(2601,216)测(2817,216)试(3033,216))(3249,216)",
    "[4770,2000]What (4770,330)is (5100,150)this (5250,450)",
  ].join("\n");
  const TRAN_AM = ["[00:00.00]//", "[00:00.16]//", "[00:00.97]你是一个测试", "[00:05.05]这是什么"].join(
    "\n",
  );
  const amText = (l: AMLine) => l.words.map((w) => w.word).join("");
  const timedQrcLine = (text: string, start: number, wordDuration = 200): string => {
    const characters = Array.from(text);
    return `[${start},${characters.length * wordDuration}]${characters
      .map((character, index) => `${character}(${start + index * wordDuration},${wordDuration})`)
      .join("")}`;
  };

  it("匀速正文行保留、创作者行丢弃、翻译按行对齐", () => {
    const lines = parseAMData(parseQrc(QRC_AM), parseLrc(TRAN_AM), [], true);
    expect(lines).toHaveLength(3);
    // 正文第一句(全行 198ms 匀速)必须保留,不再被误判为信息行
    expect(amText(lines[0])).toBe("This is a test ");
    // 翻译与主行按顺序一一对应,不再整体错位一行
    expect(lines[0].translatedLyric).toBe("你是一个测试");
    // BG 翻译行本身即译文,不再配翻译(也不挤占翻译位置)
    expect(amText(lines[1])).toBe("你是测试");
    expect(lines[1].translatedLyric).toBe("");
    expect(amText(lines[2])).toBe("What is this ");
    expect(lines[2].translatedLyric).toBe("这是什么");
  });

  it("removeAMInfo=false 时信息行保留但不挤占翻译位置", () => {
    const lines = parseAMData(parseQrc(QRC_AM), parseLrc(TRAN_AM), [], false);
    const texts = lines.map(amText);
    // 标题行与创作者行保留(旧 false 分支本就不 slice),翻译置空且不挤占位置
    expect(texts[0]).toBe("歌名-手");
    expect(lines[0].translatedLyric).toBe("");
    expect(texts[1]).toContain("作词");
    expect(lines[1].translatedLyric).toBe("");
    expect(texts[2]).toBe("This is a test ");
    expect(lines[2].translatedLyric).toBe("你是一个测试");
    expect(texts[3]).toBe("你是测试");
    expect(lines[3].translatedLyric).toBe("");
    expect(texts[4]).toBe("What is this ");
    expect(lines[4].translatedLyric).toBe("这是什么");
  });

  it.each(["词曲:张三", "Producer:X", "作詞:山田", "編曲／混音:李四", "mixed by: Y"])(
    "移除有真实时间轴的创作者信息行并保持翻译对齐: %s",
    (credit) => {
      const source = [timedQrcLine(credit, 1000), timedQrcLine("真实歌词", 5000)].join("\n");
      const translation = parseLrc("[00:01.00]//\n[00:05.00]正确翻译");
      const lines = parseAMData(parseQrc(source), translation, [], true);

      expect(lines).toHaveLength(1);
      expect(amText(lines[0])).toBe("真实歌词");
      expect(lines[0].translatedLyric).toBe("正确翻译");
    },
  );

  it("不带冒号的正文不会因角色前缀被误删", () => {
    const source = [
      timedQrcLine("词穷了", 1000),
      timedQrcLine("Producer of dreams", 3000),
    ].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["词穷了", "Producer of dreams"]);
  });

  it("移除开头的 1–2 字零时长标题行", () => {
    const source = ["[0,0]晴(0,0)天(0,0)", timedQrcLine("第一句", 1000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(amText(lines[0])).toBe("第一句");
  });

  const midBlockQrc = [
    "[0,0]晴(0,0)天(0,0)",
    timedQrcLine("第一句", 1000),
    "[3000,1000]制(3000,200)作(3200,200)人(3400,200):(3600,200)某(3800,200)",
    timedQrcLine("第二句", 5000),
  ].join("\n");

  it("中段信息行有占位时跳过占位并保持翻译对齐", () => {
    const translation = parseLrc(
      "[00:00.00]//\n[00:01.00]翻译一\n[00:03.00]//\n[00:05.00]翻译二",
    );
    const lines = parseAMData(parseQrc(midBlockQrc), translation, [], true);

    expect(lines.map(amText)).toEqual(["第一句", "第二句"]);
    expect(lines.map((line) => line.translatedLyric)).toEqual(["翻译一", "翻译二"]);
  });

  it("中段信息行没有占位时不跳过后续有效翻译", () => {
    const translation = parseLrc("[00:00.00]//\n[00:01.00]翻译一\n[00:05.00]翻译二");
    const lines = parseAMData(parseQrc(midBlockQrc), translation, [], true);

    expect(lines.map(amText)).toEqual(["第一句", "第二句"]);
    expect(lines.map((line) => line.translatedLyric)).toEqual(["翻译一", "翻译二"]);
  });

  it("真实 QRC 中移除标题、创作者行与版权声明但保留歌手标记和歌词", () => {
    const lines = parseAMData(parseQrc(QRC_CREDITS), [], [], true);
    const texts = lines.map(amText);

    expect(lines).toHaveLength(5);
    expect(texts[0]).toBe("女：");
    expect(texts[1]).toMatch(/^你知道吗/);
    expect(texts[2]).toMatch(/^在某/);
    expect(texts[3]).toBe("男：");
    expect(texts[4]).toMatch(/^你知道吗/);
    expect(texts.filter((text) => text.includes("："))).toEqual(["女：", "男："]);
    expect(texts.join("\n")).not.toContain("全世界的雨");
    expect(texts.join("\n")).not.toContain("未经许可");
  });

  it("removeAMInfo=false 时保留真实 QRC 的标题和信息行", () => {
    const lines = parseAMData(parseQrc(QRC_CREDITS), [], [], false);

    expect(lines.length).toBeGreaterThan(5);
    expect(amText(lines[0])).toContain("全世界的雨");
  });

  it.each([
    "艺术总监：李朋",
    "母带处理工程师：赵靖",
    "总策划/监制：李静楠",
    "混音室：@SBMS",
  ])("组合角色头会移除有真实时间轴的信息行: %s", (credit) => {
    const source = [timedQrcLine(credit, 1000), timedQrcLine("真实歌词", 5000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines).toHaveLength(1);
    expect(amText(lines[0])).toBe("真实歌词");
  });

  it("保留歌手标记和不匹配角色的正文", () => {
    const source = [
      timedQrcLine("女：", 1000),
      timedQrcLine("男：", 2000),
      timedQrcLine("合：", 3000),
      timedQrcLine("人声：某某", 4000),
      timedQrcLine("总有一天：我会", 5000),
    ].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["女：", "男：", "合：", "总有一天：我会"]);
  });

  it("仅过滤首个 0ms 且包含分隔短横线的标题行", () => {
    const source = [timedQrcLine("第一句", 1000), timedQrcLine("A - B", 3000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["第一句", "A - B"]);
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

  it("removeInfo=true 时,有真实时间轴的匀速行不再被误判为信息行", () => {
    const result = parseYrcData(QRC, true);
    // 第二行 3 个字持续时间均为 400ms,但行时间戳 [3000,2000] 有真实时间轴:
    // 旧启发式「逐字时长全相等即信息行」会把它误杀,正文第一句就是这么丢的。
    // 修正后只有「整行没有任何时间信息」的行才会被丢弃;第一行仅 2 字,保留
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(0.6);
    expect(result[1].time).toBe(3);
  });

  it("removeInfo=true 时移除只有两个字词的信息行", () => {
    const result = parseYrcData(
      "[offset:0]\n[5000,600]词:(5000,300)甲(5300,300)\n",
      true,
    );

    expect(result).toEqual([]);
  });

  it("removeInfo=true 时过滤真实 QRC 的标题、信息行和版权声明", () => {
    const result = parseYrcData(QRC_CREDITS, true);
    const texts = result.map((line) => line.content.map((word) => word.content).join(""));

    expect(result).toHaveLength(5);
    expect(texts[0]).toBe("女：");
    expect(texts.filter((text) => text.includes("："))).toEqual(["女：", "男："]);
    expect(texts.join("\n")).not.toContain("全世界的雨");
    expect(texts.join("\n")).not.toContain("未经许可");
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

 describe("网易云行级音译", () => {
  it("将 LRC 音译对齐到普通及逐字歌词", async () => {
    const result = await parseLyric({ lrc: "[00:00.600]你好", qrc: QRC, qrcroma: "[00:00.600]ni hao" }, null, defaultOptions);
    expect(result?.lrc[0].roma).toBe("ni hao");
    expect(result?.yrc[0].roma).toBe("ni hao");
    expect(result?.lrcAM?.[0].words[0].romanWord).toBe("ni hao");
  });
});
