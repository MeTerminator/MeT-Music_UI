<!-- 播放器 - 底栏 -->
<template>
  <n-card :class="{
    'main-player': true,
    'show-bar': music.getPlaySongData?.id && showPlayBar,
    'no-sider': !showSider,
  }" content-style="padding: 0" @dblclick.stop="openFullPlayer">
    <!-- 进度条 -->
    <vue-slider v-model="playTimeData.bar" :use-keyboard="false" tooltip="active" width="100%" height="3px"
      class="slider" @drag-start="fadePlayOrPause('pause')" @drag-end="sliderDragEnd"
      @click.stop="songTimeSliderUpdate(playTimeData.bar)">
      <template #tooltip>
        <div class="slider-tooltip">
          {{ sliderTooltip }}
        </div>
      </template>
    </vue-slider>
    <!-- 主播放器 -->
    <div class="player">
      <!-- 歌曲信息 -->
      <div class="info">
        <Transition name="fade" mode="out-in">
          <div :key="`${music.getPlaySongData?.id}-${playCoverType}`" :class="['cover', playCoverType]"
            @click.stop="openFullPlayer">
            <n-image :src="music.getPlaySongData?.coverSize?.s ||
              music.getPlaySongData?.cover ||
              music.getPlaySongData?.localCover
              " :style="{
                animationPlayState: playState ? 'running' : 'paused',
              }" class="cover-img" preview-disabled @load="
                (e) => {
                  e.target.style.opacity = 1;
                }
              ">
              <template #placeholder>
                <div class="cover-loading">
                  <img class="loading-img" src="/images/pic/song.jpg?assest" alt="loading-img" />
                </div>
              </template>
            </n-image>
            <!-- 打开播放器 -->
            <n-icon class="open" size="30">
              <SvgIcon icon="pan-zoom-rounded" />
            </n-icon>
          </div>
        </Transition>
        <div class="song-info">
          <div class="name">
            <n-text class="text">
              {{ music.getPlaySongData?.name || "未知曲目" }}
            </n-text>
            <!-- 更多操作 -->
            <n-dropdown v-if="!music.getPlaySongData?.path" :options="songMoreOptions" :show-arrow="true"
              placement="top-start" trigger="click">
              <n-icon depth="3" size="20" class="more" @click.stop @dblclick.stop>
                <SvgIcon icon="format-list-bulleted" />
              </n-icon>
            </n-dropdown>
          </div>
          <div class="subtitle">
            <Transition name="lyric-scroll">
              <!-- 歌手 -->
              <div v-if="
                ((!playState || !bottomLyricShow || playMode === 'dj') &&
                  playSongLyric.lrc?.length) ||
                playSongLyricIndex === -1
              " class="artist">
                <template v-if="
                  music.getPlaySongData?.artists && Array.isArray(music.getPlaySongData.artists)
                ">
                  <n-text v-for="ar in music.getPlaySongData.artists" :key="ar.id" class="ar"
                    @click.stop="router.push(`/artist?id=${ar.id}`)">
                    {{ ar.name }}
                  </n-text>
                </template>
                <div v-else-if="playMode === 'dj'" class="ar">电台节目</div>
                <n-text v-else class="ar">
                  {{ music.getPlaySongData?.artists || "未知艺术家" }}
                </n-text>
              </div>
              <!-- 歌词 -->
              <div v-else :key="playSongLyricIndex" class="lrc">
                <!-- 逐字歌词 -->
                <template v-if="playSongLyric.hasYrc && showYrc">
                  <n-text class="lrc-text" :depth="3">
                    <span v-for="(item, index) in playSongLyric.yrc[playSongLyricIndex]?.content" :key="index"
                      :data-content="item.content" :class="['yrc-word', { space: item.endsWithSpace }]"
                      :style="getKtvStyle(item)">
                      {{ item.content }}
                    </span>
                  </n-text>
                </template>
                <!-- 普通歌词 -->
                <n-text v-else class="lrc-text" :depth="3">
                  {{ playSongLyric.lrc[playSongLyricIndex]?.content }}
                </n-text>
              </div>
            </Transition>
          </div>

        </div>
      </div>
      <!-- 播放控制 -->
      <div class="control" @dblclick.stop>
        <Transition name="fade" mode="out-in">
          <!-- 上一曲 -->
          <n-icon class="play-prev" size="24" @click.stop="changePlayIndexDebounce('prev')">
            <SvgIcon icon="skip-previous-rounded" />
          </n-icon>
        </Transition>
        <!-- 播放暂停 -->
        <n-button :loading="playLoading" :focusable="false" tag="div" type="primary" class="play-control" strong
          secondary circle @click.stop="playOrPause">
          <template #icon>
            <Transition name="fade" mode="out-in">
              <n-icon :key="playState" size="28">
                <SvgIcon :icon="playState ? 'pause-rounded' : 'play-arrow-rounded'" />
              </n-icon>
            </Transition>
          </template>
        </n-button>
        <!-- 下一曲 -->
        <n-icon class="play-next" size="24" @click.stop="changePlayIndexDebounce('next')">
          <SvgIcon icon="skip-next-rounded" />
        </n-icon>
      </div>
      <!-- 功能区 -->
      <Transition name="fade" mode="out-in">
        <div :key="playMode" class="menu">
          <!-- 时间进度 -->
          <div class="time hidden">
            <n-text class="played" depth="3">{{ playTimeData.played }}</n-text>
            <n-text depth="3">{{ playTimeData.durationTime }}</n-text>
          </div>
          <!-- 播放模式 -->
          <n-dropdown v-if="playMode !== 'fm'" :options="playModeOptions" :show-arrow="true" trigger="hover"
            @select="playModeChange">
            <n-icon class="mode hidden" size="22" @click.stop="playModeChange(false)" @dblclick.stop>
              <SvgIcon :icon="playHeartbeatMode
                ? 'heartbit'
                : playSongMode === 'normal'
                  ? 'repeat-list'
                  : playSongMode === 'random'
                    ? 'shuffle'
                    : 'repeat-song'
                " isSpecial />
            </n-icon>
          </n-dropdown>
          <!-- 倍速 -->
          <n-popover :show-arrow="false" trigger="hover" placement="top-end" raw>
            <template #trigger>
              <div class="speed hidden" @click.stop="(playRate = 1), setRate(1)" @dblclick.stop>
                <n-icon v-if="playRate === 1" size="22">
                  <SvgIcon icon="speed-rounded" />
                </n-icon>
                <n-text v-else class="speed-text">{{ playRate }}x</n-text>
              </div>
            </template>
            <!-- 倍速调整 -->
            <div class="slider-content">
              <n-slider v-model:value="playRate" :tooltip="false" :min="0.1" :max="2" :step="0.1" :marks="{
                0.1: '减速',
                1: '正常',
                2: '加速',
              }" style="width: 220px" @update:value="setRate" />
            </div>
          </n-popover>
          <!-- 音量 -->
          <n-popover trigger="hover" :show-arrow="false" raw>
            <template #trigger>
              <n-icon class="volume hidden" size="22" @click.stop="setVolumeMute" @wheel="changeVolume">
                <SvgIcon v-if="playVolume === 0" icon="no-sound-rounded" />
                <SvgIcon v-else-if="playVolume > 0 && playVolume < 0.4" icon="volume-mute-rounded" />
                <SvgIcon v-else-if="playVolume >= 0.4 && playVolume < 0.7" icon="volume-down-rounded" />
                <SvgIcon v-else icon="volume-up-rounded" />
              </n-icon>
            </template>
            <!-- 音量调整 -->
            <div :style="{
              padding: '10px 0',
              width: '50px',
            }" class="slider-content hidden" @wheel="changeVolume">
              <n-slider v-model:value="playVolume" :tooltip="false" :min="0" :max="1" :step="0.01" vertical
                style="height: 120px" @update:value="setVolume" />
              <n-text class="slider-num" depth="3">{{ (playVolume * 100).toFixed(0) }}%</n-text>
            </div>
          </n-popover>
          <!-- 播放列表 -->
          <n-badge v-if="playMode !== 'fm'" :value="playList?.length ?? 0" :show="showPlaylistCount" :max="999" :style="{
            marginRight: showPlaylistCount ? '12px' : null,
          }" class="playlist">
            <n-icon size="22" @click.stop="playListShow = !playListShow">
              <SvgIcon icon="queue-music-rounded" />
            </n-icon>
          </n-badge>
        </div>
      </Transition>
    </div>
  </n-card>
