import { Howl, Howler } from "howler";
import { musicData, siteStatus, siteSettings, siteData } from "@/stores";
import useListenTogetherStore from "@/stores/listenTogether";
import { getSongUrl, getSongLyric, getAMttmlLyric } from "@/api/song";
import {
  getLocalCoverData,
  getBlobUrlFromUrl,
  getSessionId,
  parseDurationToSeconds,
} from "@/utils/helper";
import { getSongPlayTime } from "@/utils/timeTools";
import { getCoverGradient } from "@/utils/cover-color";
import { parseLyric } from "@/utils/parseLyric";

// 全局播放器
let player;
// 时长定时器
let seekInterval;
// let justSeekInterval;
// let scrobbleTimeout;
let reportInterval;

let rAF_Handle;

// ---
//
// 新增：模拟播放相关
//
// ---

/**
 * 是否正在模拟播放
 */
let isSimulating = false;
/**
 * 模拟播放开始时间 (performance.now())
 */
let simulationStartTime = 0;
/**
 * 模拟播放暂停时的时间点 (秒)
 */
let simulationPausedSeek = 0;
/**
 * 模拟播放的总时长 (秒)
 */
let simulationDuration = 0;

// --- 模拟播放相关结束 ---

// 重试次数
let testNumber = 0;
// 是否结束
let isPlayEnd = true;
// 频谱数据
let spectrumsData = {
  audio: null,
  analyser: null,
  audioCtx: null,
};
// 默认标题
let defaultTitle = document.title;

/**
 * 上报播放状态
 * @param {string} eventType - 事件类型
 */
const reportPlaybackStatus = (eventType) => {
  try {
    const music = musicData();
    const song = music.getPlaySongData;
    const site = siteData();
    const statusStore = siteStatus(); // 获取 status store

    // --- 兼容模拟播放 ---
    const currentSeek = isSimulating ? getSeek() : player?.seek?.() || 0;
    const isPlaying = isSimulating ? statusStore.playState : player?.playing() || false;
    // --- 修改结束 ---

    const data = {
      event: eventType,
      sessionId: getSessionId(),
      userId: site.userData.userId,
      songMid: song.id || null,
      status: isPlaying, // <--- 修改
      currentTime: currentSeek, // <--- 修改
      systemTime: Date.now(),
    };

    if (data.sessionId === "null") return;

    queueMicrotask(() => {
      fetch("/api/web/collect/feedback/webplayer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data }),
      }).catch(console.error);
    });

    // 确保能在暂停时更新状态
    document.title = getPlaySongName();
  } catch (err) {
    console.error("上报播放状态失败：", err);
  }
};

/**
 * 初始化播放器
 */
export const initPlayer = async (playNow = false) => {
  console.log("[Player.js] initPlayer called with playNow =", playNow);
  try {
    // 停止播放器
    soundStop();
    // 获取基础数据
    const music = musicData();
    const status = siteStatus();
    const settings = siteSettings();
    const { playIndex, playMode } = status;
    const { playList } = music;
    // 当前播放歌曲数据
    const playSongData = music.getPlaySongData;
    // 是否为本地歌曲
    const isLocalSong = playSongData?.path ? true : false;
    // console.log("当前为本地歌曲");
    // 获取封面
    if (isLocalSong) {
      music.playSongData.localCover = await getLocalCoverData(playSongData?.path);
    }
    const cover = isLocalSong ? music.playSongData?.localCover : playSongData?.coverSize;
    // 歌词归位
    status.playSongLyricIndex = -1;

    // ---
    //
    // 新增：模拟播放逻辑
    //
    // ---
    if (settings.simulationPlaying) {
      console.log("🎵 (模拟) 初始化播放器");
      isSimulating = true;
      status.playLoading = false;
      // 必须确保 playSongData.duration (毫秒) 存在
      simulationDuration = parseDurationToSeconds(playSongData.duration);
      simulationPausedSeek = 0;

      // 初始化时间数据
      status.playTimeData = {
        currentTime: 0,
        duration: simulationDuration,
        bar: "0",
        played: getSongPlayTime(0),
        durationTime: getSongPlayTime(simulationDuration),
      };

      if (playNow) {
        status.playState = true;
        isPlayEnd = false;
        simulationStartTime = performance.now();
        setAllInterval(); // 启动模拟定时器
        reportPlaybackStatus("play");
        document.title = getPlaySongName();
      } else {
        status.playState = false;
        cleanAllInterval();
      }

      // 加载歌词、封面等非音频资源
      if (playMode !== "dj") getSongLyricData(isLocalSong, playSongData);
      initMediaSession(playSongData, cover, isLocalSong, playMode === "dj");
      getColorMainColor(isLocalSong, cover);

      return; // 结束函数，不执行后续的真实播放逻辑
    }
    // --- 模拟播放逻辑结束 ---

    // 确保重置模拟状态
    isSimulating = false;

    // 在线歌曲
    if (!isLocalSong) {
      // 获取歌曲信息
      const { id } = playSongData;
      if (!id) return false;
      // 开启加载状态
      status.playLoading = true;
      // 获取播放地址
      const url = await getNormalSongUrl(id, status, playNow);
      // 正常播放地址
      if (url) {
        status.playUseOtherSource = false;
        createPlayer(url);
      }
      // 下一曲
      else {
        if (status.isInRoom) {
          status.playLoading = false;
          status.playState = false;
          $message.error("获取歌曲播放链接失败，已暂停播放");
        } else {
          if (playIndex !== playList.length - 1) {
            changePlayIndex();
          } else {
            status.playLoading = false;
            status.playState = false;
            $message.warning("列表中暂无可播放歌曲", { closable: true, duration: 5000 });
          }
        }
      }
    }
    // 本地歌曲
    else if (isLocalSong && playList?.length) {
      const url = playList[playIndex]?.path;
      if (playNow && url) status.playState = true;
      if (url) {
        // 创建播放器
        createPlayer(url);
      } else {
        if (status.isInRoom) {
          status.playLoading = false;
          status.playState = false;
          $message.error("获取本地歌曲播放链接失败，已暂停播放");
        } else {
          changePlayIndex("next", playNow);
        }
      }
    }
    // 获取歌词
    if (playMode !== "dj") getSongLyricData(isLocalSong, playSongData);
    // 初始化媒体会话控制
    initMediaSession(playSongData, cover, isLocalSong, playMode === "dj");
    // 获取图片主色
    getColorMainColor(isLocalSong, cover);
  } catch (error) {
    testNumber++;
    // 错误次数过多
    if (testNumber > 10) {
      $dialog.error({
        title: "致命性错误",
        content: "歌曲播放中出现错误次数过多，请刷新后重试",
        positiveText: "刷新",
        onPositiveClick: () => {
          location.reload();
        },
      });
      return false;
    }
    // 下一曲
    // changePlayIndex();
    console.error("初始化音乐播放器出错：", error);
    $message.error("初始化音乐播放器出错");
  }
};

