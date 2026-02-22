<template>
  <Transition name="up" mode="out-in">
    <div v-if="showFullPlayer" :style="{
      '--cover-main-color': `rgb(${coverTheme?.light?.shadeTwo})` || '#efefef',
      '--cover-second-color': `rgba(${coverTheme?.light?.shadeTwo}, 0.14)` || '#efefef14',
      '--cover-bg': coverBackground,
      cursor: playerControlShow ? 'auto' : 'none',
    }" class="full-player" @mousemove="controlShowChange" @mouseleave="closePlayerControlShow">
      <Transition name="fade" mode="out-in">
        <div :key="`${playerBackgroundType}-${coverBackground}-${music.getPlaySongData?.coverSize?.s || music.getPlaySongData?.localCover
          }`" :class="['overlay', playerBackgroundType]">
          <template v-if="playerBackgroundType === 'blur'">
            <img class="overlay-img" :src="music.getPlaySongData?.coverSize?.s || music.getPlaySongData?.localCover"
              alt="overlay" />
          </template>
          <template v-else-if="playerBackgroundType === 'animation'">
            <img v-for="item in 4" :key="item"
              :src="music.getPlaySongData?.coverSize?.s || music.getPlaySongData?.localCover" :style="{
                transform: `rotate(${item * 180}deg)`,
              }" class="overlay-img" alt="overlay" />
          </template>
          <template v-else-if="playerBackgroundType === 'amllAnimation'">
            <BackgroundRender :album="AmllAlbum" :albumIsVideo="false" :flowSpeed="settings.amllPlayerBackgroundFlowSpeed"
              style="position: absolute; top: 0; left: 0; width: 100%; height: 100%" />
          </template>
        </div>
      </Transition>
      <Transition name="fade" mode="out-in">
        <div v-show="playerControlShow && !isPortraitMode" class="menu">
          <div class="left">
            <n-icon v-if="isHasLrc" :class="['lrc-open', { open: pureLyricMode }]" size="28"
              @click="pureLyricMode = !pureLyricMode">
              <SvgIcon icon="lrc-text" />
            </n-icon>
          </div>
          <div class="right">
            <n-icon class="hidden" @click.stop="screenfullChange">
              <SvgIcon :icon="screenfullStatus ? 'fullscreen-exit-rounded' : 'fullscreen-rounded'" />
            </n-icon>
            <n-icon v-if="!screenfullStatus" @click.stop="showFullPlayer = false">
              <SvgIcon icon="keyboard-arrow-down-rounded" />
            </n-icon>
          </div>
        </div>
      </Transition>
      <Transition name="fade" mode="out-in">
        <div :key="`${pureLyricMode}-${playCoverType}-${isHasLrc}-${music.getPlaySongData?.id}`" class="main-player">
          <div v-show="!(pureLyricMode && isHasLrc) && !isPortraitMode" :class="['content', { 'no-lrc': !isHasLrc }]">
            <PlayerCover />
            <div v-show="playCoverType === 'cover' || !isHasLrc" :class="['data', playCoverType]">
              <div class="desc">
                <div class="title">
                  <span class="name">{{ music.getPlaySongData.name || "未知曲目" }}</span>
                </div>
                <span v-if="music.getPlaySongData.alia" class="alia">
                  {{ music.getPlaySongData.alia }}
                </span>
                <div class="artist">
                  <n-icon depth="3" size="20">
                    <SvgIcon icon="account-music" />
                  </n-icon>
                  <div v-if="Array.isArray(music.getPlaySongData.artists)" class="all-ar">
                    <span v-for="ar in music.getPlaySongData.artists" :key="ar.id" class="ar" @click.stop="
                      () => {
                        showFullPlayer = false;
                        router.push(`/artist?id=${ar.id}`);
                      }
                    ">
                      {{ ar.name }}
                    </span>
                  </div>
                  <div v-else class="all-ar">
                    <span class="ar"> {{ music.getPlaySongData.artists || "未知艺术家" }} </span>
                  </div>
                </div>
                <div class="album" @click.stop="
                  () => {
                    if (typeof music.getPlaySongData.album !== 'string') {
                      showFullPlayer = false;
                      router.push(`/album?id=${music.getPlaySongData?.album.id}`);
                    }
                  }
                ">
                  <n-icon depth="3" size="20">
                    <SvgIcon icon="album" />
                  </n-icon>
                  <span v-if="music.getPlaySongData.album" class="al">
                    {{
                      typeof music.getPlaySongData.album === "string"
                        ? music.getPlaySongData.album
                        : music.getPlaySongData.album.name
                    }}
                  </span>
                  <span v-else class="album">未知专辑</span>
                </div>
              </div>
            </div>
          </div>
          <div :class="['right', { pure: pureLyricMode && isHasLrc }, { 'no-lrc': !isHasLrc }]">
            <div
              v-show="((pureLyricMode && isHasLrc) || (playCoverType === 'record' && isHasLrc)) && !isPortraitMode"
              class="data desktop-only-data">
              <div class="name">
                <span class="name-text">{{ music.getPlaySongData.name || "未知曲目" }}</span>
                <span v-if="music.getPlaySongData.alia" class="name-alias">
                  {{ music.getPlaySongData.alia }}
                </span>
              </div>
              <div class="other">
                <div class="artist">
                  <n-icon depth="3" size="20">
                    <SvgIcon icon="account-music" />
                  </n-icon>
                  <div v-if="Array.isArray(music.getPlaySongData.artists)" class="all-ar">
                    <span v-for="ar in music.getPlaySongData.artists" :key="ar.id" class="ar" @click.stop="
                      () => {
                        showFullPlayer = false;
                        router.push(`/artist?id=${ar.id}`);
                      }
                    ">
                      {{ ar.name }}
                    </span>
                  </div>
                  <div v-else class="all-ar">
                    <span class="ar"> {{ music.getPlaySongData.artists || "未知艺术家" }} </span>
                  </div>
                </div>
                <div class="album" @click.stop="
                  () => {
                    if (typeof music.getPlaySongData.album !== 'string') {
                      showFullPlayer = false;
                      router.push(`/album?id=${music.getPlaySongData?.album.id}`);
                    }
                  }
                ">
                  <n-icon depth="3" size="20">
                    <SvgIcon icon="album" />
                  </n-icon>
                  <span v-if="music.getPlaySongData.album" class="al">
                    {{
                      typeof music.getPlaySongData.album === "string"
                        ? music.getPlaySongData.album
                        : music.getPlaySongData.album.name
                    }}
                  </span>
                  <span v-else class="album">未知专辑</span>
                </div>
              </div>
            </div>

            <Transition name="fade" mode="out-in">
              <div v-if="isHasLrc && isPortraitMode" class="data mobile-compressed-info">
                <div class="left-cover">
                  <PlayerCover :isCompressed="true" />
                </div>
                <div class="right-text-info">
                  <div class="title">
                    <span class="name">{{ music.getPlaySongData.name || "未知曲目" }}</span>
                  </div>
                  <div v-if="Array.isArray(music.getPlaySongData.artists)" class="artist-info">
                    <n-icon depth="3" size="18" class="info-icon">
                      <SvgIcon icon="account-music" />
                    </n-icon>
                    <span v-for="ar in music.getPlaySongData.artists" :key="ar.id" class="ar" @click.stop="
                      () => {
                        showFullPlayer = false;
                        router.push(`/artist?id=${ar.id}`);
                      }
                    ">
                      {{ ar.name }}
                    </span>
                  </div>
                  <div class="album-info" @click.stop="
                    () => {
                      if (typeof music.getPlaySongData.album !== 'string') {
                        showFullPlayer = false;
                        router.push(`/album?id=${music.getPlaySongData?.album.id}`);
                      }
                    }
                  ">
                    <n-icon depth="3" size="18" class="info-icon">
                      <SvgIcon icon="album" />
                    </n-icon>
                    <span v-if="music.getPlaySongData.album" class="al">
                      {{
                        typeof music.getPlaySongData.album === "string"
                          ? music.getPlaySongData.album
                          : music.getPlaySongData.album.name
                      }}
                    </span>
                    <span v-else class="album">未知专辑</span>
                  </div>
                </div>
                
                <n-icon size="30" class="close-btn" @click.stop="showFullPlayer = false">
                    <SvgIcon icon="keyboard-arrow-down-rounded" />
                </n-icon>
              </div>
            </Transition>
            <AMLyric v-if="useAMLyrics & isHasLrc" />
            <Lyric :cursorShow="playerControlShow" v-else-if="isHasLrc" />
            <div v-else></div>
          </div>
        </div>
      </Transition>
      <PlayerControl />
      <Spectrum v-if="showSpectrums" :show="!playerControlShow" :height="60" />
    </div>
  </Transition>
</template>

<script setup>
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { musicData, siteStatus, siteSettings } from "@/stores";
import { BackgroundRender } from "@applemusic-like-lyrics/vue";
import screenfull from "screenfull";
import throttle from "@/utils/throttle"; 
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';


let wakeLock = null;

const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock was released');
      });
      console.log('Wake Lock is active');
    }
  } catch (err) {
    console.error(`Wake Lock error: ${err.name}, ${err.message}`);
  }
};

const releaseWakeLock = async () => {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (err) {
    console.error(`Wake Lock release error: ${err.name}, ${err.message}`);
  }
};

document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});


const router = useRouter();
const music = musicData();
const status = siteStatus();
const settings = siteSettings();

const { playList, playSongLyric } = storeToRefs(music);
const { playerBackgroundType, showYrc, playCoverType, showSpectrums, useAMLyrics } = storeToRefs(settings);
const {
  playerControlShow,
  controlTimeOut,
  showFullPlayer,
  coverTheme,
  coverBackground,
  pureLyricMode,
} = storeToRefs(status);

const AmllAlbum = computed(() => {
  const coverSrc = music.getPlaySongData?.coverSize?.s || music.getPlaySongData?.localCover
  if (!coverSrc) return "";

  if (coverSrc.startsWith("https://y.qq.com/music/photo_new/")) {
    const cleaned = coverSrc
      .replace("https://y.qq.com/music/photo_new/", "")
      .replace("?param=100y100", "");
    return `/api/web/album/cover/pic?pic=${cleaned}`;
  }

  return coverSrc;
})

// === 窗口尺寸和竖屏判断逻辑 ===
const windowWidth = ref(1920);
const windowHeight = ref(1080);

// 检查是否为竖屏模式 (宽度 <= 700px 且 宽度 < 高度)
const isPortraitMode = computed(() => {
  return windowWidth.value <= 700 && windowWidth.value < windowHeight.value;
});

const updateWindowSize = throttle(() => {
  if (typeof window !== 'undefined') {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
  }
}, 300);

onMounted(() => {
  if (typeof window !== 'undefined') {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
    window.addEventListener('resize', updateWindowSize);
  }
});
// ===================================


// 是否有歌词
const isHasLrc = computed(() => {
  return playSongLyric.value.lrc?.[0] && playSongLyric.value.lrc?.length > 4;
});

// 全屏状态
const screenfullStatus = ref(false);

// 全屏切换
const screenfullChange = () => {
  if (screenfull.isEnabled) {
    screenfull.toggle();
    screenfullStatus.value = screenfull.isFullscreen ? false : true;
  }
};

// 关闭控制中心
const closePlayerControlShow = () => {
  playerControlShow.value = false;
};

// 控制中心显隐
const controlShowChange = throttle(() => {
  playerControlShow.value = true;
  
  if (controlTimeOut.value) {
    clearTimeout(controlTimeOut.value);
  }
  controlTimeOut.value = setTimeout(() => {
    playerControlShow.value = false;
  }, 2000);
}, 300);

// 监听播放器开启和竖屏状态变化
watch(
  () => [showFullPlayer.value, isPortraitMode.value, isHasLrc.value],
  ([isShown, isPortrait, hasLrc]) => {
    if (isShown) {
      requestWakeLock(); 

      if (showYrc.value && playList.value?.length >= 400) {
        // $message.warning("当前播放歌曲数量过多，逐字歌词动画已降低帧数");
      }
    } else {
      releaseWakeLock(); 
    }
  },
  { immediate: true }
);


onUnmounted(() => {
  clearTimeout(controlTimeOut.value);
  releaseWakeLock();
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateWindowSize);
  }
});
</script>

<style lang="scss" scoped>
.full-player {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  color: var(--cover-main-color);
  background-color: #00000060;
  backdrop-filter: blur(80px);
  overflow: hidden;
  z-index: 100;

  // 遮罩
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: -1;

    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: #00000060;
      backdrop-filter: blur(20px);
    }

    &.blur {
      display: flex;
      align-items: center;
      justify-content: center;

      .overlay-img {
        width: 150%;
        height: 150%;
        filter: blur(80px) contrast(1.2);
      }
    }

    &.animation {
      transform: scale(1.3);

      .overlay-img {
        position: absolute;
        width: 50%;
        height: 50%;
        filter: blur(80px) contrast(1.75);

        &:nth-of-type(1) {
          top: 0;
          left: 0;
          animation: coverRotate 62s infinite linear;
        }

        &:nth-of-type(2) {
          left: 0;
          bottom: 0;
          animation: coverRotate 55s infinite linear reverse;
        }

        &:nth-of-type(3) {
          bottom: 50%;
          right: 0;
          animation: coverRotate 58s infinite linear reverse;
        }

        &:nth-of-type(4) {
          bottom: 0;
          right: 0;
          animation: coverRotate 65s infinite linear;
        }
      }
    }

    &.gradient {
      background: var(--cover-bg);
    }
  }

  // 按钮
  .menu {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 80px;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 2;
    box-sizing: border-box;
    -webkit-app-region: no-drag;

    .left,
    .right {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      flex: 1;
    }

    .n-icon {
      margin-left: 12px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      opacity: 0.3;
      border-radius: 8px;
      transition:
        opacity 0.3s,
        transform 0.3s,
        background-color 0.3s;
      cursor: pointer;

      &:hover {
        background-color: #ffffff20;
        transform: scale(1.05);
        opacity: 1;
      }

      &:active {
        transform: scale(1);
      }
    }

    .left {
      justify-content: flex-start;

      .n-icon {
        margin-left: 0;

        &.lrc-open {
          &.open {
            opacity: 0.8;
          }
        }
      }
    }
  }

  .main-player {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    height: 100%;

    // 内容
    .content {
      width: 40%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      transition:
        transform 0.3s,
        opacity 0.3s;

      .data {
        width: 70%;
        max-width: 55vh;
        margin-top: 24px;
        padding: 0 2px;
        box-sizing: border-box;

        .desc {
          display: flex;
          flex-direction: column;

          .title {
            display: flex;
            align-items: center;
            margin-left: 4px;

            .name {
              font-size: 26px;
              font-weight: bold;
              color: var(--cover-main-color);
              -webkit-line-clamp: 2;
            }

            .n-tag {
              margin-left: 12px;
              cursor: pointer;
            }
          }

          .alia {
            margin: 6px 0 6px 2px;
            opacity: 0.6;
            font-size: 18px;
          }

          .artist {
            margin-top: 2px;
            display: flex;
            align-items: center;

            .n-icon {
              margin-right: 4px;
              color: var(--cover-main-color);
            }

            .all-ar {
              display: -webkit-box;
              -webkit-box-orient: vertical;
              -webkit-line-clamp: 2;
              overflow: hidden;
              word-break: break-all;

              .ar {
                font-size: 16px;
                opacity: 0.7;
                display: inline-flex;
                transition: opacity 0.3s;
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
                  opacity: 1;
                }
              }
            }
          }

          .album {
            margin-top: 2px;
            font-size: 16px;
            display: flex;
            align-items: center;

            .n-icon {
              margin-right: 4px;
              color: var(--cover-main-color);
            }

            .al {
              opacity: 0.7;
              transition: opacity 0.3s;
              cursor: pointer;

              &:hover {
                opacity: 1;
              }
            }
          }
        }

        &.record {
          width: 100%;
          margin-top: 20px;

          .desc {
            align-items: center;

            .title {
              .name {
                text-align: center;
              }
            }
          }
        }
      }

      &.no-lrc {
        width: 100%;
      }
    }

    .right {
      width: 60%;
      transition: width 0.3s;

      &.no-lrc {
        display: none;
      }

      .data {
        // 桌面端唱片/纯歌词模式信息
        &.desktop-only-data {
          padding: 0 80px 0 24px;
          margin-bottom: 26px;

          .name {
            display: flex;
            flex-direction: column;
            font-size: 30px;
            font-weight: bold;

            .name-text {
              -webkit-line-clamp: 2;
            }

            .name-alias {
              margin-top: 6px;
              font-size: 18px;
              font-weight: normal;
              opacity: 0.6;
            }
          }

          .other {
            display: flex;
            flex-direction: column;
            margin-top: 8px;
            font-size: 16px;

            .n-icon {
              margin-right: 4px;
              color: var(--cover-main-color);
            }

            .artist {
              display: flex;
              align-items: center;
              margin-right: 12px;

              .all-ar {
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
                overflow: hidden;
                word-break: break-all;

                .ar {
                  opacity: 0.7;
                  display: inline-flex;
                  transition: opacity 0.3s;
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
                    opacity: 1;
                  }
                }
              }
            }

            .album {
              display: flex;
              align-items: center;
              margin-top: 4px;

              .al {
                opacity: 0.7;
                transition: opacity 0.3s;
                cursor: pointer;

                &:hover {
                  opacity: 1;
                }
              }
            }
          }
        }
      }

      &.pure {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;

        .data.desktop-only-data {
          // 桌面端 pure 模式样式
          padding: 0 80px;
          display: flex;
          flex-direction: column;
          align-items: center;

          .other,
          .name {
            align-items: center;
          }
        }
      }
    }
  }

  // 全局
  span {
    display: -webkit-box;
    overflow: hidden;
    word-break: break-all;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  // ============== 移动端样式修改 ==============
  @media (max-width: 700px) {
    .menu {
      .hidden {
        display: none;
      }
    }

    .main-player {
      // 移动端：将内容上移
      align-items: flex-start;
      height: 100%;

      .content {
        width: 100%;

        .data {
          display: block !important;

          &.record {
            margin-top: 0;
          }
        }

        &.no-lrc {
          transform: translateX(0);
        }
      }

      .right {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;


        .data.desktop-only-data {
          display: none;
        }

        // 移动端纯歌词模式下的压缩信息区样式
        .mobile-compressed-info {
          display: flex;
          align-items: center;
          height: 64px;
          margin-top: 30px;
          margin-bottom: 10px;
          width: 100%;
          padding: 0 30px;
          box-sizing: border-box;
          justify-content: space-between; // 允许关闭按钮在右侧

          .left-cover {
            height: 100%;
            min-width: 50px;
            margin-right: 12px;
            flex-shrink: 0;

            :deep(.cover) {
              width: 100%;
              height: 100%;
            }
          }

          .right-text-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0; 
            margin-right: 10px;

            .title {
              display: flex;
              align-items: center;
              margin-left: 0; 

              .name {
                font-size: 20px; 
                font-weight: bold;
                -webkit-line-clamp: 1;
                margin-right: 8px;
              }

              .n-tag {
                margin-left: 0;
                transform: scale(0.8);
                transform-origin: left center;
              }
            }

            .artist-info,
            .album-info {
              display: flex;
              align-items: center;
              font-size: 12px;
              opacity: 0.7;
              margin-top: 2px;

              // 确保 Icon 显示
              .info-icon {
                  margin-right: 4px;
                  color: var(--cover-main-color);
                  opacity: 0.7;
              }

              span {
                -webkit-line-clamp: 1;
              }

              .ar {
                &::after {
                  content: "/";
                  margin: 0 4px;
                  transition: none;
                }

                &:last-child::after {
                  display: none;
                }
              }
            }
          }

          // 新增：关闭按钮样式
          .close-btn {
              width: 40px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              opacity: 0.3;
              transition: opacity 0.3s;
              flex-shrink: 0; 

              &:hover {
                  opacity: 1;
              }
          }
        }

        // 覆盖 .right.pure 的样式，使歌词左对齐
        &.pure {
          display: flex;
          flex-direction: column;
          align-items: center;

          .data.mobile-compressed-info {
            align-self: flex-start;
          }

          :deep(.am-lyric),
          :deep(.lyric-container) {
            padding: 0 20px;
            width: 100%;
            box-sizing: border-box;
            align-items: flex-start;
            text-align: left;
          }
        }
      }
    }
  }
}

// 局外样式
.title-tip {
  width: 200px;
  padding: 12px 20px;
  border-radius: 12px;

  .n-text {
    display: initial;
  }
}
</style>