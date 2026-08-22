/**
 * 播放引擎。自旧 src/utils/Player.js(1391 行)逐函数移植,逻辑照抄;
 * 全部隐式依赖(Pinia / $message / mediaSession / DOM)改经 PlayerDeps 注入,
 * 见 ./deps.ts。使用前必须先 configurePlayer(deps)。
 *
 * 与源码的有意差异(完整清单):
 *   1. window.$player 全局改为 getPlayerInstance() 导出,应用层自行决定是否上挂 window;
 *   2. updateHookData()(宿主契约广播)改为 deps.env.onTick?.() 回调,payload 组装上移应用层;
 *   3. getColorMainColor 中 coverTheme 的取色副作用由应用层的 coverGradient 实现负责,
 *      引擎只写 coverBackground(源码中 calcAccentColor 直接写 store,属 DOM 实现内部行为);
 *   4. window.$MeTMusic_* 三个控制全局不在 core 挂载,应用层包装 playOrPause/changePlayIndex;
 *   5. mediaSession 的 clear() 只在真正终止播放的路径(mediaSession stop 动作 →
 *      内部 stopPlayback())调用;soundStop 本身不清媒体会话——与旧版一致,
 *      切歌途中的 soundStop 不得瞬断 SMTC;
 *   6. 音乐频谱(spectrum)整套逻辑已删除(设置项与配置存储一并移除);
 *   7. 记忆播放位置改为由应用层启动时经 setRestoreSeek() 交付,createPlayer
 *      首次装载消费一次——旧实现在 createPlayer 里先把 playTimeData 清零,
 *      再读它做恢复,因此记忆进度永远为 0(等同失效);
 *   8. 音乐资源自动缓存带下载进度(status.songCacheProgress,0-100/-1),
 *      且缓存失败时回退为在线直链播放,不再整首播放失败。
 */
import { Howl, Howler } from "howler";
import type { CoverSize, Song } from "../types/song";
import { emptyLyric } from "../types/song";
import { getSongUrl, getSongLyric, getAMttmlLyric } from "../api/song";
import { parseLyric } from "../lyrics/parse";
import { getSongPlayTime } from "../lib/time";
import { parseDurationToSeconds } from "../lib/format";
import type { PlayerDeps, StatusState } from "./deps";

// 全局播放器
let player: Howl | null = null;
let currentPlayId = 0;
// 时长定时器
let seekInterval: ReturnType<typeof setInterval> | undefined;
let reportInterval: ReturnType<typeof setInterval> | undefined;

let rAF_Handle: number | undefined;

// 依赖注入
let deps: PlayerDeps;

/** 注入引擎依赖;应用层启动时调用一次(必须先于任何播放操作) */
export const configurePlayer = (d: PlayerDeps): void => {
  deps = d;
};

/** 当前 Howl 实例(对应旧 window.$player;可能为 null) */
export const getPlayerInstance = (): Howl | null => player;

// ---
// 记忆播放位置
// ---

/** 待恢复的播放位置(秒)与其所属歌曲 id;被 createPlayer 消费一次后清空 */
let pendingRestore: { seek: number; songId: string | number | null } | null = null;

/**
 * 交付一次「上次播放位置」,供下一次装载播放器时恢复。
 * 应用层在启动引导(读持久化的 playTimeData)时调用;songId 用于防止
 * 首曲取链失败自动跳到下一曲后,把上一首的进度错误地套用到新歌上。
 */
export const setRestoreSeek = (seconds: number, songId: string | number | null = null): void => {
  pendingRestore = seconds > 0 ? { seek: seconds, songId } : null;
};

/** 消费待恢复位置(仅当歌曲匹配);无论是否命中都会清空,保证只恢复一次 */
const takeRestoreSeek = (songId: string | number | null): number => {
  if (!pendingRestore) return 0;
  const { seek, songId: memoId } = pendingRestore;
  pendingRestore = null;
  if (memoId != null && songId != null && String(memoId) !== String(songId)) return 0;
  return seek;
};

// ---
// 模拟播放相关
// ---

/** 是否正在模拟播放 */
let isSimulating = false;
/** 模拟播放开始时间 (performance.now()) */
let simulationStartTime = 0;
/** 模拟播放暂停时的时间点 (秒) */
let simulationPausedSeek = 0;
/** 模拟播放的总时长 (秒) */
let simulationDuration = 0;

// 重试次数
let testNumber = 0;
// 是否结束
let isPlayEnd = true;
// 渐出竞态防护:渐出进行中标志与 once("fade") handler 引用
// (渐出未完成时再次 play,需先摘除该 handler 并取消渐出,否则渐出完成回调会把歌暂停)
let pendingFadePause = false;
let fadePauseHandler: (() => void) | null = null;
// 默认标题
const defaultTitle = "MeT-Music";

/**
 * 上报播放状态
 * @param eventType - 事件类型
 */