/**
 * 获取普通模式下的音乐播放地址
 * @param {number} id - 歌曲 id
 * @returns {Promise<?string>} - 歌曲播放地址，如果获取失败或歌曲无法播放则返回 null
 */
const getNormalSongUrl = async (id, status, playNow) => {
  try {
    const settings = siteSettings();
    const res = await getSongUrl(id, settings.songLevel);
    // 检查是否有有效的响应数据
    if (!res.data?.[0] || !res.data?.[0]?.url) return null;
    // 返回歌曲地址，将 http 转换为 https
    const url = res.data[0].url.replace(/^http:/, "https:");
    // 更改状态
    if (playNow && url) status.playState = true;
    return url;
  } catch (error) {
    status.playLoading = false;
    console.error("获取歌曲地址遇到错误：" + error);
    throw error;
  }
};

/**
 * 创建播放器
 * @param {string} src - 音频文件地址
 * @param {number} volume - 音量（ 默认为 0.7 ）
 * @param {number} seek - 初始播放进度（ 默认为 0 ）
 */
export const createPlayer = async (src, autoPlay = true) => {
  console.log("[Player.js] createPlayer called with src =", src, "autoPlay =", autoPlay);
  try {
    // --- 新增：确保已退出模拟模式 ---
    isSimulating = false;
    // --- 新增结束 ---

    // pinia
    const music = musicData();
    const status = siteStatus();
    const settings = siteSettings();
    const { playMode } = status;
    const { playList } = music;
    const { memorySeek, useMusicCache, html5Player } = settings;
    // 当前播放歌曲数据
    const playSongData = music.getPlaySongData;
    console.log("[Player.js] createPlayer - playSongData id:", playSongData?.id, "playState:", status.playState);
    // 获取播放链接（非电台及云盘歌曲）
    const songUrl =
      useMusicCache && playMode !== "dj" && !playSongData.pc ? await getBlobUrlFromUrl(src) : src;
    console.log("播放地址：", songUrl);
    // 初始化播放器
    status.playTimeData = {
      currentTime: 0,
      duration: 0,
      bar: "0",
      played: "00:00",
      durationTime: "00:00",
    };
    status.playSeek = 0;
    status.playSeekMs = 0;
    status.playSongLyricIndex = -1;
    if (player) soundStop();
    player = new Howl({
      src: [songUrl],
      // format: ["mp3", "flac", "dolby", "webm", "m4a", "ogg", "mp4"],
      html5: html5Player,
      preload: "metadata",
      volume: status.playVolume,
      rate: status.playRate,
    });
    // 允许跨域
    const audioDom = player._sounds[0]._node;
    audioDom.crossOrigin = "anonymous";
    // 写入播放历史
    music.setPlayHistory(playSongData);
    // 生成音乐频谱
    // 由于浏览器安全策略，无法在此处启动
    // if (showSpectrums) processSpectrum(player);
    // 加载完成
    player?.once("load", () => {
      console.info("🎵 加载完成", player, status.playState);
      if (!html5Player) {
        resetSpectrum();
        if (settings.showSpectrums) {
          processSpectrum(player);
        }
      }

      if (status.isInRoom) {
        // Sync with the room's current seek position internally
        const ltStore = useListenTogetherStore();
        const room = ltStore.roomState;
        const elapsed = room.is_playing ? (Date.now() - (room.receivedAt || Date.now())) / 1000 : 0;
        const targetSeek = (room.seek_position || 0) + elapsed;
        setSeek(targetSeek, true);
        if (room.is_playing) {
          fadePlayOrPause("play");
        }
      } else {
        // 自动播放
        if (autoPlay && status.playState) {
          setSeek();
          fadePlayOrPause("play");
        }
        // 恢复进度（防止播放到结尾时触发 bug）
        if (memorySeek && status.playTimeData?.duration - status.playTimeData?.currentTime > 2) {
          setSeek(status.playTimeData?.currentTime ?? 0);
        } else {
          setSeek();
          status.playTimeData.bar = "0";
        }
      }
      // 取消加载状态
      status.playLoading = false;
      // 上报播放状态
      // const lastSongId = window._lastReportedSongId;
      // if (music.getPlaySongData?.id && music.getPlaySongData?.id !== lastSongId) {
      //   reportPlaybackStatus("songChange");
      //   window._lastReportedSongId = music.getPlaySongData.id;
      // }
    });
    // 开始播放
    player?.on("play", () => {
      console.info("🎵 开始播放：", playSongData);
      isPlayEnd = false;
      setAllInterval();
      // 更改状态
      status.playState = true;
      // 更改页面标题
      document.title = getPlaySongName();
      // 上报播放状态
      reportPlaybackStatus("play");
    });
    // 暂停播放
    player?.on("pause", () => {
      console.info("⏸ 暂停播放");
      cleanAllInterval();
      // 更改状态
      status.playState = false;
      // 更改页面标题
      document.title = defaultTitle || "MeT-Music";
      // 上报播放状态
      reportPlaybackStatus("pause");
    });
    // 结束播放
    player?.on("end", () => {
      console.info("🎵 播放结束");
      isPlayEnd = true;
      // 停止定时器
      cleanAllInterval();
      // 下一曲
      if (status.isInRoom) {
        useListenTogetherStore().sendNext();
      } else {
        changePlayIndex();
      }
    });
    // 加载失败
    player?.on("loaderror", (id, errCode) => {
      console.log("播放出现错误：", id, errCode);
      // 更改状态
      status.playLoading = false;
      // https://github.com/goldfire/howler.js?tab=readme-ov-file#onloaderror-function
      switch (errCode) {
        case 1:
          $message.error("播放出错，用户代理中止了获取媒体");
          break;
        case 2:
          $message.error("播放出错，未知的网络错误");
          break;
        case 3:
          $message.error("播放出错，媒体进行解码时发生错误");
          break;
        case 4:
          $message.error("播放出错，不支持的音频格式或媒体资源不合适");
          break;
        default:
          $message.error("播放遇到未知错误");
          break;
      }
      // 下一曲
      if (status.isInRoom) {
        status.playState = false;
      } else {
        if (playList.length > 1) {
          changePlayIndex();
        } else {
          status.playState = false;
        }
      }
    });
    // 返回音频对象
    return (window.$player = player);
  } catch (error) {
    console.error("播放遇到错误：" + error);
    $message.error("播放遇到错误，请重试");
    throw error;
  }
};

