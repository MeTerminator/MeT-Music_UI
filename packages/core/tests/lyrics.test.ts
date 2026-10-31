import qqTimingFixture from "./fixtures/qq-lyric-timing-001FgbLY33TZKq.json";
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

  it.each([
    "词曲:张三",
    "Producer:X",
    "作詞:山田",
    "編曲／混音:李四",
    "mixed by: Y",
    "词 Lyricist：五月天 阿信",
    "共同制作人 Co-Producer：詹宏业",
    "编曲 Music Arrangement：五月天 阿信",
    "编曲协力 Music Arrangement Coordinator：黄庆原",
    "和声编写/演唱 Backing Vocal/Arrangement：洪俊扬",
    "大合唱 Crowd Vocals：詹宏业",
    "母带后期处理工程师 Mastering Engineer：Wayson",
    "母带后期处理录音室 Mastering Studio：Wayson",
    "艺术总监：李朋",
    "母带处理工程师：赵靖",
    "总策划/监制：李静楠",
    "混音室：@SBMS",
    "配唱制作人：吴青峰/陈君豪",
    "音频剪辑：叶育轩/陈君豪",
    "词曲版权管理：索尼音乐版权代理（北京）有限公司",
  ])(
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

  it("移除带括号前缀的版权声明", () => {
    const notice = "【本作品声明，著作权权利保留。未经著作权人书面许可，不得以任何方式使用。】";
    const source = [timedQrcLine(notice, 1000, 1), timedQrcLine("真实歌词", 5000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["真实歌词"]);
  });

  it("移除末尾双语创作者行时保持翻译对齐", () => {
    const source = [
      timedQrcLine("歌词一", 1000),
      timedQrcLine("歌词二", 2000),
      timedQrcLine("词 Lyricist：A", 3000),
      timedQrcLine("曲 Composer：B", 4000),
    ].join("\n");
    const translation = parseLrc(
      "[00:01.00]译一\n[00:02.00]译二\n[00:03.00]//\n[00:04.00]//",
    );
    const lines = parseAMData(parseQrc(source), translation, [], true);

    expect(lines).toHaveLength(2);
    expect(lines.map(amText)).toEqual(["歌词一", "歌词二"]);
    expect(lines.map((line) => line.translatedLyric)).toEqual(["译一", "译二"]);
  });

  it("过滤 QQ 双语制作头(Recorded Studio/Vocal Direction/Rap Direction/A&R 及 and/by 连写)", () => {
    const source = [
      timedQrcLine("录音棚 Recorded Studio：金诺佳音国际文化传媒", 1000),
      timedQrcLine("声乐指导 Vocal Direction：Simon Yan/崔加油", 2000),
      timedQrcLine("说唱指导 Rap Direction：ReddB 白吉勒", 3000),
      timedQrcLine("音乐企划 A&R：薯仔", 4000),
      timedQrcLine("吉他 Guitar by：向鑫/吴余涛", 5000),
      timedQrcLine("混音/母带 Mixed and Mastered by：沈会斌", 6000),
      timedQrcLine("正文第一句", 7000),
    ].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines).toHaveLength(1);
    expect(amText(lines[0])).toBe("正文第一句");
  });

  it("不匹配角色和没有冒号的正文不会被误删", () => {
    const source = [
      timedQrcLine("词穷了", 1000),
      timedQrcLine("Producer of dreams", 3000),
      timedQrcLine("Music is my life：yeah", 5000),
      timedQrcLine("Alive again a party & a game", 7000),
    ].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual([
      "词穷了",
      "Producer of dreams",
      "Music is my life：yeah",
      "Alive again a party & a game",
    ]);
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

  it("过滤带真实时间轴的标题行与版权声明", () => {
    const source = [
      timedQrcLine("歌名 - 歌手", 0, 45),
      timedQrcLine("未经许可，不得翻唱或使用", 1000, 1),
      timedQrcLine("第一句", 2000),
    ].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["第一句"]);
  });

  it("仅过滤首个 0ms 且包含分隔短横线的标题行", () => {
    const source = [timedQrcLine("第一句", 1000), timedQrcLine("A - B", 3000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual(["第一句", "A - B"]);
  });

  it("超长连写角色串不会卡住解析", () => {
    const first = "词曲".repeat(500);
    const second = `${first}x：y`;
    const source = [timedQrcLine(first, 1000), timedQrcLine(second, 3000)].join("\n");
    const lines = parseAMData(parseQrc(source), [], [], true);

    expect(lines.map(amText)).toEqual([first, second]);
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


describe("首行歌曲名信息过滤", () => {
  const getAMTexts = (lines: AMLine[] = []) => lines.map((line) => line.words.map((word) => word.word).join(""));

  for (const platform of ["qq", "netease"] as const) {
    for (const wordTimed of [false, true]) {
      it(`${platform} ${wordTimed ? "逐字" : "普通"}歌词过滤非零时间首行，独立遵循普通/AM 开关`, async () => {
        const texts = ["测试歌曲-另一位歌手", "真正歌词", "测试歌曲-正文保留"];
        const data = wordTimed
          ? platform === "netease"
            ? { yrc: texts.map((text, index) => `[${1000 + index * 3000},2000](${1000 + index * 3000},2000,0)${text}`).join("\n") }
            : { qrc: "[offset:0]\n" + texts.map((text, index) => `[${1000 + index * 3000},2000]${text}(${1000 + index * 3000},2000)`).join("\n") }
          : { lrc: "[00:00.00]\n" + texts.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n") };
        for (const removeInfo of [false, true]) {
          for (const removeAMInfo of [false, true]) {
            const result = await parseLyric(data, null, {
              platform, title: "测试歌曲", artists: ["当前歌手"], removeInfo, removeAMInfo,
            });
            expect(result?.lrc.map((line) => line.content)).toEqual(removeInfo ? texts.slice(1) : texts);
            expect(getAMTexts(wordTimed ? result?.yrcAM : result?.lrcAM)).toEqual(removeAMInfo ? texts.slice(1) : texts);
            if (wordTimed) expect(result?.yrc.map((line) => line.content.map((word) => word.content).join("")))
              .toEqual(removeInfo ? texts.slice(1) : texts);
          }
        }
      });
    }
  }

  it("首行缺少歌曲名或连字符时保留", async () => {
    for (const content of ["别的歌曲-歌手", "测试歌曲的第一句"]) {
      for (const platform of ["qq", "netease"] as const) {
        const result = await parseLyric({ lrc: `[00:01.00]${content}\n[00:04.00]真正歌词` }, null, {
          platform, title: "测试歌曲", removeInfo: true, removeAMInfo: true,
        });
        expect(result?.lrc[0].content).toBe(content);
        expect(getAMTexts(result?.lrcAM)[0]).toBe(content);
      }
    }
  });
});


describe("任意行歌手标签过滤", () => {
  for (const platform of ["qq", "netease"] as const) {
    for (const wordTimed of [false, true]) {
      it(`${platform} ${wordTimed ? "逐字" : "普通"}歌词按独立开关移除歌手冒号行`, async () => {
        const texts = ["开场歌词", "  歌手甲：  ", "第一句", "\t演唱 歌手乙 : ", "歌手甲：唱出歌词", "陌生人：", "歌手乙", "尾声"];
        const data = wordTimed
          ? platform === "netease"
            ? { yrc: texts.map((text, index) => `[${1000 + index * 3000},2000](${1000 + index * 3000},2000,0)${text}`).join("\n") }
            : { qrc: "[offset:0]\n" + texts.map((text, index) => `[${1000 + index * 3000},2000]${text}(${1000 + index * 3000},2000)`).join("\n") }
          : { lrc: texts.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n") };
        const expected = texts.map((text) => text.trim());
        const filtered = expected.filter((_, index) => index !== 1 && index !== 3);
        for (const removeInfo of [false, true]) {
          for (const removeAMInfo of [false, true]) {
            const result = await parseLyric(data, null, {
              platform, title: "测试歌曲", artists: [" ", "歌手甲", " 歌手乙 "], removeInfo, removeAMInfo,
            });
            expect(result?.lrc.map((line) => line.content.trim())).toEqual(removeInfo ? filtered : expected);
            const amLines = wordTimed ? result?.yrcAM : result?.lrcAM;
            expect(amLines?.map((line) => line.words.map((word) => word.word).join("").trim()))
              .toEqual(removeAMInfo ? filtered : expected);
            if (wordTimed) expect(result?.yrc.map((line) => line.content.map((word) => word.content).join("").trim()))
              .toEqual(removeInfo ? filtered : expected);
          }
        }
      });
    }
  }
});

describe("过滤歌曲信息后翻译和音译保持配对", () => {
  for (const platform of ["qq", "netease"] as const) {
    for (const wordTimed of [false, true]) {
      for (const includeInfo of [false, true]) {
        it(`${platform} ${wordTimed ? "逐字" : "普通"}歌词，辅助歌词${includeInfo ? "含有" : "省略"}信息行`, async () => {
          const texts = ["测试歌曲-歌手甲", "第一句", "歌手甲：", "第二句", "歌手乙:", "第三句"];
          const translations = ["Song - Singer", "译文一", "Singer A:", "译文二", "Singer B:", "译文三"];
          const romaji = ["song - singer", "roma one", "singer a:", "roma two", "singer b:", "roma three"];
          const isInfoIndex = (index: number) => [0, 2, 4].includes(index);
          const lrc = (lines: string[], sidecar = false) => lines.flatMap((text, index) =>
            sidecar && !includeInfo && isInfoIndex(index) ? [] : [`[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`],
          ).join("\n");
          const qrc = (lines: string[], sidecar = false) => "[offset:0]\n" + lines.flatMap((text, index) =>
            sidecar && !includeInfo && isInfoIndex(index) ? [] : [`[${1000 + index * 3000},2000]${text}(${1000 + index * 3000},2000)`],
          ).join("\n");
          const data: LyricApiData = platform === "netease" ? {
            lrc: lrc(texts),
            ...(wordTimed ? { yrc: texts.map((text, index) => `[${1000 + index * 3000},2000](${1000 + index * 3000},2000,0)${text}`).join("\n") } : {}),
            lrctrans: lrc(translations, true), romalrc: lrc(romaji, true),
          } : {
            lrc: lrc(texts), ...(wordTimed ? { qrc: qrc(texts) } : {}),
            lrctrans: lrc(translations, true), qrctrans: lrc(translations, true),
            qrcroma: wordTimed ? qrc(romaji, true) : lrc(romaji, true),
          };
          for (const removeInfo of [false, true]) {
            const result = await parseLyric(data, null, {
              platform, title: "测试歌曲", artists: ["歌手甲", "歌手乙"], removeInfo, removeAMInfo: removeInfo,
            });
            const expected = [1, 3, 5].map((index) => [texts[index], translations[index], romaji[index]]);
            expect(result?.lrc.filter((line) => !isInfoIndex(texts.indexOf(line.content)))
              .map((line) => [line.content, line.tran, line.roma])).toEqual(expected);
            if (wordTimed) expect(result?.yrc.filter((line) => !isInfoIndex(texts.indexOf(line.content.map((word) => word.content).join(""))))
              .map((line) => [line.content.map((word) => word.content).join(""), line.tran, line.roma])).toEqual(expected);
            const am = wordTimed ? result?.yrcAM : result?.lrcAM;
            expect(am?.filter((line) => !isInfoIndex(texts.indexOf(line.words.map((word) => word.word).join(""))))
              .map((line) => [line.words.map((word) => word.word).join(""), line.translatedLyric,
                platform === "netease" ? line.romanLyric : line.words.map((word) => word.romanWord).join("")])).toEqual(expected);
          }
        });
      }
    }
  }
});


it("QQ 时间轴不一致时，先按原顺序配对再移除标题和歌手标签", () => {
  const main = parseLrc("[00:01.00]测试歌曲-歌手甲\n[00:04.00]第一句\n[00:07.00]歌手甲：\n[00:10.00]第二句");
  const tran = parseLrc("[00:01.50]Song - Singer\n[00:04.50]译文一\n[00:07.50]Singer:\n[00:10.50]译文二");
  const roma = parseLrc("[00:01.50]title\n[00:04.50]roma one\n[00:07.50]singer\n[00:10.50]roma two");
  const result = parseAMData(main, tran, roma, true, "测试歌曲", ["歌手甲"]);
  expect(result.map((line) => [line.words[0].word, line.translatedLyric, line.words[0].romanWord]))
    .toEqual([["第一句", "译文一", "roma one"], ["第二句", "译文二", "roma two"]]);
});


describe("QQ 001FgbLY33TZKq 的 QRC/LRC 时间精度回归", () => {
  it.each([false, true])("过滤开关为 %s 时保留全部 56 行翻译及其对应关系", async (removeInfo) => {
    // 使用实际接口的全部时间戳和占位分布，正文替换为测试文本。
    const contents = qqTimingFixture.map((_, index) => index === 0 ? "测试歌曲-测试歌手"
      : index === 1 ? "Lyrics by：作者" : index === 2 ? "Composed by：作者" : `正文${index}`);
    const qrc = "[offset:0]\n" + qqTimingFixture.map((row, index) =>
      `[${row.start},${row.duration}]${contents[index]}(${row.start},${row.duration})`,
    ).join("\n");
    const translation = qqTimingFixture.map((row, index) => {
      const minutes = Math.floor(row.translationStart / 60000);
      const seconds = ((row.translationStart % 60000) / 1000).toFixed(2).padStart(5, "0");
      return `[${minutes}:${seconds}]${row.hasTranslation ? `译文${index}` : "//"}`;
    }).join("\n");
    const result = await parseLyric({ qrc, qrctrans: translation }, null, {
      title: "测试歌曲", artists: ["测试歌手"], removeInfo, removeAMInfo: removeInfo,
    });
    expect(result?.yrcAM?.filter((line) => line.translatedLyric)).toHaveLength(56);
    for (const line of result?.yrcAM ?? []) {
      const content = line.words.map((word) => word.word).join("");
      const index = contents.indexOf(content);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(line.translatedLyric).toBe(qqTimingFixture[index].hasTranslation ? `译文${index}` : "");
    }
  });

  it("音译也允许不足 10ms 的时间精度差，缺失的行不借用后续音译", () => {
    const main = parseLrc("[00:01.009]一句\n[00:04.007]二句\n[00:07.005]三句");
    const translation = parseLrc("[00:01.00]译一\n[00:04.00]译二\n[00:07.00]译三");
    const roma = parseLrc("[00:01.00]roma one\n[00:07.00]roma three");
    const result = parseAMData(main, translation, roma, true);
    expect(result.map((line) => [line.translatedLyric, line.words[0].romanWord]))
      .toEqual([["译一", "roma one"], ["译二", ""], ["译三", "roma three"]]);
  });
});

describe("首行匹配 name、title 或任一歌手名", () => {
  for (const platform of ["qq", "netease"] as const) {
    for (const wordTimed of [false, true]) {
      it.each(["主名称-版本", "显示标题 - 版本", "未知歌曲-歌手乙"])(
        `${platform} ${wordTimed ? "逐字" : "普通"}过滤首行 %s 并保留辅助歌词配对`, async (first) => {
          const texts = [first, "第一句", "歌手乙-中段正文", "第二句"];
          const translations = ["header", "译一", "译二", "译三"];
          const romaji = ["header", "roma one", "roma two", "roma three"];
          const lrc = (lines: string[]) => lines.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n");
          const qrc = (lines: string[]) => "[offset:0]\n" + lines.map((text, index) => `[${1000 + index * 3000},2000]${text}(${1000 + index * 3000},2000)`).join("\n");
          const data: LyricApiData = platform === "qq" ? {
            lrc: lrc(texts), ...(wordTimed ? { qrc: qrc(texts) } : {}),
            lrctrans: lrc(translations), qrctrans: lrc(translations), qrcroma: qrc(romaji),
          } : {
            lrc: lrc(texts), ...(wordTimed ? { yrc: texts.map((text, index) => `[${1000 + index * 3000},2000](${1000 + index * 3000},2000,0)${text}`).join("\n") } : {}),
            lrctrans: lrc(translations), romalrc: lrc(romaji),
          };
          for (const removeInfo of [false, true]) {
            for (const removeAMInfo of [false, true]) {
              const result = await parseLyric(data, null, {
                platform, name: "主名称", title: "显示标题", artists: ["歌手甲", " 歌手乙 "], removeInfo, removeAMInfo,
              });
              const expected = texts.map((text, index) => [text, translations[index], romaji[index]]);
              expect(result?.lrc.map((line) => [line.content, line.tran, line.roma]))
                .toEqual(removeInfo ? expected.slice(1) : expected);
              const am = wordTimed ? result?.yrcAM : result?.lrcAM;
              expect(am?.map((line) => [line.words.map((word) => word.word).join(""), line.translatedLyric,
                platform === "netease" ? line.romanLyric : line.words.map((word) => word.romanWord).join("")]))
                .toEqual(removeAMInfo ? expected.slice(1) : expected);
              if (wordTimed) expect(result?.yrc.map((line) => line.content.map((word) => word.content).join("")))
                .toEqual(removeInfo ? texts.slice(1) : texts);
            }
          }
        },
      );
    }
  }

  it("没有连字符或未匹配任何名称时保留，空名称不命中", async () => {
    for (const first of ["未知歌曲-未知歌手", "主名称", "显示标题", "歌手乙"]) {
      const result = await parseLyric({ lrc: `[00:01.00]${first}\n[00:04.00]正文` }, null, {
        name: "主名称", title: "显示标题", artists: ["", " ", "歌手乙"], removeInfo: true, removeAMInfo: true,
      });
      expect(result?.lrc[0].content).toBe(first);
      expect(result?.lrcAM?.[0].words[0].word).toBe(first);
    }
  });
});


describe("制作、来源及推广计划信息整行排除", () => {
  for (const platform of ["qq", "netease"] as const) {
    it.each(["器乐团队：", "器乐团队:", "说唱作曲：", "说唱作曲:", "戏曲：", "戏曲:", "引用：", "引用:", "酷狗音乐推广计划", "计划由酷狗发起", "音乐人成长计划", "计划支持音乐人", "QQ音乐新星计划", "计划来自QQ音乐"])(`${platform} 支持 %s，并遵循各自过滤开关`, async (role) => {
      const texts = ["第一句", `${role}测试信息`, "第二句"];
      const lrc = (lines: string[]) => lines.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n");
      const data = {
        lrc: lrc(texts), lrctrans: lrc(["译一", "乐团信息", "译二"]),
        ...(platform === "qq"
          ? { qrc: "[offset:0]\n" + texts.map((text, index) => `[${1000 + index * 3000},2000]${text}(${1000 + index * 3000},2000)`).join("\n"), qrctrans: lrc(["译一", "乐团信息", "译二"]) }
          : { yrc: texts.map((text, index) => `[${1000 + index * 3000},2000](${1000 + index * 3000},2000,0)${text}`).join("\n"), ytlrc: lrc(["译一", "乐团信息", "译二"]) }),
      };
      for (const removeInfo of [false, true]) {
        for (const removeAMInfo of [false, true]) {
          const result = await parseLyric(data, null, { platform, removeInfo, removeAMInfo });
          const all = texts.map((text, index) => [text, ["译一", "乐团信息", "译二"][index]]);
          const filtered = [all[0], all[2]];
          expect(result?.lrc.map((line) => [line.content, line.tran])).toEqual(removeInfo ? filtered : all);
          expect(result?.yrc.map((line) => [line.content.map((word) => word.content).join(""), line.tran])).toEqual(removeInfo ? filtered : all);
          for (const lines of [result?.lrcAM, result?.yrcAM]) {
            expect(lines?.map((line) => [line.words.map((word) => word.word).join(""), line.translatedLyric]))
              .toEqual(removeAMInfo ? filtered : all);
          }
        }
      }
    });
  }
});


it("推广计划过滤要求同一行同时出现两组关键词", async () => {
  const texts = ["独自规划未来的计划", "酷狗陪你听歌", "我是音乐人", "打开QQ音乐", "计划", "酷狗", "明天见"];
  const lrc = texts.map((text, index) => `[00:${String(1 + index * 3).padStart(2, "0")}.00]${text}`).join("\n");
  for (const platform of ["qq", "netease"] as const) {
    const result = await parseLyric({ lrc }, null, { platform, removeInfo: true, removeAMInfo: true });
    expect(result?.lrc.map((line) => line.content)).toEqual(texts);
    expect(result?.lrcAM?.map((line) => line.words.map((word) => word.word).join(""))).toEqual(texts);
  }
});