const reportPlaybackStatus = (eventType: string): void => {
  try {
    const music = deps.music();
    const song = music.getPlaySongData;
    const site = deps.site();
    const statusStore = deps.status();

    // --- 兼容模拟播放 ---
    const currentSeek = isSimulating ? getSeek() : player?.seek?.() || 0;
    const isPlaying = isSimulating ? statusStore.playState : player?.playing() || false;

    const data = {
      event: eventType,
      sessionId: deps.env.sessionId(),
      userId: site.userData.userId,
      songMid: song.id || null,
      status: isPlaying,
      currentTime: currentSeek,
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
    deps.env.setTitle(getPlaySongName());
  } catch (err) {
    console.error("上报播放状态失败：", err);
  }
};

/**
 * 初始化播放器
 */
export const initPlayer = async (playNow = false): Promise<boolean | void> => {
  console.log("[engine] initPlayer called with playNow =", playNow);
  const myPlayId = ++currentPlayId;
  try {
    // 停止播放器
    soundStop();
    // 获取基础数据
    const music = deps.music();
    const status = deps.status();
    const settings = deps.settings();
    const { playIndex, playMode } = status;
    const { playList } = music;
    // 当前播放歌曲数据
    const playSongData = music.getPlaySongData;
    // 是否为本地歌曲
    const isLocalSong = playSongData?.path ? true : false;
    // 获取封面
    if (isLocalSong && deps.env.resolveLocalCover && playSongData?.path) {
      music.playSongData.localCover = await deps.env.resolveLocalCover(playSongData.path);
    }
    if (myPlayId !== currentPlayId) {
      console.log("[engine] initPlayer discarded after local cover fetching");
      return;
    }
    const cover = isLocalSong ? music.playSongData?.localCover : playSongData?.coverSize;
    // 歌词归位
    status.playSongLyricIndex = -1;

    // ---
    // 模拟播放逻辑
    // ---
    if (settings.simulationPlaying) {
      console.log("🎵 (模拟) 初始化播放器");
      isSimulating = true;
      status.playLoading = false;
      // 必须确保 playSongData.duration (mm:ss) 存在
      simulationDuration = parseDurationToSeconds(playSongData.duration as string);
      // 记忆播放位置(模拟播放同样适用;接近结尾时不恢复)
      const restoreSeek = takeRestoreSeek(playSongData?.id ?? null);
      simulationPausedSeek =
        settings.memorySeek &&
        restoreSeek > 1 &&
        (simulationDuration <= 0 || simulationDuration - restoreSeek > 2)
          ? restoreSeek
          : 0;

      // 初始化时间数据
      status.playTimeData = {
        currentTime: simulationPausedSeek,
        duration: simulationDuration,
        bar: simulationDuration
          ? ((simulationPausedSeek / simulationDuration) * 100).toFixed(2)
          : "0",
        played: getSongPlayTime(simulationPausedSeek),
        durationTime: getSongPlayTime(simulationDuration),
      };

      if (myPlayId !== currentPlayId) {
        console.log("[engine] initPlayer simulation aborted");
        return;
      }

      if (playNow) {
        status.playState = true;
        isPlayEnd = false;
        simulationStartTime = performance.now();
        setAllInterval(); // 启动模拟定时器
        reportPlaybackStatus("play");
        deps.env.setTitle(getPlaySongName());
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

      if (myPlayId !== currentPlayId) {
        console.log("[engine] initPlayer discarded after getNormalSongUrl");
        return;
      }

      // 正常播放地址
      if (url) {
        status.playUseOtherSource = false;
        await createPlayer(url, playNow, myPlayId);
      }
      // 下一曲
      else {
        if (status.isInRoom) {
          status.playLoading = false;
          status.playState = false;
          deps.notify.error("获取歌曲播放链接失败，已暂停播放");
        } else {
          if (playIndex !== playList.length - 1) {
            changePlayIndex("next", playNow);
          } else {
            status.playLoading = false;
            status.playState = false;
            deps.notify.warning("列表中暂无可播放歌曲");
          }
        }
      }
    }
    // 本地歌曲
    else if (isLocalSong && playList?.length) {
      const url = playList[playIndex]?.path;
      if (playNow && url) status.playState = true;
      if (url) {
        if (myPlayId !== currentPlayId) {
          console.log("[engine] initPlayer discarded before local song createPlayer");
          return;
        }
        // 创建播放器
        await createPlayer(url, playNow, myPlayId);
      } else {
        if (status.isInRoom) {
          status.playLoading = false;
          status.playState = false;
          deps.notify.error("获取本地歌曲播放链接失败，已暂停播放");
        } else {
          changePlayIndex("next", playNow);
        }
      }
    }
    if (myPlayId !== currentPlayId) {
      console.log("[engine] initPlayer discarded before loading resources");
      return;
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
      deps.notify.fatal?.(
        "致命性错误",
        "歌曲播放中出现错误次数过多，请刷新后重试",
        "刷新",
        () => deps.env.reload(),
      );
      return false;
    }
    console.error("初始化音乐播放器出错：", error);
    deps.notify.error("初始化音乐播放器出错");
  }
};

/**
 * 获取普通模式下的音乐播放地址
 * @param id - 歌曲 id
 * @returns 歌曲播放地址，如果获取失败或歌曲无法播放则返回 null
 */
const getNormalSongUrl = async (
  id: number | string,
  status: StatusState,
  playNow: boolean,
): Promise<string | null> => {
  try {
    const settings = deps.settings();
    const res = await getSongUrl(id, settings.songLevel);
    // 检查是否有有效的响应数据
    if (!res.data?.[0] || !res.data?.[0]?.url) return null;
    // 返回歌曲地址，将 http 转换为 https
    const url: string = res.data[0].url.replace(/^http:/, "https:");
    // 更改状态
    if (playNow && url) status.playState = true;
    return url;
  } catch (error) {
    status.playLoading = false;
    console.error("获取歌曲地址遇到错误：" + error);
    throw error;
  }
};

/** Howler 能识别的音频扩展名(用于 blob: 链接的 format 提示) */
const AUDIO_EXT = /^(mp3|mpeg|m4a|mp4|aac|ogg|oga|opus|wav|wave|flac|webm|weba)$/;

/**
 * 从原始直链推断音频格式。
 *
 * blob: 链接不带扩展名,Howler 的 load() 取不到扩展名就会直接
 * `_emit('loaderror')` 并 return——此时 `_sounds` 还是空数组,后续访问
 * `_sounds[0]._node` 抛 TypeError,整首歌播不了(开启「音乐资源自动缓存」时必现)。
 * 故缓存播放时用原始直链的扩展名喂给 Howl 的 format。
 */
const guessAudioFormat = (url: string): string | undefined => {
  const path = url.split(/[?#]/)[0];
  const dot = path.lastIndexOf(".");
  if (dot === -1) return undefined;
  const ext = path.slice(dot + 1).toLowerCase();
  return AUDIO_EXT.test(ext) ? ext : undefined;
};

/**
 * 创建播放器
 * @param src - 音频文件地址
 * @param autoPlay - 是否自动播放
 * @param playId - 并发丢弃标记
 */
export const createPlayer = async (
  src: string,
  autoPlay = true,
  playId: number | null = null,
): Promise<Howl | void> => {
  console.log("[engine] createPlayer called with src =", src, "autoPlay =", autoPlay, "playId =", playId);
  try {
    // --- 确保已退出模拟模式 ---
    isSimulating = false;

    const music = deps.music();
    const status = deps.status();
    const settings = deps.settings();
    const { playMode } = status;
    const { playList } = music;
    const { memorySeek, useMusicCache, html5Player } = settings;
    // 当前播放歌曲数据
    const playSongData = music.getPlaySongData;
    console.log("[engine] createPlayer - playSongData id:", playSongData?.id, "playState:", status.playState);
    // 消费一次「上次播放位置」(须在下方清零 playTimeData 之前取)
    const restoreSeek = takeRestoreSeek(playSongData?.id ?? null);
    // 本次装载是否仍是最新一次(并发切歌时旧装载不得再写状态)
    const isCurrent = (): boolean => !playId || playId === currentPlayId;
    // 获取播放链接（非电台及云盘歌曲）
    let songUrl = src;
    if (useMusicCache && playMode !== "dj" && !playSongData.pc && deps.env.toBlobUrl) {
      // 需先整首下载再播放:进度条此时临时充当下载进度显示器
      status.songCacheProgress = 0;
      try {
        songUrl = await deps.env.toBlobUrl(src, (percent) => {
          if (isCurrent()) status.songCacheProgress = percent;
        });
      } catch (error) {
        // 缓存失败(跨域/网络等)不应让整首歌播不了,回退在线直链
        console.error("音乐资源缓存失败，已回退在线播放：", error);
        if (isCurrent()) deps.notify.warning("音乐缓存失败，已改为在线播放");
        songUrl = src;
      } finally {
        if (isCurrent()) status.songCacheProgress = -1;
      }
    }

    // --- Guard check after async blob url fetch ---
    if (playId && playId !== currentPlayId) {
      console.log("[engine] createPlayer discarded because playId changed during blob fetching");
      return;
    }

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
    // blob: 链接没有扩展名,必须显式给 format,否则 Howler 认不出编码直接失败
    const blobFormat = songUrl.startsWith("blob:")
      ? [guessAudioFormat(src) ?? "mp3"]
      : undefined;
    player = new Howl({
      src: [songUrl],
      ...(blobFormat ? { format: blobFormat } : {}),
      html5: html5Player,
      preload: "metadata",
      volume: status.playVolume,
      rate: status.playRate,
    });
    // 允许跨域(Howler 载入失败时 _sounds 为空,这里不能硬取下标)
    const audioDom = (player as any)._sounds?.[0]?._node as HTMLAudioElement | undefined;
    if (audioDom) audioDom.crossOrigin = "anonymous";
    // 写入播放历史
    music.setPlayHistory(playSongData);
    // 加载完成
    player?.once("load", () => {
      console.info("🎵 加载完成", player, status.playState);
      if (status.isInRoom) {
        // Sync with the room's current seek position internally
        const lt = deps.lt();
        const room = lt.roomState;
        const now = Date.now();
        const serverNow = now + lt.serverTimeOffset;
        const serverTimeGen = room.serverTime || serverNow;
        const elapsed = room.is_playing ? (serverNow - serverTimeGen) / 1000 : 0;
        const targetSeek = (room.seek_position || 0) + elapsed;
        if (room.is_playing) {
          player?.once("play", () => {
            const playNow2 = Date.now();
            const playServerNow = playNow2 + lt.serverTimeOffset;
            const playServerTimeGen = room.serverTime || playServerNow;
            const currentElapsed = (playServerNow - playServerTimeGen) / 1000;
            const currentTargetSeek = (room.seek_position || 0) + currentElapsed;
            console.log("[engine] room is playing, seeking inside play event to", currentTargetSeek);
            setSeek(currentTargetSeek, true);
          });
          fadePlayOrPause("play");
        } else {
          setSeek(targetSeek, true);
        }
      } else {
        // 恢复上次播放位置(记忆播放位置;接近结尾时不恢复,防止刚进来就切歌)
        const duration = player?.duration() || 0;
        const canRestore =
          memorySeek && restoreSeek > 1 && (duration <= 0 || duration - restoreSeek > 2);
        setSeek(canRestore ? restoreSeek : 0);
        if (!canRestore) status.playTimeData.bar = "0";
        // 自动播放(先定位再起播,二者可同时开启)
        if (autoPlay && status.playState) fadePlayOrPause("play");
      }
      // 取消加载状态
      status.playLoading = false;
    });
    // 开始播放
    player?.on("play", () => {
      console.info("🎵 开始播放：", playSongData);
      isPlayEnd = false;
      setAllInterval();
      // 更改状态
      status.playState = true;
      // 更改页面标题
      deps.env.setTitle(getPlaySongName());
      // 上报播放状态
      reportPlaybackStatus("play");
    });
    // 暂停播放
    player?.on("pause", () => {
      console.info("⏸ 暂停播放");
      cleanAllInterval();
      // 更改状态
      status.playState = false;
      // 补发一帧宿主广播。上面刚把 rAF 与 seekInterval 停掉,
      // 而它们是 setAudioTime(→ onTick)仅有的驱动源;不补的话
      // 「已暂停」这个状态永远发不出去(托盘、SMTC、外部 API 都收不到)。
      setAudioTime(true);
      // 更改页面标题
      deps.env.setTitle(defaultTitle);
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
        deps.lt().sendNext();
      } else {
        changePlayIndex("next", true);
      }
    });
    // 加载失败
    const onLoadError = (_id: unknown, errCode: unknown): void => {
      console.log("播放出现错误：", _id, errCode);
      // 更改状态
      status.playLoading = false;
      // https://github.com/goldfire/howler.js?tab=readme-ov-file#onloaderror-function
      switch (errCode) {
        case 1:
          deps.notify.error("播放出错，用户代理中止了获取媒体");
          break;
        case 2:
          deps.notify.error("播放出错，未知的网络错误");
          break;
        case 3:
          deps.notify.error("播放出错，媒体进行解码时发生错误");
          break;
        case 4:
          deps.notify.error("播放出错，不支持的音频格式或媒体资源不合适");
          break;
        default:
          deps.notify.error("播放遇到未知错误");
          break;
      }
      // 下一曲
      if (status.isInRoom) {
        status.playState = false;
      } else {
        if (playList.length > 1) {
          changePlayIndex("next", true);
        } else {
          status.playState = false;
        }
      }
    };
    player?.on("loaderror", onLoadError);
    // Howler 的 load() 在构造函数里同步执行,若此时就判定源不可用(如认不出格式),
    // 它 emit 的 loaderror 早于上面的监听注册、无人接收,表现为「什么都不发生」。
    // 用 _sounds 是否创建来补判这一次同步失败,走同一套错误处理。
    if (!(player as any)._sounds?.length) {
      console.warn("[engine] Howler 未能创建音频实例(源格式不被支持?)");
      onLoadError(null, 4);
      return;
    }
    // 返回音频对象
    return player;
  } catch (error) {
    console.error("播放遇到错误：" + error);
    deps.notify.error("播放遇到错误，请重试");
    throw error;
  }
};

/**
 * 播放下一首或上一首歌曲
 * @param type - 更改索引的类型  "next" / "prev"
 */
export const changePlayIndex = async (type: "next" | "prev" = "next", play = false): Promise<boolean | void> => {
  const status = deps.status();
  if (status.isInRoom) {
    deps.lt().sendChangeIndex(type);
    return;
  }
  const music = deps.music();
  const settings = deps.settings();
  // 解构音乐数据
  const { playList } = music;
  const { playSongMode, playMode, playHeartbeatMode } = status;
  const { simulationPlaying } = settings;
  if (simulationPlaying) play = true; // 若模拟播放，则强制播放
  // 清除定时器
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
      deps.notify.error("歌曲信息读取错误，跳至下一曲");
      changePlayIndex("next", play);
    }
  }
};

/**
 * 在当前播放歌曲后添加
 * @param data - 歌曲信息
 */
export const addSongToNext = (data: Song, play = false): void => {
  try {
    const music = deps.music();
    const status = deps.status();
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
      music.playList.splice(status.playIndex + 1, 0, data);
      if (play) status.playIndex++;
    }
    // 是否立即播放
    play ? fadePlayOrPause("play") : deps.notify.success("已添加至下一首播放");
  } catch (error) {
    console.error("添加播放歌曲失败：", error);
  }
};

