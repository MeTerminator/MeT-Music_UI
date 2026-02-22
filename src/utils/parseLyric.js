// import { parseLrc, parseQrc } from "@applemusic-like-lyrics/lyric?init";
import { parseLrc, parseQrc, parseTTML, waitForWasmReady } from "@/utils/lyric/amll_lyric.js";
import { siteSettings } from "@/stores";

/* eslint-disable no-unused-vars */
/**
 * 将歌词接口数据解析出对应数据
 * @param {string} data 接口数据
 * @returns {Array} 对应数据
 */
export const parseLyric = async (data, ttmlLyric = null) => {
  await waitForWasmReady();

  const settings = siteSettings();

  try {
    // 以下逻辑保持不变

    // 判断是否具有内容
    const checkLyric = (lyric) => (lyric ? (lyric ? true : false) : false);
    // 初始化数据
    const { lrc, lrctrans, qrc, qrctrans, qrcroma } = data;
    const lrcData = {
      lrc: lrc || null,
      tlyric: lrctrans || null,
      romalrc: null,
      yrc: qrc,
      ytlrc: qrctrans,
      yromalrc: qrcroma,
      ttml: ttmlLyric?.content || null,
    };
    // 初始化输出结果
    const result = {
      // 是否具有普通翻译
      hasLrcTran: checkLyric(lrctrans),
      // 是否具有普通音译
      // hasLrcRoma: checkLyric(romalrc),
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
    let lrcParseData = [];
    let tlyricParseData = [];
    let romalrcParseData = [];
    let qrcParseData = [];
    let ytlrcParseData = [];
    let yromalrcParseData = [];
    // 普通歌词
    if (lrcData.lrc) {
      lrcParseData = parseLrc(lrcData.lrc);
      result.lrc = parseLrcData(lrcData.lrc);
      //判断是否有其他翻译
      if (lrcData.tlyric) {
        tlyricParseData = parseLrc(lrcData.tlyric);
        result.lrc = parseOtherLrc(result.lrc, parseLrcData(lrcData.tlyric), "tran");
      }
      // result.lrc = lrcData.romalrc
      //   ? parseOtherLrc(result.lrc, parseLrcData(lrcData.romalrc), "roma")
      //   : result.lrc;
      if (lrcData.yromalrc) {
        // romalrcParseData = parseQrc(lrcData.yromalrc);
        result.lrc = parseOtherYrc(result.lrc, parseYrcData(lrcData.yromalrc), "roma");
      }
    }
    // 逐字歌词
    if (lrcData.yrc) {
      // result.yrc = parseYrcData(lrcData.yrc).slice(1);
      qrcParseData = parseQrc(lrcData.yrc);
      result.yrc = parseYrcData(lrcData.yrc);
      //判断是否有其他翻译
      if (lrcData.ytlrc) {
        ytlrcParseData = parseLrc(lrcData.ytlrc);
        result.yrc = parseOtherLrc(result.yrc, parseLrcData(lrcData.ytlrc), "tran");
      }
      if (lrcData.yromalrc) {
        romalrcParseData = yromalrcParseData = parseQrc(lrcData.yromalrc);
        result.yrc = parseOtherYrc(result.yrc, parseYrcData(lrcData.yromalrc), "roma");
      }
    }
    // 当仅有 逐字歌词 ，没有 普通歌词 时
    if (result.yrc.length && !result.lrc.length) {
      result.lrc = result.yrc.map((v) => {
        return {
          time: v.time,
          content: v.content.map((x) => x.content).join(""),
        };
      });
    }
    
    let lrcAM = parseAMData(lrcParseData, tlyricParseData, romalrcParseData);
    // 去除 lrcAM 中的空行
    lrcAM = lrcAM.filter((v) => v.words?.[0]?.word !== "");
    result.lrcAM = lrcAM;

    if (settings.removeAMInfo) {
      result.yrcAM = parseAMData(qrcParseData.slice(1), ytlrcParseData.slice(1), yromalrcParseData.slice(1), true);
    } else {
      result.yrcAM = parseAMData(qrcParseData, ytlrcParseData, yromalrcParseData, false);
    }

    if (lrcData.ttml) {
        const ttmlParsed = parseTTML(lrcData.ttml);
        result.ttml = ttmlParsed.lines;
        result.ttmlMeta = ttmlParsed.metadata;

        // 1. 找到 key 为 "ttmlAuthorGithubLogin" 的那一个条目
        const authorEntry = ttmlParsed.metadata.find(item => item[0] === "ttmlAuthorGithubLogin");
        
        // 2. 提取该条目的第二个元素（即所有的作者数组）
        const ttmlAuthors = authorEntry?.[1] || [];

        if (Array.isArray(ttmlAuthors) && ttmlAuthors.length > 0) {
            // 使用 / 分隔显示所有作者
            const authorsDisplay = ttmlAuthors.join(' / ');
            $message.info("TTML 歌词作者：" + authorsDisplay, { showIcon: false });
        } else if (typeof ttmlAuthors === 'string' && ttmlAuthors !== "") {
            // 兼容处理：如果解析器有时返回字符串而非数组
            $message.info("TTML 歌词作者：" + ttmlAuthors, { showIcon: false });
        } else {
            $message.info("使用 TTML 歌词", { showIcon: false });
        }
    }
    
    // console.log(result);
    return result;
  } catch (error) {
    console.error("解析歌词时出现错误：", error);
    return false;
  }
};

/**
 * 解析本地歌词数据
 * @param {string} data - 歌词字符串
 * @returns {Object} - 包含解析后的歌词信息的对象
 */
export const parseLocalLrc = (data) => {
  try {
    const lyric = parseLrcData(data);
    const parsedLyrics = [];
    // 初始化输出结果
    const result = {
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
      let currentObj = lyric[i];
      // 是否有相同时间
      let existingObj = parsedLyrics.find((v) => Number(v.time) === Number(currentObj.time));
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
    console.log(result);
    return result;
  } catch (error) {
    console.error("解析本地歌词时出现错误：", error);
    return false;
  }
};

/**
 * 翻译文本对齐
 * @param {string} lrc 歌词字符串
 * @param {string} tranLrc 翻译歌词字符串
 * @returns {Array} 包含翻译的歌词对象数组
 */
const parseOtherLrc = (lrc, tranLrc, name) => {
  const lyric = lrc;
  const tranLyric = tranLrc;
  if (lyric[0] && tranLyric[0]) {
    lyric.forEach((v) => {
      tranLyric.forEach((x) => {
        if (Number(v.time) === Number(x.time) || Math.abs(Number(v.time) - Number(x.time)) < 0.1) {
          if (x.content == "//") {
            v[name] = "";
          } else {
            v[name] = x.content;
          }
        }
      });
    });
  }
  return lyric;
};

/**
 * 音译文本对齐 MeT
 * @param {string} lrc 歌词字符串
 * @param {string} tranLrc 翻译歌词字符串
 * @returns {Array} 包含翻译的歌词对象数组
 */
const parseOtherYrc = (lrc, tranLrc, name) => {
  const lyric = lrc;
  const tranLyric = tranLrc;
  if (lyric[0] && tranLyric[0]) {
    lyric.forEach((v) => {
      tranLyric.forEach((x) => {
        if (Number(v.time) === Number(x.time) || Math.abs(Number(v.time) - Number(x.time)) < 0.1) {
          v[name] = "";
          x.content.forEach((y) => {
            v[name] += y.content;
            // if (y.endsWithSpace) {
            //   v[name] += " ";
            // }
          });
        }
      });
    });
  }
  return lyric;
};

/**
 * 普通歌词解析
 * @param {string} lyrics 歌词字符串
 * @returns {Array} 歌词对象数组
 */
const parseLrcData = (lyrics, isTrim = true) => {
  if (!lyrics) return [];
  try {
    // 匹配时间轴和歌词文本的正则表达式
    const regex = /^\[([^\]]+)\]\s*(.+?)\s*$/;
    // 匹配歌曲信息的正则表达式
    // const infoRegex = /\].*[:：-]/;
    // 将歌词字符串按行分割为数组
    const lines = lyrics.split("\n");
    // 对每一行进行转换
    const parsedLyrics = lines
      // 筛选出包含时间轴和歌词文本的行
      .filter((line) => regex.test(line))
      // 转换时间轴和歌词文本为对象
      .map((line) => {
        // 过滤掉包含信息的文本
        // if (infoRegex.test(line)) return null;
        // 继续解析
        const [, time, text] = line.match(regex);
        const parts = time.split(":");
        const seconds =
          Number(parts[0]) * 60 +
          Number(parts[1]) +
          (parts.length > 2 ? Number(parts[2]) / 1000 : 0);
        return { time: Number(seconds.toFixed(2)), content: isTrim ? text.trim() : text };
      })
      .filter((c) => c && c.content.trim() !== "");
    // 检查是否为纯音乐，是则返回空数组
    if (parsedLyrics.length && /纯音乐，请您欣赏/.test(parsedLyrics[0].content)) {
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
 * @param {string} qrc 逐字歌词字符串
 * @returns {Array} 歌词对象数组
 */
const parseYrcData = (qrc) => {
  const { removeInfo } = siteSettings();
  // const { playSongData } = musicData();
  if (!qrc) return [];
  try {
    // qrc -> yrc
    qrc = qrc.replace(/\r\n/g, "\n");
    qrc = qrc.split("[offset:0]\n")[1];
    qrc = qrc.replace(/\n\"\/>\n<\/LyricInfo>\n<\/QrcInfos>/g, "");
    qrc = qrc.replace(/\((\d+,\d+)\)/g, '{$1}');

    // 遍历每一行逐字歌词
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
        const [_, startTime, endTime] = timeMatch;
        if (isNaN(startTime) || isNaN(endTime)) {
          return null;
        }
        // 去除当前行中的时间戳信息，得到歌词内容
        const content = line.replace(timeReg, "");
        if (!content) {
          return null;
        }
        // 去除歌曲信息
        // const contentInfoReg = /\s*[^:：\n]*[:：]\s*.+/;
        // const contentFilter = content.replace(/\{\d+,\d+\}/g, "");
        // if ((!contentFilter || contentInfoReg.test(contentFilter)) && removeInfo) {
        //   return null;
        // }
        // if (contentFilter.includes(playSongData.name) && contentFilter.includes(" - ") && removeInfo) {
        //   return null;
        // }
        // 对歌词内容中的时间戳和歌词内容分离
        const contentArray = content
          .split(/([^}]*\{[1-9]\d*,[1-9]\d*\})/g)
          .filter((c) => c.trim())
          .map((c) => {
            // 匹配当前片段中的时间戳信息
            const timeReg = /\{(\d+),(\d+)\}/;
            const timeMatch = c.match(timeReg);
            if (!timeMatch) {
              return null;
            }
            // 解构出时间戳，持续时间和歌词内容
            const [_, time, duration] = timeMatch;
            const contentReg = /\{\d+,\d+\}/g;
            const content = c.replace(timeReg, "").replace(contentReg, "");
            if (!content || !content.trim() && content !== " ") {
              return null;
            }
            return {
              time: Number(time) / 1000,
              duration: Number(duration) / 1000,
              content: content,
              endsWithSpace: content.endsWith(" "),
            };
          })
          .filter((c) => c);
          if (removeInfo && contentArray.length > 2) {
            const allDurationsEqual = contentArray.slice(1).every(item => item.duration === contentArray[1].duration);
          
            // 如果所有持续时间相等，则跳过当前元素
            if (allDurationsEqual) {
              return null;  // 返回 null 表示跳过当前元素
            }
          }
        // 返回当前行解析出的时间信息和歌词内容信息
        return {
          time: Number(startTime) / 1000,
          endTime: Number(endTime) / 1000,
          content: contentArray,
        };
      })
      .filter((line) => line);
    return parsedLyrics;
  } catch (err) {
    console.error("逐字歌词处理出错：" + err);
    return [];
  }
};

// 处理 AM 歌词
// const parseAMData = (lrcData, tranData, romaData, removeAMInfo = true) => {
//   // 过滤掉 tranData 中只包含一个空字符串的元素
//   const filteredTranData = tranData.filter(item => 
//     !(item?.words?.length === 1 && item.words[0]?.word === "")
//   );

//   // 获取翻译和罗马化歌词的函数
//   const getLyrics = (data, index) => {
//     let lyric = data?.[index]?.words?.map(wordObj => wordObj.word).join("") ?? "";
//     // 如果歌词是 "//"，则替换为空字符串
//     return lyric === "//" ? "" : lyric;
//   };

//   // 处理每一行数据的函数
//   const processLine = (line, index, lines) => {
//     // 如果 words 只有一个元素，则不判断差值
//     if (line.words.length === 1) {
//       return {
//         words: line.words,
//         startTime: line.words[0]?.startTime ?? 0,
//         endTime: lines[index + 1]?.words?.[0]?.startTime ?? line.words[0]?.endTime ?? Infinity,
//         translatedLyric: getLyrics(filteredTranData, index),
//         romanLyric: getLyrics(romaData, index),
//         isBG: false,
//         isDuet: false,
//       };
//     }

//     if (removeAMInfo && line.words.length > 2) {
//       // 获取从第二个元素开始的所有 word 的 startTime 和 endTime 差值
//       const timeDifferences = line.words.slice(1).map(word => word.endTime - word.startTime);

//       // 检查从第二个元素开始的所有差值是否相等
//       const allDifferencesEqual = timeDifferences.every(diff => diff === timeDifferences[0]);

//       // 如果所有差值都相等，则跳过当前元素
//       if (allDifferencesEqual) {
//         return null;  // 返回 null 表示跳过当前元素
//       }
//     }

//     // 获取翻译歌词和罗马化歌词
//     return {
//       words: line.words,
//       startTime: line.words[0]?.startTime ?? 0,
//       endTime: lines[index + 1]?.words?.[0]?.startTime ?? line.words?.[line.words.length - 1]?.endTime ?? Infinity,
//       translatedLyric: getLyrics(filteredTranData, index),
//       romanLyric: getLyrics(romaData, index),
//       isBG: false,
//       isDuet: false,
//     };
//   };

//   // 使用 map 处理所有数据
//   return lrcData.map(processLine).filter(item => item !== null);  // 过滤掉 null 的元素
// };


/**
 * 处理 AM 歌词并适配 LyricLine 和 LyricWord 接口
 * 如果单词的罗马音与原文一致，则 romanWord 置为空字符串以隐藏显示
 */
const parseAMData = (lrcData, tranData, romaData, removeAMInfo = true) => {
  // 过滤翻译数据中无效的空行
  const filteredTranData = tranData.filter(item => 
    !(item?.words?.length === 1 && item.words[0]?.word === "")
  );

  // 获取整行翻译文本
  const getTranslationString = (index) => {
    let lyric = filteredTranData?.[index]?.words?.map(w => w.word).join("") ?? "";
    return lyric === "//" ? "" : lyric;
  };

  // 处理每一行
  const processLine = (line, index, lines) => {
    const currentWords = line.words || [];
    const currentRomaWords = romaData?.[index]?.words || [];

    // 1. 过滤冗余的 AM 信息行
    if (removeAMInfo && currentWords.length > 2) {
      const timeDifferences = currentWords.slice(1).map(word => word.endTime - word.startTime);
      const allDifferencesEqual = timeDifferences.every(diff => diff === timeDifferences[0]);
      if (allDifferencesEqual) return null;
    }

    // 2. 映射 LyricWord 数组
    const words = currentWords.map((wordObj, wordIndex) => {
      const originalWord = wordObj.word ?? "";
      const rawRomanWord = currentRomaWords[wordIndex]?.word ?? "";

      // 判断逻辑：如果罗马音去掉首尾空格后与原文相同（不区分大小写），则置为空
      // 这样在 UI 渲染时，判断 romanWord 为空即可不显示
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
    const endTime = lines[index + 1]?.words?.[0]?.startTime ?? words[words.length - 1]?.endTime ?? Infinity;

    // 4. 构建符合 LyricLine 接口的对象
    return {
      words: words,
      translatedLyric: getTranslationString(index),
      romanLyric: "", // 已在 LyricWord 级别处理，整行字符串置空
      startTime: startTime,
      endTime: endTime,
      isBG: false,
      isDuet: false,
    };
  };

  return lrcData.map(processLine).filter(item => item !== null);
};