/**
 * 播放下一首或上一首歌曲
 * @param {string} type - 更改索引的类型  "next" / "prev"
 */
export const changePlayIndex = async (type = "next", play = false) => {
  const status = siteStatus();
  if (status.isInRoom) {
    useListenTogetherStore().sendChangeIndex(type);
    return;
  }
  // pinia
  const music = musicData();
  const settings = siteSettings();
  // 解构音乐数据
  const { playList } = music;
  const { playSongMode, playMode, playHeartbeatMode } = status;
  const { simulationPlaying } = settings;
  if (simulationPlaying) play = true; // 若模拟播放，则强制播放
  // 清除定时器
  resetSpectrum();
  cleanAllInterval();
  // 歌词归位
  status.playSongLyricIndex = -1;
  // 私人FM模式
  if (playMode === "fm") {
    await music.setPersonalFm(true);
    // 渐出音乐 (模拟模式下 player 为空, isSimulating 也为 false, 不会执行)
    if (!isPlayEnd) fadePlayOrPause("pause");
    // 初始化播放器
    initPlayer(play);
    return true;
  }
  // 根据播放模式确定要操作的播放列表和其长度
  const listLength = playList?.length || 0;
  // 根据播放歌曲模式执行不同的操作
  if (status.hasNextSong) {
    status.playIndex += type === "next" ? 1 : -1;
    status.hasNextSong = false;
  } else {
    if (playSongMode === "normal" || playHeartbeatMode) {
      // 正常模式
      status.playIndex += type === "next" ? 1 : -1;
    } else if (playSongMode === "random") {
      // 随机模式
      status.playIndex = Math.floor(Math.random() * listLength);
    } else if (playSongMode === "repeat") {
      // 单曲循环模式
      setSeek();
      fadePlayOrPause("play");
    }
  }
  // 检查播放索引是否越界
  if (playSongMode !== "repeat") {
    if (status.playIndex < 0) {
      status.playIndex = listLength - 1;
    } else if (status.playIndex >= listLength) {
      status.playIndex = 0;
    }
    // 赋值当前播放歌曲信息
    const songData = playList?.[status.playIndex];
    if (songData) {
      music.playSongData = songData;
      // 渐出音乐 (模拟模式下 player 为空, isSimulating 也为 false, 不会执行)
      if (!isPlayEnd) fadePlayOrPause("pause");
      // 初始化播放器
      initPlayer(play);
    } else {
      $message.error("歌曲信息读取错误，跳至下一曲");
      changePlayIndex("next", play);
    }
  }
};