/**
 * 音频渐入渐出
 * @param type - "play" 渐入 / "pause" 渐出
 */
export const fadePlayOrPause = (type: "play" | "pause" = "play"): void => {
  console.log("[engine] fadePlayOrPause called with type =", type);
  const status = deps.status();
  const settings = deps.settings();
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
      deps.media.setPlaybackState(true);
    } else {
      if (!status.playState) return;
      simulationPausedSeek = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
      status.playState = false;
      cleanAllInterval();
      setAudioTime(true); // 同上:tick 停了,状态得手动送出去一次
      reportPlaybackStatus("pause");
      deps.media.setPlaybackState(false);
    }
    return;
  }

  // --- 真实播放器逻辑 ---
  if (type === "play") {
    // 渐出进行中再次 play:摘除渐出完成 handler,取消渐出并把音量渐回目标值,
    // 否则渐出完成回调会在稍后把歌暂停(竞态)。
    if (pendingFadePause) {
      if (fadePauseHandler) player?.off("fade", fadePauseHandler);
      pendingFadePause = false;
      fadePauseHandler = null;
      const volumeNow = player?.volume();
      const currentVolume = typeof volumeNow === "number" ? volumeNow : 0;
      player?.fade(currentVolume, status.playVolume, duration);
      setAllInterval();
      deps.media.setPlaybackState(true);
      syncMediaSessionPosition(true);
      return;
    }
    if (player?.playing()) return;
    player?.play();
    setAllInterval();
    // Tell the OS immediately so the system session is not recycled.
    deps.media.setPlaybackState(true);

    player?.once("play", () => {
      syncMediaSessionPosition(true);
      player?.fade(0, status.playVolume, duration);
    });
  } else if (type === "pause") {
    deps.media.setPlaybackState(false);
    syncMediaSessionPosition(true);

    if (player?.state() === "loading") {
      player?.pause();
      cleanAllInterval();
      status.playState = false;
      // 加载中的 pause 未必会触发 Howler 的 "pause" 事件,这里自己补一帧
      setAudioTime(true);
    } else {
      player?.fade(status.playVolume, 0, duration);
      const onFadeOutDone = (): void => {
        pendingFadePause = false;
        fadePauseHandler = null;
        player?.pause();
        cleanAllInterval();
        deps.media.setPlaybackState(false);
      };
      // 若上一次渐出尚未完成又再次 pause,先摘除旧 handler,避免重复回调
      if (pendingFadePause && fadePauseHandler) player?.off("fade", fadePauseHandler);
      pendingFadePause = true;
      fadePauseHandler = onFadeOutDone;
      player?.once("fade", onFadeOutDone);
    }
  }
};

