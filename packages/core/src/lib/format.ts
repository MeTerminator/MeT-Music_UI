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
 * 将字符串转换为小驼峰形式(Camel Case)
 * @param str - 需要转换的字符串
 * @returns 转换后的小驼峰形式字符串
 */
export const toCamelCase = (str: string): string => {
  // 使用正则表达式将字符串中每个单词的首字母大写
  return str.replace(/(\w)(\w*)/g, (_, firstChar: string, rest: string) => {
    // 对第一个单词的首字母进行小写转换
    return firstChar.toLowerCase() + rest.toLowerCase();
  });
};

/**
 * 模糊搜索工具函数(支持深度搜索)
 * @param keyword - 要搜索的关键词
 * @param data - 要搜索的数据,可以是对象或对象数组
 * @returns 包含关键词的对象数组(传入单个对象时返回是否匹配的布尔值,与旧实现一致)
 */
export function fuzzySearch<T>(keyword: string, data: readonly T[] | null | undefined): T[];
export function fuzzySearch(keyword: string, data: unknown): unknown[] | boolean;
export function fuzzySearch(keyword: string, data: unknown): unknown[] | boolean {
  try {
    /**
     * 递归函数:遍历对象及其嵌套属性,过滤包含关键词的对象
     * @param obj - 要检查的对象
     * @returns 如果找到匹配的属性值,返回 true;否则返回 false
     */
    const searchInObject = (obj: unknown): boolean => {
      const record = obj as Record<string, unknown>;
      for (const key in record) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
          const value = record[key];
          // 如果属性值是对象,则递归调用
          if (typeof value === "object" && value !== null) {
            if (searchInObject(value)) {
              return true;
            }
          }
          // 检查属性值是否是字符串并包含关键词
          if (value && typeof value === "string" && value.includes(keyword)) {
            return true;
          }
        }
      }
      return false;
    };
    if (!data) return [];
    // 如果传入的是数组,遍历数组
    if (Array.isArray(data)) {
      return data.filter(searchInObject);
    }
    // 如果传入的是对象,直接调用递归函数
    return searchInObject(data);
  } catch (error) {
    console.error("模糊搜索出现错误：", error);
    return [];
  }
}

/**
 * 从文件名生成数字 ID
 * @param fileName - 文件名
 * @returns 生成的数字ID
 */
export const generateId = (fileName: string): number => {
  if (!fileName) return 1000000000;
  // 将文件名转换为哈希值
  let hash = 0;
  for (let i = 0; i < fileName.length; i++) {
    hash = (hash << 5) - hash + fileName.charCodeAt(i);
  }
  // 将哈希值转换为正整数
  const numericId = Math.abs(hash % 10000000000);
  return numericId;
};

/**
 * 将字节数格式化为可读的大小字符串。
 * @param bytes - 要格式化的字节数
 * @param decimals - 小数点位数(默认 2)
 * @returns 格式化后的大小字符串("10 KB")
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 K";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["K", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
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