</template>

<script setup>
import { NIcon } from "naive-ui";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { musicData, siteStatus, siteData, siteSettings } from "@/stores";
import {
  playOrPause,
  fadePlayOrPause,
  setSeek,
  changePlayIndex,
  setVolume,
  setVolumeMute,
  setRate,
  processSpectrum,
} from "@/utils/Player";
import { getSongPlayTime } from "@/utils/timeTools";
import debounce from "@/utils/debounce";
import SvgIcon from "@/components/Global/SvgIcon";
import VueSlider from "vue-slider-component";
import "vue-slider-component/theme/default.css";
import { copyData } from "@/utils/helper";

const router = useRouter();
const data = siteData();
const music = musicData();
const status = siteStatus();
const settings = siteSettings();
const { playList, playListOld, playSongLyric } = storeToRefs(music);
const {
  playLoading,
  playState,
  playListShow,
  showPlayBar,
  showFullPlayer,
  playSongLyricIndex,
  playTimeData,
  playRate,
  playVolume,
  playIndex,
  playMode,
  playSongMode,
  playHeartbeatMode,
} = storeToRefs(status);
const { showYrc, bottomLyricShow, showSider, showPlaylistCount, showSpectrums, playCoverType } =
  storeToRefs(settings);

const preciseTime = ref(0); // 当前高精度时间（毫秒）