/**
 * 播放或暂停
 */
export const playOrPause = async (): Promise<void> => {
  const status = deps.status();
  if (status.isInRoom) {
    deps.lt().sendPlayOrPause();
    return;
  }
  // --- 兼容模拟播放 ---
  const isPlaying = isSimulating ? status.playState : player?.playing() || status.playState;
  fadePlayOrPause(isPlaying ? "pause" : "play");
};

/**
 * 设置倍速
 * @param rate - 设置的倍速值
 */
export const setRate = (rate: number | string): void => {
  player?.rate(Number(rate));
  syncMediaSessionPosition(true);
};

/**
 * 设置音量
 * @param volume - 设置的音量值，0-1之间的浮点数
 */
export const setVolume = (volume: number | string): void => {
  player?.volume(Number(volume));
};

/**
 * 停止播放器
 */
export const soundStop = (): void => {
  console.log("[engine] soundStop called");
  // 清理 Howler
  const settings = deps.settings();
  const status = deps.status();

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
  status.songCacheProgress = -1;

  isSimulating = false;
  simulationPausedSeek = 0;
  simulationStartTime = 0;
  simulationDuration = 0;
  cleanAllInterval();

  // 渐出竞态标志复位(旧 player 已销毁,残留 handler 随之失效)
  pendingFadePause = false;
  fadePauseHandler = null;

  player = null;
  // 注意:此处不调用 deps.media.clear() —— soundStop 也在切歌路径(initPlayer/
  // createPlayer)被调用,旧版从不在切歌时清媒体会话,清了会导致 SMTC 瞬断。
  // 真正终止播放时用 stopPlayback()。
};