/**
 * 在当前播放歌曲后添加
 * @param {Object} data - 歌曲信息
 */
export const addSongToNext = (data, play = false) => {
  try {
    const music = musicData();
    const status = siteStatus();
    // 更改播放模式
    status.hasNextSong = true;
    // 查找是否存在于播放列表
    const index = music.playList.findIndex((v) => v.id === data.id);
    // 若存在
    if (index !== -1) {
      console.log("已存在", index);
      // 移动至当前歌曲的下一曲
      const currentSongIndex = status.playIndex;
      const nextSongIndex = currentSongIndex + 1;
      // 如果移动的位置不是当前位置，且不是最后一首歌曲
      if (index !== currentSongIndex && nextSongIndex < music.playList.length) {
        // 移动歌曲
        music.playList.splice(nextSongIndex, 0, music.playList.splice(index, 1)[0]);
      }
      // 更新播放索引
      if (play) status.playIndex = nextSongIndex;
    }
    // 添加至播放列表
    else {
      // music.playList.push(data);
      music.playList.splice(status.playIndex + 1, 0, data);
      if (play) status.playIndex++;
    }
    // 是否立即播放
    play ? fadePlayOrPause("play") : $message.success("已添加至下一首播放");
  } catch (error) {
    console.error("添加播放歌曲失败：", error);
  }
};

/**
 * 音频渐入渐出
 * @param {String} [type="play"] - 渐入渐出
 */
export const fadePlayOrPause = (type = "play") => {
  console.log("[Player.js] fadePlayOrPause called with type =", type);
  const status = siteStatus();
  const settings = siteSettings();
  const duration = settings.songVolumeFade ? 300 : 0;

  // --- 模拟播放逻辑保持不变 ---
  if (isSimulating) {
    if (type === "play") {
      if (status.playState) return;
      status.playState = true;
      isPlayEnd = false;
      simulationStartTime = performance.now();
      setAllInterval();
      reportPlaybackStatus("play");
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    } else {
      if (!status.playState) return;
      simulationPausedSeek = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
      status.playState = false;
      cleanAllInterval();
      reportPlaybackStatus("pause");
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    }
    return;
  }

  // --- 真实播放器逻辑修复 ---
  if (type === "play") {
    if (player?.playing()) return;
    player?.play();
    setAllInterval();
    // 立即告诉系统我在播放，防止被回收
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";

    player?.once("play", () => {
      updateMediaSessionPosition();
      player?.fade(0, status.playVolume, duration);
    });
  }
  else if (type === "pause") {
    // 1. 立即同步状态，这是防止 Media Session 消失的关键
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      updateMediaSessionPosition();
    }

    player?.fade(status.playVolume, 0, duration);
    player?.once("fade", () => {
      player?.pause();
      cleanAllInterval();
      // 再次确认状态
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    });
  }
};

/**
 * 播放或暂停
 */
export const playOrPause = async () => {
  const status = siteStatus();
  if (status.isInRoom) {
    useListenTogetherStore().sendPlayOrPause();
    return;
  }
  // --- 修改：兼容模拟播放 ---
  const isPlaying = isSimulating ? status.playState : player?.playing();
  fadePlayOrPause(isPlaying ? "pause" : "play");
  // --- 修改结束 ---
};

/**
 * 设置倍速
 * @param {number} rate - 设置的倍速值
 */
export const setRate = (rate) => {
  player?.rate(Number(rate));
};

/**
 * 设置音量
 * @param {number} volume - 设置的音量值，0-1之间的浮点数
 */
export const setVolume = (volume) => {
  player?.volume(Number(volume));
};

/**
 * 停止播放器
 */
export const soundStop = () => {
  console.log("[Player.js] soundStop called");
  // 清理 Howler
  const settings = siteSettings();
  const status = siteStatus();

  if (settings.html5Player) {
    player?.stop();
    setSeek(0, status.isInRoom);
    player?.unload();
    Howler.unload();
  } else {
    player?.stop();
    player?.unload();
  }

  // 清理进度数据
  status.playSeek = 0;
  status.playSeekMs = 0;

  if (!settings.html5Player) resetSpectrum();
  status.spectrumsData = []; // 清空 UI 上的频谱条

  isSimulating = false;
  simulationPausedSeek = 0;
  simulationStartTime = 0;
  simulationDuration = 0;
  cleanAllInterval();

  player = null;
  window.$player = null;
};