// 图标渲染
const renderIcon = (icon, isSpecial = false) => {
  return () => h(NIcon, null, { default: () => h(SvgIcon, { icon, isSpecial }) });
};

// 播放模式数据
const playModeOptions = ref([
  {
    label: "单曲循环",
    key: "repeat",
    icon: renderIcon("repeat-song", true),
  },
  {
    label: "列表循环",
    key: "normal",
    icon: renderIcon("repeat-list", true),
  },
  {
    label: "随机播放",
    key: "random",
    icon: renderIcon("shuffle", true),
  },
]);

// 歌曲更多操作
const songMoreOptions = computed(() => [
  {
    key: "comment",
    label: "查看评论",
    // props: {
    //   onClick: () => {
    //     router.push({
    //       path: "/comment",
    //       query: {
    //         id: music.getPlaySongData?.id,
    //       },
    //     });
    //   },
    // },
    props: {
      onclick: () => {
        const id = music.getPlaySongData?.id;
        if (id) router.push(`/comments?mid=${id}`);
      },
    },
    icon: renderIcon("comment-text"),
  },
  {
    key: "originalpage",
    label: "查看原始页面",
    // props: {
    //   onClick: () => {
    //     router.push({
    //       path: "/comment",
    //       query: {
    //         id: music.getPlaySongData?.id,
    //       },
    //     });
    //   },
    // },
    props: {
      onclick: () => {
        const id = music.getPlaySongData?.id;
        if (id) window.open(`https://y.qq.com/n/ryqq/songDetail/${id}`);
      },
    },
    icon: renderIcon("content-copy"),
  },
  {
    key: "share",
    label: `复制歌曲链接`,
    props: {
      onClick: () => {
        const id = music.getPlaySongData?.id;
        const shareUrl = `https://y.qq.com/n/ryqq/songDetail/${id}`;
        copyData(shareUrl, `复制歌曲链接`);
      },
    },
    icon: renderIcon("share"),
  },
  {
    key: "mv",
    label: "观看 MV",
    show: music.getPlaySongData?.mv && music.getPlaySongData?.mv !== 0 ? true : false,
    props: {
      onClick: () => {
        router.push({
          path: "/videos-player",
          query: {
            id: music.getPlaySongData?.mv,
          },
        });
      },
    },
    icon: renderIcon("video"),
  },
  {
    key: "song-detail",
    label: "查看单曲详情",
    show: music.getPlaySongData?.path ? false : true,
    props: {
      onClick: () => {
        router.push(`/song?mid=${music.getPlaySongData?.id}`);
      },
    },
    icon: renderIcon("information-line"),
  },
  {
    key: "download",
    label: "下载歌曲",
    show: music.getPlaySongData?.path ? false : true,
    props: {
      onClick: () => {
        UrlDownloadSong()
      },
    },
    icon: renderIcon("download"),
  },
]);