/**
 * 终止播放(mediaSession stop 动作专用):停止播放器并清除系统媒体会话。
 * 仅此路径调用 deps.media.clear(),对应旧版 stop → soundStop 的完整终止语义。
 */
const stopPlayback = (): void => {
  soundStop();
  deps.media.clear();
};

/**
 * 调整静音
 */
export const setVolumeMute = (): void => {
  const status = deps.status();
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
 * @param seek - 目标进度(秒)
 * @param isInternal - 内部调用(一起听同步),不回发房间
 */
export const setSeek = (seek = 0, isInternal = false): void => {
  console.log("[engine] setSeek called with seek =", seek, "isInternal =", isInternal);
  const status = deps.status();
  if (status.isInRoom && !isInternal) {
    console.log("[engine] setSeek - sending seek to room");
    deps.lt().sendSeek(seek);
  }
  // --- 模拟播放 ---
  if (isSimulating) {
    simulationPausedSeek = seek;
    simulationStartTime = performance.now(); // 重置计时起点
    // 立即更新时间显示
    setAudioTime();
    justSetSeek();
    syncMediaSessionPosition(true);
    reportPlaybackStatus("play");
    return;
  }
  console.log("[engine] setSeek - seeking player to", seek);
  player?.seek(seek);
  setAudioTime(true);
  justSetSeek(true);
  syncMediaSessionPosition(true);
  reportPlaybackStatus("play");
};

/**
 * 获取进度(秒)
 */
export const getSeek = (): number => {
  // --- 模拟播放 ---
  if (isSimulating) {
    const status = deps.status();
    if (status.playState) {
      const currentTime = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
      // 防止超出总时长
      return Math.min(currentTime, simulationDuration);
    } else {
      return simulationPausedSeek;
    }
  }

  if (player) {
    const seek = player.seek();
    return typeof seek === "number" ? seek : 0;
  }
  return 0;
};

/**
 * 歌词时间平移(设置项 lyricsShiftMs,ms → s)。
 * 正值 = 歌词整体延后出现,故从比较用的当前时间中扣除。
 */
const lyricShiftSeconds = (settings: { lyricsShiftMs?: number }): number =>
  (settings.lyricsShiftMs || 0) / 1000;

/**
 * 当前歌词行索引(原 setAudioTime 内三处同样的内联逻辑)。
 *
 * 逐字歌词只在「确实解析出了行」时才用:接口对没有逐字时间轴的歌曲会在 qrc 字段里
 * 回落一份 base64 的普通 lrc(见 lyrics/parse.ts 对 hasYrc 的修正),历史持久化的
 * playSongLyric 里可能仍留着 hasYrc=true 而 yrc 为空的组合。那种组合下会在空数组上
 * findIndex,结果恒为 -1 → 索引恒 -1,整首歌不高亮、不滚动、底栏也没有歌词。
 *
 * 空数组返回 -1,与原实现(findIndex 得 -1 → lyrics.length - 1 = -1)一致。
 */
const computeLyricIndex = (currentTime: number): number => {
  const { hasYrc, lrc, yrc } = deps.music().playSongLyric;
  const settings = deps.settings();
  const lyrics = hasYrc && settings.showYrc && yrc?.length ? yrc : lrc;
  if (!lyrics?.length) return -1;
  const offsetTime = currentTime + settings.lyricsOffset - lyricShiftSeconds(settings);
  const index = lyrics.findIndex((v) => v?.time >= offsetTime);
  return index === -1 ? lyrics.length - 1 : index - 1;
};

/**
 * 更改播放进度
 */
const setAudioTime = (force = false): void => {
  // --- 模拟播放 ---
  if (isSimulating) {
    const status = deps.status();

    // 确保在暂停时 currentTime 不会自己增长
    if (!status.playState) {
      // 如果暂停了，我们仍然需要保持歌词索引，但不更新时间
      const currentTime = simulationPausedSeek;
      // 计算当前歌词播放索引
      status.playSongLyricIndex = computeLyricIndex(currentTime);
      // 时间不更新，但状态要广播出去：暂停后 tick 就停了，
      // 宿主拿到的最后一帧若停在 isPlaying: true，外部会一直以为还在播
      deps.env.onTick?.();
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
        deps.lt().sendNext();
      } else {
        changePlayIndex("next", true); // 播放下一首
      }
      return;
    }

    const bar = duration ? ((currentTime / duration) * 100).toFixed(2) : 0;
    const played = getSongPlayTime(currentTime);
    const durationTime = getSongPlayTime(duration);
    // 赋值数据
    status.playTimeData = { currentTime, duration, bar, played, durationTime };
    status.playSongLyricIndex = computeLyricIndex(currentTime);
    deps.env.setTitle(getPlaySongName());
    deps.env.onTick?.();
    syncMediaSessionPosition();
    return; // 结束函数
  }
  // --- 模拟播放结束 ---

  if (player && (player.playing() || force)) {
    const status = deps.status();
    const currentTime = player.seek();
    const seekVal = typeof currentTime === "number" ? currentTime : 0;
    const duration = player.duration() || (player as any)._duration || 0;
    // 计算数据
    const bar = duration ? ((seekVal / duration) * 100).toFixed(2) : 0;
    const played = getSongPlayTime(seekVal);
    const durationTime = getSongPlayTime(duration);
    // 赋值数据
    status.playTimeData = { currentTime: seekVal, duration, bar, played, durationTime };
    status.playSongLyricIndex = computeLyricIndex(seekVal);
    deps.env.setTitle(getPlaySongName());
    deps.env.onTick?.();
    syncMediaSessionPosition();
  } else {
    // 未播放时清空数据
    deps.env.setTitle(getPlaySongName());
    deps.env.onTick?.();
  }
};

