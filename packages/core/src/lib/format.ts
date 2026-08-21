/**
 * 格式化/通用纯函数工具
 * 移植自旧 src/utils/helper.js 中不依赖 DOM / storage / electron 的部分,
 * 逻辑照抄,仅补充 TS 类型。
 * (copyData、getLocalCoverData、getAssetUrl、getCacheData、getBlobUrlFromUrl、
 * getSessionId、getLocalStorageInfo 依赖运行环境,留在应用层。)
 */

/**
 * 过万/亿数字转化
 * @param num 需要格式化的数字
 * @returns 格式化后的字符串或原样返回的数字
 */
export const formatNumber = (num: number | string): string | number => {
  const n = Number(num);
  if (n === 0 || n < 10000) {
    return n;
  } else if (n < 100000000) {
    const numString = (n / 10000).toFixed(1);
    return numString.endsWith(".0") ? numString.slice(0, -2) + " 万" : numString + " 万";
  } else {
    const numString = (n / 100000000).toFixed(1);
    return numString.endsWith(".0") ? numString.slice(0, -2) + " 亿" : numString + " 亿";
  }
};

/**
 * 将输入数组拆分成指定大小的块
 * @param input - 要拆分的数组
 * @param size - 每个块的大小
 * @returns 包含拆分块的数组
 */
export const chunk = <T>(input: readonly T[], size: number): T[][] => {
  // 使用 reduce 方法迭代数组,arr 是累加器,item 是当前元素,idx 是当前元素的索引
  return input.reduce<T[][]>((arr, item, idx) => {
    // 如果当前索引是块大小的倍数,创建一个新块并将当前元素放入
    return idx % size === 0
      ? [...arr, [item]]
      : // 如果不是块的起始索引,将当前元素添加到最后一个块中
        [...arr.slice(0, -1), [...arr.slice(-1)[0], item]];
  }, []);
};

/**
 * 模糊搜索工具函数(支持深度搜索)
 * 重写修正:旧实现传入单个对象时返回 boolean(与 JSDoc 不符);
 * 现仅接受数组并恒返回数组(现有调用方均传数组)。
 * @param keyword - 要搜索的关键词
 * @param data - 要搜索的对象数组
 * @returns 包含关键词的对象数组
 */
export const fuzzySearch = <T>(keyword: string, data: readonly T[] | null | undefined): T[] => {
  try {
    // 递归遍历对象及其嵌套属性,任一字符串属性包含关键词即命中
    const searchInObject = (obj: unknown): boolean => {
      const record = obj as Record<string, unknown>;
      for (const key in record) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
          const value = record[key];
          if (typeof value === "object" && value !== null) {
            if (searchInObject(value)) {
              return true;
            }
          }
          if (value && typeof value === "string" && value.includes(keyword)) {
            return true;
          }
        }
      }
      return false;
    };
    if (!data) return [];
    return data.filter(searchInObject);
  } catch (error) {
    console.error("模糊搜索出现错误：", error);
    return [];
  }
};

/**
 * 将字节数格式化为可读的大小字符串。
 * 重写修正:旧实现单位表以 "K" 起始导致整体偏移一档(500 字节显示 "500 K");
 * 现使用标准单位表,0 与 <1024 字节显示为 "N B"。
 * @param bytes - 要格式化的字节数
 * @param decimals - 小数点位数(默认 2)
 * @returns 格式化后的大小字符串("10 KB")
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

/**
 * 将 "mm:ss" 格式的时长字符串解析为总秒数
 * @param durationString - "mm:ss" 格式的字符串
 * @returns 总秒数(非法输入返回 0)
 */
export const parseDurationToSeconds = (durationString: unknown): number => {
  try {
    if (!durationString || typeof durationString !== "string") {
      return 0;
    }
    const parts = durationString.split(":");
    if (parts.length < 2) {
      return 0;
    }
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  } catch (e) {
    console.error("解析时长失败:", e);
    return 0;
  }
};
