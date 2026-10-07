import { describe, expect, it } from "vitest";
import { parseLyric, type ParseLyricOptions } from "../src/lyrics/parse";

const options: ParseLyricOptions = {
  platform: "netease", removeInfo: true, removeAMInfo: true,
  title: "测试歌曲", artists: ["测试歌手"],
};
const YRC = '[0,900](0,900,0)作词：某人\n' +
  '[1000,1200](1000,400,0)真(1400,400,0)歌(1800,400,0)词\n' +
  '[4000,1000](4000,500,0)第(4500,500,0)二行';

describe("NetEase native lyrics", () => {
  it("保留等时长真实歌词和第一句，按原生 YRC 解析时间", async () => {
    const result = await parseLyric({ yrc: YRC }, null, options);
    expect(result?.hasYrc).toBe(true);
    expect(result?.yrc).toHaveLength(2);
    expect(result?.yrc[0]).toMatchObject({ time: 1, endTime: 2.2 });
    expect(result?.yrc[0].content).toEqual([
      { time: 1, duration: 0.4, content: "真", endsWithSpace: false },
      { time: 1.4, duration: 0.4, content: "歌", endsWithSpace: false },
      { time: 1.8, duration: 0.4, content: "词", endsWithSpace: false },
    ]);
    expect(result?.yrcAM?.[0]).toMatchObject({ startTime: 1000, endTime: 2200 });
    expect(result?.lrc[0].content).toBe("真歌词");
  });

  it("独立遵循普通/AM 信息过滤设置，按标题歌手过滤首行", async () => {
    const data = { lrc: "[00:00.00]测试歌曲 - 测试歌手\n[00:01.00]真正歌词\n[00:02.00]编曲：某人" };
    const filtered = await parseLyric(data, null, { ...options, removeAMInfo: false });
    expect(filtered?.lrc.map((line) => line.content)).toEqual(["真正歌词"]);
    expect(filtered?.lrcAM).toHaveLength(3);
    const kept = await parseLyric({ yrc: YRC }, null, { ...options, removeInfo: false });
    expect(kept?.yrc).toHaveLength(3);
    expect(kept?.yrcAM).toHaveLength(2);
  });

  it("翻译和罗马音优先采用 YRC 配对字段，过滤后按时间对齐", async () => {
    const result = await parseLyric({
      yrc: YRC,
      ytlrc: "[00:01.000]正确翻译\n[00:04.000]第二句翻译",
      lrctrans: "[00:01.000]普通翻译",
      yromalrc: "[00:01.000]zhen ge ci\n[00:04.000]di er hang",
      romalrc: "[00:01.000]普通音译",
    }, null, options);
    expect(result?.yrc[0]).toMatchObject({ tran: "正确翻译", roma: "zhen ge ci" });
    expect(result?.yrcAM?.[1]).toMatchObject({ translatedLyric: "第二句翻译", romanLyric: "di er hang" });
    expect(result?.hasYrcTran).toBe(true);
    expect(result?.hasYrcRoma).toBe(true);
  });

  it("YRC 无有效行时回落 LRC，纯音乐不显示提示行", async () => {
    const result = await parseLyric({ yrc: "invalid", lrc: "[00:01.000]普通歌词" }, null, options);
    expect(result?.hasYrc).toBe(false);
    expect(result?.lrc[0].content).toBe("普通歌词");
    expect(result?.lrcAM).toHaveLength(1);
    const pure = await parseLyric({ lrc: "[00:00.000]纯音乐，请欣赏" }, null, options);
    expect(pure?.lrc).toEqual([]);
    expect(pure?.lrcAM).toEqual([]);
  });

  it("跳过 JSON 元数据并保留从零开始/零时长词", async () => {
    const result = await parseLyric({ yrc:
      '{"t":0,"c":[{"tx":"作词：某人"}]}\n[0,1000](0,0,0)开(0,1000,0)始',
    }, null, options);
    expect(result?.yrc).toHaveLength(1);
    expect(result?.yrc[0].content[0]).toMatchObject({ time: 0, duration: 0, content: "开" });
    expect(result?.yrcAM?.[0].startTime).toBe(0);
  });

  it("QQ 默认路由忽略原生 YRC，网易云兼容旧后端 QRC 响应", async () => {
    const qq = await parseLyric({ yrc: YRC, lrc: "[00:01.000]QQ歌词" }, null, {
      removeInfo: false, removeAMInfo: false,
    });
    expect(qq?.hasYrc).toBe(false);
    expect(qq?.lrc[0].content).toBe("QQ歌词");
    const legacy = await parseLyric({ qrc: "[offset:0]\n[1000,1200]真(1000,400)歌(1400,400)词(1800,400)" }, null, options);
    expect(legacy?.hasYrc).toBe(true);
    expect(legacy?.yrc[0].content.map((word) => word.content).join("")).toBe("真歌词");
  });
});