/**
 * 更改播放进度（频繁）
 */
const justSetSeek = (force = false): void => {
  // --- 模拟播放 ---
  if (isSimulating) {
    const status = deps.status();

    let currentTime: number;
    if (status.playState) {
      currentTime = (performance.now() - simulationStartTime) / 1000 + simulationPausedSeek;
    } else {
      currentTime = simulationPausedSeek;
    }

    const finalTime = Math.min(currentTime, simulationDuration);
    status.playSeek = finalTime;
    status.playSeekMs = Math.floor(finalTime * 1000);
    return;
  }
  // --- 模拟播放结束 ---

  if (player && (player.playing() || force)) {
    const status = deps.status();
    const currentTime = player.seek();
    const seekVal = typeof currentTime === "number" ? currentTime : 0;
    status.playSeek = seekVal;
    status.playSeekMs = Math.floor(seekVal * 1000);
  }
};

/**
 * 立即重算一次进度与歌词索引。
 *
 * 常规更新只在播放中的 tick 里发生,因此歌词类设置(歌词偏转 / 歌词时间平移)
 * 改完后在暂停态不会有任何反应、播放态也要等下一帧才对位。
 * 应用层在这些设置变更后调用本函数,使其立即生效。
 */
export const refreshPlayProgress = (): void => {
  setAudioTime(true);
  justSetSeek(true);
};