/**
 * 调整静音
 */
export const setVolumeMute = () => {
  const status = siteStatus();
  if (status.playVolume > 0) {
    status.playVolumeMute = status.playVolume;
    status.playVolume = 0;
  } else {
    status.playVolume = status.playVolumeMute;
  }
  player?.volume(status.playVolume);
};

/**
 * 设置进度
 * @param {number} seek - 设置的进度值，0-1之间的浮点数
 */
export const setSeek = (seek = 0, isInternal = false) => {
  console.log("[Player.js] setSeek called with seek =", seek, "isInternal =", isInternal);
  const status = siteStatus();
  if (status.isInRoom && !isInternal) {
    console.log("[Player.js] setSeek - sending seek to room");
    useListenTogetherStore().sendSeek(seek);
  }
  // ---
  //
  // 新增：模拟播放
  //
  // ---
  if (isSimulating) {
    simulationPausedSeek = seek;
    simulationStartTime = performance.now(); // 重置计时起点
    // 立即更新时间显示
    setAudioTime();
    justSetSeek();
    reportPlaybackStatus("play");
    return;
  }
  console.log("[Player.js] setSeek - seeking player to", seek);
  player?.seek(seek);
  setAudioTime(true);
  justSetSeek(true);
  updateMediaSessionPosition();
  reportPlaybackStatus("play");
};

/**
 * 获取进度
 * @return {number} seek - 获取的进度值，0-1之间的浮点数
 */
export const getSeek = () => {
  // ---
  //
  // 新增：模拟播放
  //
  // ---
  if (isSimulating) {
    const status = siteStatus();
    if (status.playState) {
      const currentTime = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
      // 防止超出总时长
      return Math.min(currentTime, simulationDuration);
    } else {
      return simulationPausedSeek;
    }
  }
  // --- 模拟播放结束 ---

  if (player) {
    return player.seek();
  }
  return 0;
};

/**
 * 更改播放进度
 */
const setAudioTime = (force = false) => {
  // ---
  //
  // 新增：模拟播放
  //
  // ---
  if (isSimulating) {
    const status = siteStatus();
    const music = musicData();
    const settings = siteSettings();

    // 确保在暂停时 currentTime 不会自己增长
    if (!status.playState) {
      // 如果暂停了，我们仍然需要保持歌词索引，但不更新时间
      const currentTime = simulationPausedSeek;
      // 计算当前歌词播放索引
      const lrcType = !music.playSongLyric.hasYrc || !settings.showYrc;
      const lyrics = lrcType ? music.playSongLyric.lrc : music.playSongLyric.yrc;
      const lyricsIndex = lyrics?.findIndex((v) => v?.time >= (currentTime + settings.lyricsOffset));
      status.playSongLyricIndex = lyricsIndex === -1 ? lyrics.length - 1 : lyricsIndex - 1;
      return; // 暂停时退出
    }

    const currentTime = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
    const duration = simulationDuration;

    // 模拟播放结束
    if (currentTime >= duration && duration > 0) {
      console.info("🎵 (模拟) 播放结束");
      status.playTimeData.currentTime = duration; // 修正时间为总时长
      status.playTimeData.bar = "100";
      isPlayEnd = true;
      cleanAllInterval();
      if (status.isInRoom) {
        useListenTogetherStore().sendNext();
      } else {
        changePlayIndex(); // 播放下一首
      }
      return;
    }

    const bar = duration ? ((currentTime / duration) * 100).toFixed(2) : 0;
    const played = getSongPlayTime(currentTime);
    const durationTime = getSongPlayTime(duration);
    // 计算当前歌词播放索引
    const lrcType = !music.playSongLyric.hasYrc || !settings.showYrc;
    const lyrics = lrcType ? music.playSongLyric.lrc : music.playSongLyric.yrc;
    const lyricsIndex = lyrics?.findIndex((v) => v?.time >= (currentTime + settings.lyricsOffset));
    // 赋值数据
    status.playTimeData = { currentTime, duration, bar, played, durationTime };
    status.playSongLyricIndex = lyricsIndex === -1 ? lyrics.length - 1 : lyricsIndex - 1;
    document.title = getPlaySongName();
    updateHookData();
    return; // 结束函数
  }
  // --- 模拟播放结束 ---

  if (player && (player.playing() || force)) {
    const music = musicData();
    const status = siteStatus();
    const settings = siteSettings();
    const currentTime = player.seek();
    const seekVal = typeof currentTime === "number" ? currentTime : 0;
    const duration = player.duration() || player._duration || 0;
    // 计算数据
    const bar = duration ? ((seekVal / duration) * 100).toFixed(2) : 0;
    const played = getSongPlayTime(seekVal);
    const durationTime = getSongPlayTime(duration);
    // 计算当前歌词播放索引
    const lrcType = !music.playSongLyric.hasYrc || !settings.showYrc;
    const lyrics = lrcType ? music.playSongLyric.lrc : music.playSongLyric.yrc;
    const lyricsIndex = lyrics?.findIndex((v) => v?.time >= (seekVal + settings.lyricsOffset));
    // 赋值数据
    status.playTimeData = { currentTime: seekVal, duration, bar, played, durationTime };
    status.playSongLyricIndex = lyricsIndex === -1 ? lyrics.length - 1 : lyricsIndex - 1;
    document.title = getPlaySongName();
    updateHookData();
  } else {
    // 未播放时清空数据
    document.title = getPlaySongName();
    updateHookData();
  }
};