// 下载歌曲 MeT
const UrlDownloadSong = () => {
  const mid = music.getPlaySongData?.id;
  const music_quality = settings.songLevel;
  router.push(`/download?mid=${mid}&music_quality=${music_quality}`);
}

// 进度条浮窗
const sliderTooltip = computed(() => {
  return getSongPlayTime((playTimeData.value.duration / 100) * playTimeData.value.bar);
});

// 进度条拖拽结束
const sliderDragEnd = () => {
  songTimeSliderUpdate(playTimeData.value?.bar);
  playOrPause();
};

// 进度条更新
const songTimeSliderUpdate = (val) => {
  if (playTimeData.value?.duration) {
    const currentTime = (playTimeData.value.duration / 100) * val;
    setSeek(currentTime);
    if (playState.value) $player?.play();
    else $player?.pause();
  }
};

// 开启播放器
const openFullPlayer = () => {
  if (showSpectrums.value && typeof $player !== "undefined") processSpectrum($player);
  showFullPlayer.value = true;
};

// 上下曲切换
const changePlayIndexDebounce = debounce(async (type, id) => {
  changePlayIndex(type, true);
}, 300);

// 播放模式切换
const playModeChange = (mode) => {
  const modeMap = {
    normal: "random",
    random: "shuffle",
    shuffle: "normal",
  };
  // 关闭心动模式
  if (playHeartbeatMode.value) {
    playHeartbeatMode.value = false;
    // 回复原列表
    playIndex.value = 0;
    playList.value = playListOld.value;
    playListOld.value = [];
  }
  // 切换模式
  if (mode) {
    playSongMode.value = mode;
  } else {
    playSongMode.value = modeMap[playSongMode.value] || "normal";
  }
};

// 音量条鼠标滚动
const changeVolume = (e) => {
  const deltaY = e.deltaY;
  if (deltaY > 0) {
    // 向下滚动
    if (playVolume.value >= 0) {
      playVolume.value = Math.max(playVolume.value - 0.05, 0);
    }
  } else if (deltaY < 0) {
    // 向上滚动
    if (playVolume.value < 1) {
      playVolume.value = Math.min(playVolume.value + 0.05, 1);
    }
  }
  // 更新音量
  setVolume(playVolume.value);
};

// 修改计算函数，适配秒单位数据
const getKtvStyle = (item) => {
  // 核心：直接获取当前播放器秒数
  const now = playTimeData.value.currentTime;
  const startTime = item.time; // 数据里的 28.53
  const duration = item.duration; // 数据里的 0.36

  let percent = 0;
  if (now >= startTime + duration) {
    percent = 100;
  } else if (now > startTime) {
    // 计算百分比：(当前时间 - 开始时间) / 持续时间
    percent = ((now - startTime) / duration) * 100;
  }

  return {
    '--fill-percent': `${percent}%`
  };
};

// 监听心动模式
watch(
  () => playHeartbeatMode.value,
  (val) => $message.success(`已${val ? "开启" : "退出"}心动模式`),
);
</script>