/**
 * 获取歌曲的歌词数据并解析
 * @param islocal - 是否为本地歌曲
 * @param data - 歌曲的数据
 */
const getSongLyricData = async (islocal: boolean, data: Song): Promise<boolean | void> => {
  if (!data?.id) return false;
  try {
    const music = deps.music();
    const settings = deps.settings();
    const setDefaults = () => {
      music.playSongLyric = emptyLyric();
    };
    const lyricResponse = await getSongLyric(data?.id);
    const lyricData = lyricResponse?.lrc;
    if (lyricData) {
      let ttmlLyricResponse = null;
      if (settings.useAMttmlDB) {
        ttmlLyricResponse = await getAMttmlLyric(data?.id);
      }
      const result = await parseLyric(lyricResponse, ttmlLyricResponse, {
        removeInfo: settings.removeInfo,
        removeAMInfo: settings.removeAMInfo,
      }, deps.notify);
      result ? (music.playSongLyric = result) : setDefaults();
    } else {
      console.log("该歌曲暂无歌词");
      setDefaults();
    }
    // 歌词异步加载完成后，立即强制触发一次进度与歌词索引更新，防止不同步
    setAudioTime(true);
    justSetSeek(true);
  } catch (err) {
    deps.notify.error("歌词处理出错");
    console.error("歌词处理出错：", err);
  }
};

const formatSessionText = (value: unknown): string => {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (item as { name?: string })?.name || item)
      .filter(Boolean)
      .join(" / ");
  }
  if (typeof value === "object") return (value as { name?: string }).name || "";
  return String(value);
};

const buildSessionArtwork = (
  cover: string | CoverSize | undefined,
  isLocal: boolean,
): { src: string; sizes: string; type: string }[] => {
  if (!cover) return [];
  if (isLocal || typeof cover === "string") {
    return [{ src: cover as string, sizes: "512x512", type: "image/png" }];
  }

  return [
    cover.s && { src: cover.s, sizes: "96x96", type: "image/jpeg" },
    cover.m && { src: cover.m, sizes: "256x256", type: "image/jpeg" },
    cover.l && { src: cover.l, sizes: "512x512", type: "image/jpeg" },
  ].filter(Boolean) as { src: string; sizes: string; type: string }[];
};

const bindPlayerMediaSession = (): void => {
  deps.media.bindActions({
    play: () => {
      if (!deps.status().playState) playOrPause();
    },
    pause: () => {
      if (deps.status().playState) playOrPause();
    },
    previoustrack: () => changePlayIndex("prev", true),
    nexttrack: () => changePlayIndex("next", true),
    stop: () => {
      stopPlayback();
    },
    seekto: (details) => {
      if (typeof details?.seekTime === "number") setSeek(details.seekTime);
    },
    seekbackward: (details) => {
      setSeek(Math.max(0, getSeek() - (details?.seekOffset || 10)));
    },
    seekforward: (details) => {
      const duration = isSimulating ? simulationDuration : player?.duration() || 0;
      setSeek(Math.min(duration || 0, getSeek() + (details?.seekOffset || 10)));
    },
    visibilitychange: () => {
      deps.media.setPlaybackState(deps.status().playState);
    },
  });
};

