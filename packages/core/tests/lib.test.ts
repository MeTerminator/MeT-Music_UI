import { describe, expect, it } from "vitest";

import {
  getGreetings,
  getSongTime,
  getSongPlayTime,
  getCommentTime,
  djFormatDate,
} from "../src/lib/time";
import {
  formatNumber,
  chunk,
  generateId,
  formatBytes,
  fuzzySearch,
  parseDurationToSeconds,
} from "../src/lib/format";

describe("getSongTime", () => {
  it("秒数小于 10 时补零", () => {
    expect(getSongTime(245000)).toBe("4:05");
    expect(getSongTime(0)).toBe("0:00");
  });

  it("秒数大于等于 10 时不补零,分钟数不补零", () => {
    expect(getSongTime(83000)).toBe("1:23");
    expect(getSongTime(605000)).toBe("10:05");
    expect(getSongTime(3599000)).toBe("59:59");
  });

  it("忽略不足一秒的毫秒余数", () => {
    expect(getSongTime(245999)).toBe("4:05");
  });
});

describe("getSongPlayTime", () => {
  it("分钟与秒均补零到两位", () => {
    expect(getSongPlayTime(0)).toBe("00:00");
    expect(getSongPlayTime(65)).toBe("01:05");
    expect(getSongPlayTime(125)).toBe("02:05");
    expect(getSongPlayTime(3599)).toBe("59:59");
  });

  it("小数秒向下取整", () => {
    expect(getSongPlayTime(65.9)).toBe("01:05");
  });
});

describe("parseDurationToSeconds", () => {
  it("解析 mm:ss 字符串", () => {
    expect(parseDurationToSeconds("03:45")).toBe(225);
    expect(parseDurationToSeconds("0:30")).toBe(30);
    expect(parseDurationToSeconds("10:00")).toBe(600);
  });

  it("非法输入返回 0", () => {
    expect(parseDurationToSeconds("")).toBe(0);
    expect(parseDurationToSeconds(null)).toBe(0);
    expect(parseDurationToSeconds(undefined)).toBe(0);
    expect(parseDurationToSeconds(123)).toBe(0);
    expect(parseDurationToSeconds("abc")).toBe(0);
    expect(parseDurationToSeconds("5")).toBe(0);
    expect(parseDurationToSeconds("aa:bb")).toBe(0);
  });
});

describe("formatNumber", () => {
  it("小于一万原样返回数字", () => {
    expect(formatNumber(0)).toBe(0);
    expect(formatNumber(9999)).toBe(9999);
    expect(formatNumber("123")).toBe(123);
  });

  it("万级格式化,整数结果去掉 .0", () => {
    expect(formatNumber(10000)).toBe("1 万");
    expect(formatNumber(123456)).toBe("12.3 万");
    expect(formatNumber(99999999)).toBe("10000 万");
  });

  it("亿级格式化", () => {
    expect(formatNumber(100000000)).toBe("1 亿");
    expect(formatNumber(250000000)).toBe("2.5 亿");
  });
});

describe("chunk", () => {
  it("按指定大小拆分数组", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk(["a", "b", "c"], 3)).toEqual([["a", "b", "c"]]);
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("空数组返回空数组", () => {
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("generateId", () => {
  it("同输入同输出(稳定性)", () => {
    expect(generateId("track01.mp3")).toBe(generateId("track01.mp3"));
    expect(generateId("周杰伦 - 晴天.flac")).toBe(generateId("周杰伦 - 晴天.flac"));
  });

  it("已知哈希值保持不变", () => {
    expect(generateId("a")).toBe(97);
    expect(generateId("abc")).toBe(96354);
  });

  it("空文件名返回默认 ID", () => {
    expect(generateId("")).toBe(1000000000);
  });

  it("返回非负整数", () => {
    const id = generateId("some/very/long/path/file.mp3");
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(0);
  });
});

describe("formatBytes", () => {
  it("零字节返回 0 K", () => {
    expect(formatBytes(0)).toBe("0 K");
  });

  it("按 1024 进制换算单位", () => {
    expect(formatBytes(500)).toBe("500 K");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("自定义小数位数", () => {
    expect(formatBytes(1234, 0)).toBe("1 KB");
    expect(formatBytes(1234, 3)).toBe("1.205 KB");
  });
});

describe("fuzzySearch", () => {
  const songs = [
    { name: "晴天", artist: { name: "周杰伦" }, album: { name: "叶惠美" } },
    { name: "江南", artist: { name: "林俊杰" }, album: { name: "第二天堂" } },
    { name: "稻香", artist: { name: "周杰伦" }, album: { name: "魔杰座" } },
  ];

  it("数组深度匹配嵌套属性", () => {
    expect(fuzzySearch("周杰伦", songs)).toEqual([songs[0], songs[2]]);
    expect(fuzzySearch("叶惠美", songs)).toEqual([songs[0]]);
    expect(fuzzySearch("天", songs)).toEqual([songs[0], songs[1]]);
  });

  it("无匹配返回空数组", () => {
    expect(fuzzySearch("五月天", songs)).toEqual([]);
  });

  it("空数据返回空数组", () => {
    expect(fuzzySearch("周杰伦", null)).toEqual([]);
    expect(fuzzySearch("周杰伦", undefined)).toEqual([]);
    expect(fuzzySearch("周杰伦", [])).toEqual([]);
  });
});

describe("依赖当前时钟的函数(仅校验返回类型)", () => {
  it("getGreetings 返回字符串", () => {
    expect(typeof getGreetings()).toBe("string");
  });

  it("getCommentTime 返回字符串", () => {
    expect(typeof getCommentTime(Date.now())).toBe("string");
    expect(typeof getCommentTime(Date.now() - 90 * 24 * 3600 * 1000)).toBe("string");
  });

  it("djFormatDate 返回字符串", () => {
    expect(typeof djFormatDate(Date.now())).toBe("string");
    expect(typeof djFormatDate(Date.now() - 90 * 24 * 3600 * 1000)).toBe("string");
  });
});