/**
 * 更改播放进度（频繁）
 */
const justSetSeek = (force = false) => {
  // ---
  //
  // 新增：模拟播放
  //
  // ---
  if (isSimulating) {
    const status = siteStatus();

    let currentTime;
    if (status.playState) {
      currentTime = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
    } else {
      currentTime = simulationPausedSeek;
    }

    const finalTime = Math.min(currentTime, simulationDuration);
    status.playSeek = finalTime;
    status.playSeekMs = Math.floor(finalTime * 1000);
    // 及时更新逐字歌词信息
    // document.title = getPlaySongName();
    return;
  }
  // --- 模拟播放结束 ---

  if (player && (player.playing() || force)) {
    const status = siteStatus();
    const currentTime = player.seek();
    const seekVal = typeof currentTime === "number" ? currentTime : 0;
    status.playSeek = seekVal;
    status.playSeekMs = Math.floor(seekVal * 1000);
  }

  // 及时更新逐字歌词信息
  // document.title = getPlaySongName();
};

/**
 * 获取歌曲的歌词数据并解析
 * @param {object} data - 歌曲的数据
 */
const getSongLyricData = async (islocal, data) => {
  if (!data?.id) return false;
  try {
    const music = musicData();
    const settings = siteSettings();
    const setDefaults = () => {
      music.playSongLyric = {
        hasLrcTran: false,
        hasLrcRoma: false,
        hasYrc: false,
        hasYrcTran: false,
        hasYrcRoma: false,
        lrc: [],
        yrc: [],
      };
    };
    const lyricResponse = await getSongLyric(data?.id);
    const lyricData = lyricResponse?.lrc;
    if (lyricData) {
      let ttmlLyricResponse = null;
      if (settings.useAMttmlDB) {
        ttmlLyricResponse = await getAMttmlLyric(data?.id);
      }
      const result = await parseLyric(lyricResponse, ttmlLyricResponse);
      result ? (music.playSongLyric = result) : setDefaults();
    } else {
      console.log("该歌曲暂无歌词");
      setDefaults();
    }
    // 歌词异步加载完成后，立即强制触发一次进度与歌词索引更新，防止不同步
    setAudioTime(true);
    justSetSeek(true);

  } catch (err) {
    $message.error("歌词处理出错");
    console.error("歌词处理出错：", err);
  }
};

/**
 * 初始化媒体会话控制
 * 如果浏览器支持媒体会话控制（ Media Session API ），则关联各类操作
 * @param {object} data - 当前播放数据
 * @param {string} islocal - 是否为本地歌曲
 * @param {string} cover - 封面图像的URL或数据
 */
const initMediaSession = async (data, cover, islocal, isDj) => {
  if (!("mediaSession" in navigator)) return;

  const status = siteStatus();

  // 更新元数据
  navigator.mediaSession.metadata = new MediaMetadata({
    title: data.name,
    artist: isDj ? "电台节目" : (islocal ? data.artists : data.artists?.map((a) => a.name)?.join(" & ")),
    album: isDj ? "电台节目" : (islocal ? data.album : data.album.name),
    artwork: islocal
      ? [{ src: cover, sizes: "512x512", type: "image/png" }]
      : [
        { src: cover?.s, sizes: "96x96", type: "image/jpg" },
        { src: cover?.m, sizes: "256x256", type: "image/jpg" },
        { src: cover?.l, sizes: "512x512", type: "image/jpg" },
      ],
  });

  // 必须明确指定状态
  navigator.mediaSession.playbackState = status.playState ? "playing" : "paused";

  // 绑定动作（建议只绑定一次，或者确保每次指向最新的 state）
  const actionHandlers = [
    ['play', () => fadePlayOrPause("play")],
    ['pause', () => fadePlayOrPause("pause")],
    ['previoustrack', () => changePlayIndex("prev", true)],
    ['nexttrack', () => changePlayIndex("next", true)],
    ['stop', () => soundStop()],
    ['seekto', (details) => setSeek(details.seekTime)]
  ];

  for (const [action, handler] of actionHandlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      console.warn(`Media Session action "${action}" is not supported.`);
    }
  }

  updateMediaSessionPosition();
};

/**
 * 更新 Media Session 的进度状态
 */
export const updateMediaSessionPosition = () => {
  if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
    const status = siteStatus();
    const duration = isSimulating ? simulationDuration : (player?.duration() || 0);
    const currentTime = getSeek();

    // 必须确保 duration > 0 且 currentTime 不超过 duration
    if (duration > 0 && currentTime <= duration) {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: status.playRate || 1,
        position: currentTime,
      });
    }
  }
};

