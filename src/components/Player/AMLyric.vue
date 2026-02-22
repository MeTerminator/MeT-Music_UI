<template>
  <Transition>
    <div
      :key="amLyricsData?.[0]?.startTime"
      :class="['lyric-am', { pure: pureLyricMode }]"
      :style="pureLyricMode ? {} : { height: getDynamicHeight() }"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <LyricPlayer
        ref="lyricPlayerRef"
        :lyric-lines="amLyricsData"
        :current-time="Math.max(
          0,
          settings.lyricsAMttmlUseOffset && music.playSongLyric.hasTtml && settings.useAMttmlDB
            ? status.playSeekMs + settings.lyricsAMOffset
            : status.playSeekMs,
        )"
        :playing="playState"
        :enableSpring="settings.useAMSpring"
        :enableScale="settings.useAMScale"
        :alignPosition="settings.lyricsBlock === 'center' ? 0.5 : 0.25"
        :enableBlur="settings.lyricsBlur"
        :style="lyricPlayerStyles"
        class="am-lyric"
        @line-click="jumpSeek"
      />
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { LyricPlayer } from "@applemusic-like-lyrics/vue";
import { musicData, siteSettings, siteStatus } from "@/stores";
import { setSeek, fadePlayOrPause } from "@/utils/Player";
import "@applemusic-like-lyrics/core/style.css";

// 引用状态
const music = musicData();
const settings = siteSettings();
const status = siteStatus();
const { coverTheme, pureLyricMode, playState } = storeToRefs(status);
const { lyricsFontSize, playCoverType } = storeToRefs(settings);

// 歌词播放器引用
const lyricPlayerRef = ref(null);

// 核心修复：引入响应式窗口宽度
const windowWidth = ref(window.innerWidth);

// 窗口尺寸变化的事件处理函数
const handleResize = () => {
  // 只需要更新这个 ref，依赖于它的 computed 属性会自动重新计算
  windowWidth.value = window.innerWidth;
};

// 监听窗口尺寸变化，并清理监听器
onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// 根据屏幕计算字体大小 (依赖 windowWidth)
const getResponsiveFontSize = () => {
  const isMobile = windowWidth.value <= 700;
  if (isMobile) return '6.5vw';
  return `${lyricsFontSize.value}px`;
};

// 动态计算组件高度 (依赖 windowWidth)
const getDynamicHeight = () => {
  const isMobile = windowWidth.value <= 700;
  if (isMobile) return 'calc(100vh - 104px)';
  if (playCoverType.value === 'record') return '70vh';
  if (playCoverType.value === 'cover') {
    return isMobile ? 'calc(100vh - 114px)' : '100vh';
  }
  return '100vh';
};

// 模拟点击用的触摸事件监听
let touchStartX = 0;
let touchStartY = 0;
const touchThreshold = 10; // 触摸位移阈值

const onTouchStart = (e) => {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
};

const onTouchEnd = (e) => {
  const touch = e.changedTouches[0];
  const deltaX = Math.abs(touch.clientX - touchStartX);
  const deltaY = Math.abs(touch.clientY - touchStartY);
  if (deltaX < touchThreshold && deltaY < touchThreshold) {
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && typeof target.click === "function") {
      target.click();
    }
  }
};

// 主色
const mainColor = computed(() => {  
  return `rgba(${coverTheme.value?.light?.shadeTwo}, 0.95)` || '#efefef95';
});

// 样式动态计算 (依赖 getResponsiveFontSize，从而依赖 windowWidth)
const lyricPlayerStyles = computed(() => {
  return {
    '--amll-lp-font-size': getResponsiveFontSize(),
    '--amll-lp-color': mainColor.value,
    'font-family': 'var(--lyrics-font-family)',
    'font-weight': 'var(--lyrics-font-weight)',
  };
});

// 歌词数据
const amLyricsData = computed(() => {
  const isYrc = music.playSongLyric.hasYrc && settings.showYrc;
  const isTtml = music.playSongLyric.hasTtml && settings.useAMttmlDB;
  if (isTtml) return JSON.parse(JSON.stringify(music.playSongLyric.ttml));

  let lyricData = isYrc ? music.playSongLyric.yrcAM : music.playSongLyric.lrcAM;
  lyricData = lyricData.map(item => ({
    ...item,
    endTime: item.endTime - settings.lyricsAMEndTimeOffset,
  }));
  return JSON.parse(JSON.stringify(lyricData));
});

// 跳转播放进度
const jumpSeek = (line) => {
  const timeMs = line?.line?.lyricLine?.startTime;
  if (!timeMs) return;

  const lyricPlayer = lyricPlayerRef.value?.lyricPlayer;
  if (!lyricPlayer) return;

  // 设置音频播放进度
  setSeek(timeMs / 1000);

  // 设置歌词进度、重置滚动状态并刷新画面
  lyricPlayer.setCurrentTime(timeMs, true);
  lyricPlayer.resetScroll();
  lyricPlayer.calcLayout(true, true); // 强制重新布局
  lyricPlayer.update();

  fadePlayOrPause();
};
</script>

<style lang="scss" scoped>
.lyric-am {
  pointer-events: auto !important;
  position: relative;
  width: 98%;
  overflow: hidden;
  mix-blend-mode: plus-lighter;
  filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2));

  mask: linear-gradient(
    180deg,
    hsla(0, 0%, 100%, 0) 0,
    hsla(0, 0%, 100%, 0.6) 5%,
    #fff 10%,
    #fff 75%,
    hsla(0, 0%, 100%, 0.6) 85%,
    hsla(0, 0%, 100%, 0)
  );

  :deep(.am-lyric) {
    width: 100%;
    height: 100%;
    position: absolute;
    left: 0;
    top: 0;
  }

  &.pure {
    height: calc(100vh - 215px); // 纯歌词模式下特殊高度
    :deep(.am-lyric) {
      margin: 0;
      padding: 0;
    }
  }

  // 移动端特殊高度处理
  @media (max-width: 700px) {
    height: calc(100vh - 215px);
    width: 95%;
  }

  // 桌面端纯歌词居中
  @media (min-width: 700px) {
    &.pure {
      height: calc(100vh - 215px);
      width: 80%;
    }
  }
}
</style>