<style lang="scss" scoped>
.main-player {
  position: fixed;
  height: 80px;
  left: 0;
  bottom: -90px;
  width: 100%;
  padding: 0 15px;
  z-index: 2;
  transition: bottom 0.3s;

  .slider {
    position: absolute;
    top: -11px;
    left: 0;
    height: 22px;
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;

    .slider-tooltip {
      font-size: 12px;
      white-space: nowrap;
      background-color: var(--n-color);
      outline: 1px solid var(--n-border-color);
      padding: 2px 8px;
      border-radius: 25px;
    }

    :deep(.vue-slider-rail) {
      background-color: var(--main-boxshadow-color);
      border-radius: 25px;

      .vue-slider-process {
        background-color: var(--main-color);
        // transition: none !important;
      }

      .vue-slider-dot {
        width: 12px !important;
        height: 12px !important;
        // transition: none !important;
      }

      .vue-slider-dot-handle {
        transition: box-shadow 0.3s;
        background-color: var(--main-color);
      }

      .vue-slider-dot-handle-focus {
        box-shadow: 0px 0px 1px 2px var(--main-color);
      }
    }
  }

  .player {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-items: center;

    .info {
      display: flex;
      flex-direction: row;
      align-items: center;

      .cover {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 55px;
        height: 55px;
        min-width: 55px;
        border-radius: 8px;
        overflow: hidden;
        margin-right: 12px;
        cursor: pointer;

        .cover-img {
          width: 100%;
          height: 100%;
          transition: opacity 0.1s ease-in-out;

          :deep(img) {
            width: 100%;
            opacity: 0;
            transition:
              opacity 0.3s,
              transform 0.3s,
              filter 0.3s;
          }
        }

        .open {
          position: absolute;
          opacity: 0;
          color: #efefef;
          transform: scale(0.6);
          transition:
            opacity 0.3s,
            transform 0.3s;
        }

        &:hover {
          :deep(img) {
            transform: scale(1.1);
            filter: blur(6px) brightness(0.8);
          }

          .open {
            position: absolute;
            opacity: 1;
            transform: scale(1);
            transition: opacity 0.3s ease-in-out;
          }
        }

        &.record {
          .cover-img {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            animation: playerCoverRotate 18s linear infinite;
            background: no-repeat url("/images/pic/record.png?assest") center;

            :deep(img) {
              width: 40px;
              height: 40px;
              min-width: 40px;
              max-width: 40px;
              border-radius: 50%;
              box-shadow: 0px 0px 1px 1px rgba(255, 255, 255, 0.06);
            }
          }

          &:hover {
            :deep(img) {
              transform: none;
              filter: brightness(0.5);
            }

            .open {
              transform: scale(0.8);
            }
          }
        }
      }

      .song-info {
        flex: auto;

        .name {
          display: flex;
          flex-direction: row;
          align-items: center;

          .text {
            font-weight: bold;
            font-size: 16px;
            transition: color 0.3s;
            cursor: pointer;

            &:hover {
              color: var(--main-color);
            }
          }

          .favorite {
            margin-left: 8px;
            font-size: 20px;
            color: var(--main-color);
            transition: transform 0.3s;
            cursor: pointer;

            &:hover {
              transform: scale(1.15);
            }

            &:active {
              transform: scale(1);
            }
          }

          .more {
            margin-left: 8px;
            color: var(--main-color);
            cursor: pointer;
          }
        }

        .subtitle {
          position: relative;
          overflow: hidden;
          line-height: 1.5;
          width: 100%;

          .artist {
            font-size: 13px;
            margin-top: 2px;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 1;
            overflow: hidden;
            word-break: break-all;

            .ar {
              display: inline-flex;
              transition: color 0.3s;
              cursor: pointer;

              &::after {
                content: "/";
                margin: 0 4px;
                transition: none;
              }

              &:last-child {
                &::after {
                  display: none;
                }
              }

              &:hover {
                color: var(--main-color);

                &::after {
                  color: var(--n-close-icon-color);
                }
              }
            }
          }

          .lrc {
            .lrc-text {
              margin-top: 2px;
              font-size: 13px;
              transition: opacity 0.1s ease-in-out;

              .space {
                margin-right: 4px;
              }

              .yrc-word {
                position: relative;
                display: inline-block;
                white-space: pre; // 保持空格

                // 底色
                color: var(--word-color);

                // 进度染色层
                &::after {
                  content: attr(data-content); // 需要在 HTML 中添加 data-content
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: var(--fill-percent);
                  white-space: pre;
                  overflow: hidden;
                  color: var(--main-color);
                  transition: width 0.1s linear; // 稍微平滑一下
                }

                &.space {
                  margin-right: 4px;
                }
              }
            }
          }
        }
      }
    }

    .control {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;

      .play-control {
        --n-width: 44px;
        --n-height: 44px;
        margin: 0 12px;
        transition:
          background-color 0.3s,
          transform 0.3s;

        .n-icon {
          transition: opacity 0.1s ease-in-out;
        }

        &:hover {
          transform: scale(1.1);
        }

        &:active {
          transform: scale(1);
        }
      }

      .play-prev,
      .play-next {
        padding: 6px;
        border-radius: 50%;
        color: var(--main-color);
        transition:
          background-color 0.3s,
          transform 0.3s;
        cursor: pointer;

        &:hover {
          transform: scale(1.1);
          background-color: var(--main-second-color);
        }

        &:active {
          transform: scale(1);
        }
      }
    }

    .menu {
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
      transition: opacity 0.1s;

      .n-icon {
        margin-left: 8px;
        padding: 8px;
        border-radius: 8px;
        color: var(--main-color);
        transition:
          background-color 0.3s,
          transform 0.3s,
          opacity 0.1s ease-in-out;
        cursor: pointer;

        :deep(.iconify) {
          transition: opacity 0.1s;
        }

        &:hover {
          transform: scale(1.1);
          background-color: var(--main-second-color);
        }

        &:active {
          transform: scale(1);
        }
      }

      .time {
        display: flex;
        align-items: center;
        font-size: 12px;
        margin-right: 4px;

        .played {
          &::after {
            content: "/";
            margin: 0 4px;
          }
        }
      }

      .speed {
        margin-left: 8px;
        display: flex;
        justify-content: center;
        flex-direction: column;
        align-items: center;

        .n-icon {
          margin-left: 0;
        }

        .speed-text {
          width: 38px;
          height: 38px;
          color: var(--main-color);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.1s ease-in-out;
          transform: translateY(-1px);
          cursor: pointer;
        }
      }

      .playlist {
        transition: margin 0.3s;

        &.count {
          margin-right: 12px;
        }
      }

      :deep(.n-badge-sup) {
        background: var(--main-boxshadow-color);
        backdrop-filter: blur(20px);

        .n-base-slot-machine {
          color: var(--main-color);
        }
      }
    }

    @media (max-width: 900px) {
      .menu {
        .time {
          display: none;
        }
      }
    }

    @media (max-width: 700px) {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;

      .control {
        margin-left: auto;

        .play-prev,
        .play-next {
          display: none;
        }
      }

      .menu {
        .hidden {
          display: none;
        }
      }
    }
  }

  &.show-bar {
    bottom: 0;
  }

  &.no-sider {
    padding: 0;

    .player {
      width: auto;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 10vw;

      @media (max-width: 1200px) {
        padding: 0 5vw;
      }
    }
  }
}

// 音量控制
.slider-content {
  background-color: var(--n-color);
  padding: 12px 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;

  .slider-num {
    margin-top: 4px;
    font-size: 12px;
  }
}

.lyric-scroll-enter-active,
.lyric-scroll-leave-active {
  transition: all 0.4s cubic-bezier(0.55, 0, 0.1, 1);
}

.lyric-scroll-leave-to {
  // opacity: 0;
  transform: translateY(-100%);
}

.lyric-scroll-enter-from {
  // opacity: 0;
  transform: translateY(100%);
}

.lyric-scroll-leave-active {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  white-space: nowrap;
}
</style>