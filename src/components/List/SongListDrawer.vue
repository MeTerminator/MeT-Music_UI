<!-- 歌曲列表 - 移动端菜单 -->
<template>
  <n-drawer
    v-model:show="drawerShow"
    :auto-focus="false"
    height="calc(100vh - 200px)"
    placement="bottom"
    class="song-list-drawer"
    @after-leave="drawerShow = false"
    @mask-click="drawerShow = false"
  >
    <n-drawer-content :native-scrollbar="false" :body-content-style="{ padding: 0 }" closable>
      <template #header>
        <div v-if="!songData?.path" class="song-data">
          <n-image
            :src="songData?.coverSize?.s || songData?.cover"
            class="cover"
            preview-disabled
          />
          <div class="song-detail">
            <n-text class="name">{{ songData?.name || "未知曲目" }}</n-text>
            <template v-if="songType === 'song'">
              <div v-if="songData?.artists && Array.isArray(songData.artists)" class="all-ar">
                <n-text v-for="ar in songData.artists" :key="ar.id" class="ar" depth="3">
                  {{ ar.name }}
                </n-text>
              </div>
              <div v-else class="all-ar">
                <n-text class="ar" depth="3">
                  {{ songData.artists || "未知艺术家" }}
                </n-text>
              </div>
            </template>
            <n-text v-else class="ar">
              {{ songData?.artists || "未知艺术家" }}
            </n-text>
          </div>
        </div>
        <n-text v-else>更多操作</n-text>
      </template>
      <div class="all-menu">
        <div
          class="menu-item"
          @click="
            () => {
              drawerShow = false;
              emit('playSong', playlistData, songData, songIndex);
            }
          "
        >
          <n-icon size="22">
            <SvgIcon icon="play" />
          </n-icon>
          <n-text class="name"> 立即播放 </n-text>
        </div>
        <div
          v-if="isSong && music.getPlaySongData?.id !== songData.id"
          class="menu-item"
          @click="
            () => {
              drawerShow = false;
              playMode = 'normal';
              addSongToNext(songData);
            }
          "
        >
          <n-icon size="22">
            <SvgIcon icon="play-next" />
          </n-icon>
          <n-text class="name"> 下一首播放 </n-text>
        </div>
        <div
          v-if="isSong && !isLocalSong"
          class="menu-item"
          @click="
            () => {
              drawerShow = false;
              router.push(`/comments?mid=${songData.id}`);
            }
          "
        >
          <n-icon size="20">
            <SvgIcon icon="comment-text" />
          </n-icon>
          <n-text class="name"> 查看评论 </n-text>
        </div>
        <div
          v-if="isSong && isHasMv"
          class="menu-item"
          @click="
            () => {
              drawerShow = false;
              router.push({
                path: '/videos-player',
                query: {
                  id: songData.mv,
                },
              });
            }
          "
        >
          <n-icon size="22">
            <SvgIcon icon="video" />
          </n-icon>
          <n-text class="name"> 观看 MV </n-text>
        </div>
        <div
          v-if="isSong && !isLocalSong"
          class="menu-item"
          @click="
            () => {
              drawerShow = false;
              UrlDownloadSong(songData)
            }
          "
        >
          <n-icon size="22">
            <SvgIcon icon="download" />
          </n-icon>
          <n-text class="name"> 下载歌曲 </n-text>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { addSongToNext } from "@/utils/Player";
import { musicData, siteStatus, siteSettings } from "@/stores";

const router = useRouter();
const music = musicData();
const status = siteStatus();
const settings = siteSettings();
const { playMode } = storeToRefs(status);
const emit = defineEmits(["playSong"]);


// 菜单数据
const drawerShow = ref(false);
const songType = ref("song");
const songData = ref(null);
const songIndex = ref(null);
const songSourceId = ref(null);
const playlistData = ref(null);

// 歌曲状态
const isSong = computed(() => songType.value === "song");
const isLocalSong = computed(() => !!songData.value?.path);
const isHasMv = computed(() => !!songData.value?.mv && songData.value.mv !== 0);

// 下载歌曲 MeT
const UrlDownloadSong = (song) => {
  const mid = song.id;
  const music_quality = settings.songLevel;
  router.push(`/download?mid=${mid}&music_quality=${music_quality}`);
}

// 开启菜单
const drawerOpen = (data, song, index, sourceId, type) => {
  console.log(song, type);
  drawerShow.value = true;
  songData.value = song;
  songType.value = type;
  songIndex.value = index;
  songSourceId.value = sourceId;
  playlistData.value = data;
};

defineExpose({
  drawerOpen,
});
</script>

<style lang="scss" scoped>
.song-data {
  display: flex;
  flex-direction: row;
  align-items: center;
  .cover {
    margin-right: 12px;
    width: 50px;
    height: 50px;
    border-radius: 8px;
  }
  .song-detail {
    .name {
      font-size: 16px;
      margin-bottom: 8px;
    }
    .all-ar {
      margin-top: 4px;
      font-size: 13px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
      .ar {
        display: inline-flex;
        &::after {
          content: "/";
          margin: 0 4px;
        }
        &:last-child {
          &::after {
            display: none;
          }
        }
      }
    }
  }
}
.all-menu {
  .menu-item {
    padding: 12px 24px;
    display: flex;
    align-items: center;
    flex-direction: row;
    transition: background-color 0.3s;
    cursor: pointer;
    .n-icon {
      margin-right: 8px;
    }
    .name {
      transform: translateY(1px);
      display: flex;
      flex-direction: row;
    }
    &:hover {
      background-color: var(--n-close-color-hover);
    }
  }
}
</style>

<style lang="scss">
.song-list-drawer {
  border-radius: 8px 8px 0 0;
}
</style>
