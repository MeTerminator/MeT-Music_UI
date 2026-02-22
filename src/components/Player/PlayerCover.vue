<template>
  <div 
    :class="[
      'cover', 
      // 核心修改：如果是压缩模式，强制使用 'cover' 类，否则使用传入的 playCoverType
      isCompressed ? 'cover' : playCoverType, 
      { playing: playState, compressed: isCompressed }
    ]"
    :style="{
      borderRadius: isCompressed ? '8px' : (playCoverType === 'record' ? '50%' : '32px'),
    }"
  > 
    <img
      v-if="playCoverType === 'record' && !isCompressed"
      :class="{ pointer: true, play: playState }"
      src="/images/pic/pointer.png?assest"
      alt="pointer"
    />
    <n-image
      :src="
        music.getPlaySongData?.coverSize?.l ||
        music.getPlaySongData?.cover ||
        music.getPlaySongData?.localCover
      "
      :style="{
        animationPlayState: playState ? 'running' : 'paused',
        // 压缩模式下不旋转
        animationName: isCompressed ? 'none' : 'playerCoverRotate',
        borderRadius: isCompressed ? '8px' : (playCoverType === 'record' ? '50%' : '32px'),
        webkitAppRegion: 'drag',
      }"
      class="cover-img"
      preview-disabled
      @load="
        (e) => {
          e.target.style.opacity = 1;
        }
      "
    >
      <template #placeholder>
        <div class="cover-loading">
          <img class="loading-img" src="/images/pic/song.jpg?assest" alt="loading-img" />
        </div>
      </template>
    </n-image>
    <n-image
      v-if="!isCompressed"
      class="cover-shadow"
      preview-disabled
      :src="
        music.getPlaySongData?.coverSize?.l ||
        music.getPlaySongData?.cover ||
        music.getPlaySongData?.localCover
      "
    />
  </div>
</template>

<script setup>
import { storeToRefs } from "pinia";
import { musicData, siteStatus, siteSettings } from "@/stores";

const music = musicData();
const status = siteStatus();
const settings = siteSettings();
const { playCoverType } = storeToRefs(settings);
const { playState } = storeToRefs(status);

// 新增 isCompressed 属性
const props = defineProps({
  isCompressed: {
    type: Boolean,
    default: false,
  },
});
</script>

<style lang="scss" scoped>
.cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 70%;
  max-width: 55vh;
  height: auto;
  aspect-ratio: 1 / 1;
  transition:
    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.3s;
  
  // 压缩模式样式 (主要用于移动端顶部小封面)
  &.compressed {
    width: 100%;
    height: 100%;
    max-width: none;
    aspect-ratio: 1/1;
    
    .cover-img {
      width: 100%;
      height: 100%;
      box-shadow: none;
    }
  }
  
  .cover-img {
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: 1;
    box-shadow: 0 0 10px 6px #00000008;
    transition: opacity 0.1s ease-in-out;
    :deep(img) {
      width: 100%;
      height: 100%;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      object-fit: cover; // 确保图片能填满容器
    }
  }
  .cover-shadow {
    position: absolute;
    top: 12px;
    height: 100%;
    width: 100%;
    filter: blur(20px) opacity(0.6);
    transform: scale(0.95);
    z-index: 0;
    :deep(img) {
      width: 100%;
      height: 100%;
    }
  }

  &.record {
    position: relative;
    width: 50vh;
    .pointer {
      position: absolute;
      width: 14vh;
      left: calc(50% - 1.8vh);
      top: -11.5vh;
      transform: rotate(-20deg);
      transform-origin: 1.8vh 1.8vh;
      z-index: 2;
      transition: transform 0.3s;
    }
    .cover-img {
      animation: playerCoverRotate 30s linear infinite;
      animation-play-state: paused;
      border: 1vh solid #ffffff30;
      background: linear-gradient(black 0%, transparent, black 98%),
        radial-gradient(
          #000 52%,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555,
          #000,
          #555
        );
      background-clip: content-box;
      width: 46vh;
      height: 46vh;
      min-width: 46vh;
      display: flex;
      justify-content: center;
      align-items: center;
      :deep(img) {
        border: 1vh solid #ffffff40;
        width: 70%;
        height: 70%;
        object-fit: cover;
      }
      .cover-loading {
        position: absolute;
        height: 100%;
        padding-bottom: 0;
        .loading-img {
          top: auto;
          left: auto;
        }
      }
    }
  }
  &.cover {
    overflow: hidden;
    transform: scale(0.9);
    &.playing {
      transform: scale(1);
    }
  }
  &.playing {
    .pointer {
      transform: rotate(0);
    }
    .cover-img {
      animation-play-state: running;
    }
  }
  @media (max-width: 700px) {
    &.record {
      .pointer {
        width: 12vh;
        top: -6vh;
      }
      .cover-img {
        width: 40vh;
        height: 40vh;
        min-width: 40vh;
      }
    }
  }
}
</style>