/**
 * 从封面图像中提取主要颜色，并根据亮度进行选择
 * @param {string} islocal - 是否为本地歌曲
 * @param {string} cover - 封面图像的URL或数据
 * @returns {string} - 主要颜色的RGB十六进制表示
 */
const getColorMainColor = async (islocal, cover) => {
  const status = siteStatus();
  try {
    // 获取封面图像的URL
    if (!cover) return (status.coverTheme = {});
    const colorUrl = islocal ? cover : cover.s;
    // 获取渐变色背景
    const gradientColor = await getCoverGradient(colorUrl);
    status.coverBackground = gradientColor;
  } catch (error) {
    console.error("封面颜色获取失败：", error);
    status.coverTheme = {};
  }
};


/**
 * 生成频谱数据 - 自动识别 Howler 模式
 * @param {Object} sound - Howler.js 的音频对象
 */
export const processSpectrum = (sound) => {
  try {
    const settings = siteSettings();

    if (settings.html5Player) {
      // HTML5 播放器模式
      if (!spectrumsData.audioCtx) {
        // 断开之前的连接
        spectrumsData.audio?.disconnect();
        spectrumsData.analyser?.disconnect();
        spectrumsData.audioCtx?.close();
        // 创建新的连接
        spectrumsData.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // 获取音频元素
        const audioDom = sound._sounds[0]._node;
        // 允许跨域请求
        audioDom.crossOrigin = "anonymous";
        // 创建音频源和分析器
        const source = spectrumsData.audioCtx.createMediaElementSource(audioDom);
        const analyser = spectrumsData.audioCtx.createAnalyser();
        // 频谱分析器 FFT
        analyser.fftSize = 1024;
        // 连接音频源和分析器，再连接至音频上下文的目标
        source.connect(analyser);
        analyser.connect(spectrumsData.audioCtx.destination);
        // 更新频谱数据
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        updateSpectrums(analyser, dataArray);
        // 保存当前链接
        spectrumsData.audio = source;
        spectrumsData.analyser = analyser;
      }
    } else {
      // Web Audio 模式
      const ctx = Howler.ctx || spectrumsData.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      spectrumsData.audioCtx = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      // 如果已经有分析器了，先清理掉，确保切歌后重新连接新的 masterGain 信号源
      if (spectrumsData.analyser) {
        resetSpectrum();
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      // Web Audio 模式：Howler.masterGain 在切换实例后内部节点会变化
      // 这里重新连接确保信号通路打开
      Howler.masterGain.connect(analyser);
      // 无需再连 destination，Howler 内部已连
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      spectrumsData.analyser = analyser;
      // 确保只开启一个更新循环
      updateSpectrums(analyser, dataArray);
    }
  } catch (err) {
    console.error("音乐频谱生成失败：", err);
  }
};

/**
 * 递归更新频谱数据
 */
const updateSpectrums = (analyser, dataArray) => {
  const status = siteStatus();

  // 检查分析器是否存在
  if (!analyser) return;

  // 获取频率数据
  analyser.getByteFrequencyData(dataArray);

  // 将数据传给 Pinia 或组件状态
  // 使用 Array.from 确保响应式系统能正确监测到数组变化
  status.spectrumsData = Array.from(dataArray);

  requestAnimationFrame(() => {
    updateSpectrums(analyser, dataArray);
  });
};

/**
 * 在切歌或重置应用时调用
 */
export const resetSpectrum = () => {
  const settings = siteSettings();
  if (settings.html5Player) return;
  if (spectrumsData.source) {
    spectrumsData.source.disconnect();
  }
  if (spectrumsData.analyser) {
    spectrumsData.analyser.disconnect();
  }
  spectrumsData.source = null;
  spectrumsData.analyser = null;
};

/**
 * 获取当前播放歌曲名
 */
const getPlaySongName = () => {
  const status = siteStatus();
  const music = musicData();
  const playSongData = music.getPlaySongData;

  const songName = playSongData.name || "未知曲目";
  const songArtist = Array.isArray(playSongData.artists)
    ? playSongData.artists.map((ar) => ar.name).join(" / ")
    : playSongData.artists || "未知歌手";

  if (status.playState) {
    // return `MeT-Music - ${songName} - ${songArtist} - ${songMid} - ${playTimeData.played} / ${playTimeData.durationTime} - ${lyricText} ${lyricTrans ? ` (${lyricTrans})` : ""}`;
    return `MeT-Music - ${songName} - ${songArtist}`;
  } else {
    return `MeT-Music`;
  }
};

/**
 * 更新 Hook 数据
 */
const updateHookData = () => {
  if (!window.$MeTMusic_Hook) return;

  const status = siteStatus();
  const music = musicData();
  const settings = siteSettings();
  const { lyricsHookOffset } = settings;
  const playSongData = music.getPlaySongData;
  const playTimeData = status.playTimeData;
  const currentTime = playTimeData.currentTime || 0;

  const songName = playSongData.name || "未知曲目";
  const songMid = playSongData.id || "Unknown";
  const songArtist = Array.isArray(playSongData.artists)
    ? playSongData.artists.map((ar) => ar.name).join(" / ")
    : playSongData.artists || "未知歌手";

  const coverTheme = {
    dark: { bg: status.coverTheme?.dark?.bg, mainBg: status.coverTheme?.dark?.mainBg, primary: status.coverTheme?.dark?.primary, shade: status.coverTheme?.dark?.shade, shadeTwo: status.coverTheme?.dark?.shadeTwo },
    light: { bg: status.coverTheme?.light?.bg, mainBg: status.coverTheme?.light?.mainBg, primary: status.coverTheme?.light?.primary, shade: status.coverTheme?.light?.shade, shadeTwo: status.coverTheme?.light?.shadeTwo },
  };

  const coverUrl = music.getPlaySongData?.coverSize?.l;

  try {
    const lrcData = music.playSongLyric.yrc[status.playSongLyricIndex];

    const lyricText = lrcData ? lrcData?.content.map((i) => i.content).join("") : "";
    const lyricTrans = lrcData ? lrcData?.tran : "";

    // ========== 逐字歌词 percent 计算 ==========
    let lyricData = [];

    if (Array.isArray(lrcData?.content)) {
      for (let i = 0; i < lrcData.content.length; i++) {
        const item = lrcData.content[i];
        const start = item.time;
        const end = item.time + item.duration;

        let percent = 0;
        let offsetCurrentTime = currentTime + lyricsHookOffset;

        if (offsetCurrentTime >= end) {
          percent = 1; // 已播放完成
        } else if (offsetCurrentTime >= start && offsetCurrentTime < end) {
          percent = (offsetCurrentTime - start) / item.duration; // 当前播放字
        } else {
          percent = 0; // 尚未播放
        }

        lyricData.push({
          content: item.content,
          percent: Number(percent.toFixed(6))
        });
      }
    }

    window.$MeTMusic_Data = {
      songName,
      songArtist,
      songMid,
      currentTime,
      duration: playTimeData.duration,
      lyricText,
      lyricTrans,
      lyricData,
      coverUrl,
      coverTheme,
      isPlaying: status.playState,
    };

    try {
      window.$MeTMusic_Hook(window.$MeTMusic_Data);
    } catch (error) {
      console.error("$MeTMusic_Hook 调用出错：", error);
    }

  } catch (error) {
    console.error("$MeTMusic_Data 处理出错：", error);
  }

}

/**
 * 播放所有歌曲
 * @param {Array} playlist - 包含歌曲信息的数组
 * @param {string} mode - 播放模式
 */
export const playAllSongs = async (playlist, mode = "normal") => {
  try {
    // pinia
    const music = musicData();
    const status = siteStatus();
    if (status.isInRoom) {
      $message.warning("一起听歌模式下，不允许使用播放全部功能");
      return false;
    }
    if (!playlist) return false;
    // 关闭心动模式
    status.playHeartbeatMode = false;
    // 更改模式和歌单
    status.playMode = mode;
    music.playList = playlist.slice();
    // 是否处于歌单内
    const songId = music.getPlaySongData?.id;
    const existingIndex = playlist.findIndex((song) => song.id === songId);
    // 若不处于
    if (existingIndex === -1 || !songId) {
      console.log("不在歌单内");
      music.playSongData = playlist[0];
      status.playIndex = 0;
      // 初始化播放器
      await initPlayer(true);
    } else {
      console.log("处于歌单内");
      music.playSongData = playlist[existingIndex];
      status.playIndex = existingIndex;
      // 播放
      fadePlayOrPause();
    }
    // 获取封面
    if (music.getPlaySongData?.path) {
      music.playSongData.localCover = await getLocalCoverData(music.getPlaySongData?.path);
    }
    $message.info("已开始播放", { showIcon: false });
  } catch (error) {
    console.error("播放全部歌曲出错：", error);
    $message.error("播放全部歌曲出现错误");
  }
};

const updateLoop = () => {
  setAudioTime();
  justSetSeek();

  // 仅在播放状态或应该播放的状态下持续更新（防止 seek 或加载时 player.playing() 临时为 false 导致 rAF 意外终止）
  const status = siteStatus();
  if (isSimulating ? status.playState : (player?.playing() || status.playState)) {
    rAF_Handle = requestAnimationFrame(updateLoop);
  }
};

/*
 * 清除定时器
 */
const cleanAllInterval = () => {
  if (rAF_Handle) cancelAnimationFrame(rAF_Handle);
  clearInterval(reportInterval);
  clearInterval(seekInterval);
};

/**
 * 更新定时器
 */
const setAllInterval = () => {
  cleanAllInterval();
  // 核心：改用 rAF 驱动 UI 和 歌词
  rAF_Handle = requestAnimationFrame(updateLoop);
  // 上报逻辑保留 setInterval，因为它不需要高频
  reportInterval = setInterval(() => reportPlaybackStatus("progress"), 5000);
  seekInterval = setInterval(() => setAudioTime(), 17);
};

window.$MeTMusic_playOrPause = function () { playOrPause(); };
window.$MeTMusic_next = function () { changePlayIndex("next", true); };
window.$MeTMusic_prev = function () { changePlayIndex("prev", true); };