const syncMediaSessionPosition = (force = false): void => {
  const status = deps.status();
  const duration = isSimulating
    ? simulationDuration
    : player?.duration() || (player as any)?._duration || 0;
  deps.media.updatePosition(
    {
      duration,
      position: getSeek(),
      playbackRate: status.playRate || 1,
    },
    force,
  );
};

/**
 * 初始化媒体会话控制
 */
const initMediaSession = (
  data: Song,
  cover: string | CoverSize | undefined,
  isLocal: boolean,
  isDj: boolean,
): void => {
  bindPlayerMediaSession();
  deps.media.setMetadata({
    title: data?.name || "MeT-Music",
    artist: isDj ? "电台节目" : formatSessionText(data?.artists),
    album: isDj ? "电台节目" : formatSessionText(data?.album),
    artwork: buildSessionArtwork(cover, isLocal),
  });
  deps.media.setPlaybackState(deps.status().playState);
  syncMediaSessionPosition(true);
};

/**
 * 从封面图像中提取主要颜色
 * 取色的 DOM 实现由应用层经 env.coverGradient 注入;
 * coverTheme 的写入由该实现自行负责(与旧 calcAccentColor 行为一致)。
 */
const getColorMainColor = async (islocal: boolean, cover: string | CoverSize | undefined): Promise<void> => {
  const status = deps.status();
  try {
    // 获取封面图像的URL
    if (!cover) {
      status.coverTheme = {};
      return;
    }
    if (!deps.env.coverGradient) return;
    const colorUrl = islocal ? (cover as string) : (cover as CoverSize).s;
    if (!colorUrl) return;
    // 获取渐变色背景
    const gradientColor = await deps.env.coverGradient(colorUrl);
    status.coverBackground = gradientColor;
  } catch (error) {
    console.error("封面颜色获取失败：", error);
    status.coverTheme = {};
  }
};

/**
 * 获取当前播放歌曲名(用于页面标题)
 */
export const getPlaySongName = (): string => {
  const status = deps.status();
  const music = deps.music();
  const playSongData = music.getPlaySongData;

  const songName = playSongData.name || "未知曲目";
  const songArtist = Array.isArray(playSongData.artists)
    ? playSongData.artists.map((ar) => ar.name).join(" / ")
    : (playSongData.artists as string) || "未知歌手";

  if (status.playState) {
    return `MeT-Music - ${songName} - ${songArtist}`;
  } else {
    return `MeT-Music`;
  }
};

/**
 * 播放所有歌曲
 * @param playlist - 包含歌曲信息的数组
 * @param mode - 播放模式
 */
export const playAllSongs = async (playlist: Song[], mode: "normal" | "fm" | "dj" = "normal"): Promise<boolean | void> => {
  try {
    const music = deps.music();
    const status = deps.status();
    if (status.isInRoom) {
      deps.notify.warning("一起听歌模式下，不允许使用播放全部功能");
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
    const currentPath = music.getPlaySongData?.path;
    if (currentPath && deps.env.resolveLocalCover) {
      music.playSongData.localCover = await deps.env.resolveLocalCover(currentPath);
    }
    deps.notify.info("已开始播放");
  } catch (error) {
    console.error("播放全部歌曲出错：", error);
    deps.notify.error("播放全部歌曲出现错误");
  }
};

const updateLoop = (): void => {
  setAudioTime();
  justSetSeek();

  // 仅在播放状态或应该播放的状态下持续更新（防止 seek 或加载时 player.playing() 临时为 false 导致 rAF 意外终止）
  const status = deps.status();
  if (isSimulating ? status.playState : player?.playing() || status.playState) {
    rAF_Handle = requestAnimationFrame(updateLoop);
  }
};

/*
 * 清除定时器
 */
const cleanAllInterval = (): void => {
  if (rAF_Handle) cancelAnimationFrame(rAF_Handle);
  clearInterval(reportInterval);
  clearInterval(seekInterval);
};

/**
 * 更新定时器
 */
const setAllInterval = (): void => {
  cleanAllInterval();
  // 核心：改用 rAF 驱动 UI 和 歌词
  rAF_Handle = requestAnimationFrame(updateLoop);
  // 上报逻辑保留 setInterval，因为它不需要高频
  reportInterval = setInterval(() => reportPlaybackStatus("progress"), 5000);
  seekInterval = setInterval(() => setAudioTime(), 17);
};

/**
 * 解锁/恢复音频上下文。
 * 浏览器自动播放策略下,Web Audio 需在用户手势中 resume;
 * 旧 UI 在"一起听"入房点击时调用 Howler.ctx.resume(),经此导出替代。
 */
export const resumeAudioContext = (): void => {
  try {
    if (Howler.ctx && Howler.ctx.state === "suspended") {
      void Howler.ctx.resume();
    }
  } catch (err) {
    console.warn("恢复音频上下文失败：", err);
  }
};
