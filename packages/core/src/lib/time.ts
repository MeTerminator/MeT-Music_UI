/**
 * 时间相关纯函数工具
 * 移植自旧 src/utils/timeTools.js,逻辑照抄,仅补充 TS 类型。
 */

/**
 * 获取根据当前时间的问候语
 * @returns 当前时间对应的问候语
 */
export const getGreetings = (): string => {
  const hour = new Date().getHours();
  let hello: string;
  if (hour < 6) {
    hello = "凌晨好";
  } else if (hour < 9) {
    hello = "早上好";
  } else if (hour < 12) {
    hello = "上午好";
  } else if (hour < 14) {
    hello = "中午好";
  } else if (hour < 17) {
    hello = "下午好";
  } else if (hour < 19) {
    hello = "傍晚好";
  } else if (hour < 22) {
    hello = "晚上好";
  } else {
    hello = "夜深了";
  }
  return hello;
};

/**
 * 歌曲时长时间戳转换
 * @param mss 毫秒数
 * @returns 格式为 "mm:ss" 的字符串
 *
 * 注:旧实现中 seconds 补零后隐式变为 string(数字/字符串混用),
 * 此处用显式转换保持输出完全一致(秒数 >= 10 时不补零,分钟数不补零)。
 */
export const getSongTime = (mss: number): string => {
  const minutes = Math.floor(mss / (1000 * 60));
  const secondsNum = Math.floor((mss % (1000 * 60)) / 1000);
  const seconds = secondsNum < 10 ? `0${secondsNum}` : String(secondsNum);
  return `${minutes}:${seconds}`;
};

/**
 * 获取时间戳对应的日期
 * @param mss - 时间戳
 * @param showYear - 是否显示年份
 * @returns 日期字符串
 */
export const getTimestampTime = (mss: number | string, showYear = true): string => {
  const date = new Date(parseInt(String(mss), 10));
  const y = date.getFullYear();
  const m = `0${date.getMonth() + 1}`.slice(-2);
  const d = `0${date.getDate()}`.slice(-2);
  return showYear ? `${y}-${m}-${d}` : `${m}-${d}`;
};

/**
 * 歌曲播放时间转换
 * @param num 歌曲播放时间,单位为秒
 * @returns 格式为 "mm:ss" 的字符串
 */
export const getSongPlayTime = (num: number): string => {
  const minutes = String(Math.floor(num / 60)).padStart(2, "0");
  const seconds = String(Math.floor(num % 60)).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

/**
 * 将评论时间戳转化为对应的时间格式
 * @param t - 时间戳,单位为毫秒
 * @returns 转换后的时间字符串
 */
export const getCommentTime = (t: number): string => {
  // 获取当前 Unix 时间戳
  const nowDate = new Date();
  const nowTime = nowDate.getTime();
  // 获取今天 23:59:59.999 时间戳
  const todayLast = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  // 将传入的时间戳转换为 Date 对象
  const userDate = new Date(Number(t));
  // 获取评论时间的小时和分钟数,并进行补零处理
  const UH = userDate.getHours() < 10 ? `0${userDate.getHours()}` : String(userDate.getHours());
  const Um =
    userDate.getMinutes() < 10 ? `0${userDate.getMinutes()}` : String(userDate.getMinutes());
  // 判断时间差
  if (nowTime - t <= 60000) {
    return "刚刚发布";
  } else if (nowTime - t > 60000 && nowTime - t <= 3600000) {
    const pastTimeUnix = nowTime - t;
    const pastTime = new Date(Number(pastTimeUnix));
    return `${pastTime.getMinutes()} 分钟前`;
  } else if (todayLast - t > 3600000 && todayLast - t <= 86400000) {
    return `${UH}:${Um}`;
  } else if (todayLast - t <= 172800000) {
    // 重写修正:旧实现把"同年"分支排在"昨天"之前,导致昨天分支永不可达
    return `昨天 ${UH}:${Um}`;
  } else if (nowDate.getFullYear() === userDate.getFullYear()) {
    // 如果在今年,不显示年份
    return `${userDate.getMonth() + 1}月${userDate.getDate()}日 ${UH}:${Um}`;
  } else {
    return `${userDate.getFullYear()}年${
      userDate.getMonth() + 1
    }月${userDate.getDate()}日 ${UH}:${Um}`;
  }
};

/**
 * 电台时间戳格式化
 * @param timestamp - 要格式化的时间戳(毫秒)
 * @returns 格式化后的日期描述
 */
export const djFormatDate = (timestamp: number): string => {
  const now = new Date();
  const targetDate = new Date(timestamp);
  const timeDiff = now.getTime() - targetDate.getTime();
  const oneDay = 24 * 60 * 60 * 1000; // 一天的毫秒数
  const daysDiff = Math.floor(timeDiff / oneDay);
  // 数字补零
  const formatNumber = (num: number): string => {
    return num < 10 ? `0${num}` : String(num);
  };
  if (daysDiff === 0) {
    return "今日";
  } else if (daysDiff === 1) {
    return "昨日";
  } else if (daysDiff <= 7) {
    return `${daysDiff}天前`;
  } else if (targetDate.getFullYear() === now.getFullYear() - 1) {
    return `${targetDate.getFullYear()}-${formatNumber(targetDate.getMonth() + 1)}`;
  } else {
    return `${formatNumber(targetDate.getMonth() + 1)}-${formatNumber(targetDate.getDate())}`;
  }
};
