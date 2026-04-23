<template>
  <div class="song-detail-container">
    <div class="content-overlay">
      <div v-if="loading" class="loading-container">
        <n-skeleton text :repeat="2" /> <br />
        <n-skeleton height="400px" width="100%" />
      </div>
      <n-result v-else-if="!songData" status="404" title="未找到歌曲信息" description="该歌曲可能已下架或链接失效">
        <template #footer>
          <n-button @click="router.back()">返回上一页</n-button>
        </template>
      </n-result>
      <n-card v-else :bordered="false" class="main-card">
        <n-grid :cols="24" :y-gap="24" item-responsive responsive="screen">
          <!-- 左侧：封面与基本操作 -->
          <n-gi span="24 m:10 l:8">
            <div class="cover-section">
              <n-image v-if="songData?.track_info?.album?.pmid" :src="getCoverUrl(songData.track_info.album.pmid)"
                class="main-cover" fallback-src="/images/pic/song.jpg" show-toolbar-tooltip />
              <div v-else class="cover-placeholder">
                <i class="ri-music-2-line"></i>
              </div>

              <div class="action-buttons">
                <n-button type="primary" size="large" round block @click="handlePlay" class="center-btn">
                  <template #icon><i class="ri-play-fill"></i></template>
                  立即播放
                </n-button>
                <n-button secondary size="large" round block @click="handleDownload" class="center-btn">
                  <template #icon><i class="ri-download-2-line"></i></template>
                  下载歌曲
                </n-button>
                <n-button v-if="songData?.track_info?.mv?.vid" tertiary type="warning" size="large" round block @click="goToMV" class="center-btn">
                  <template #icon><i class="ri-movie-line"></i></template>
                  观看 MV
                </n-button>
                <n-button quaternary size="large" round block @click="handleViewComments" class="center-btn">
                  <template #icon><i class="ri-chat-3-line"></i></template>
                  查看评论
                </n-button>
              </div>
            </div>
          </n-gi>

          <!-- 右侧：详细信息 -->
          <n-gi span="24 m:14 l:16">
            <div class="info-section">
              <div class="song-header">
                <n-h1 class="song-title">
                  {{ songData?.track_info?.name || '未知曲目' }}
                  <n-text v-if="songData?.extras?.transname" depth="3" class="trans-name">
                    ({{ songData.extras.transname }})
                  </n-text>
                </n-h1>

                <div class="artist-album">
                  <div class="artist-line">
                    <n-icon size="20" depth="3">
                      <SvgIcon icon="account-music" />
                    </n-icon>
                    <n-space size="small" align="center">
                      <template v-for="(ar, index) in songData?.track_info?.singer" :key="ar.id">
                        <n-text depth="2" class="clickable" @click="router.push(`/artist?id=${ar.mid}`)">
                          {{ ar.name }}
                        </n-text>
                        <n-text v-if="index < (songData?.track_info?.singer?.length - 1)" depth="3">/</n-text>
                      </template>
                    </n-space>
                  </div>
                  <div class="album-line">
                    <n-icon size="20" depth="3">
                      <SvgIcon icon="album" />
                    </n-icon>
                    <n-text depth="2" class="clickable" @click="goToAlbum">
                      {{ songData?.track_info?.album?.name || '未知专辑' }}
                    </n-text>
                  </div>
                </div>
              </div>

              <n-divider />

              <div class="details-grid">
                <div v-for="(item, key) in displayInfo" :key="key" class="detail-item">
                  <div class="detail-label">{{ item.title }}</div>
                  <div class="detail-value" v-if="Array.isArray(item.content)">
                    <template v-for="(tag, index) in item.content" :key="tag.id">
                      <span>{{ tag.value }}</span>
                      <span v-if="index < item.content.length - 1" class="separator">/</span>
                    </template>
                  </div>
                  <div class="detail-value pre-wrap-text" v-else>{{ item.value || '暂无数据' }}</div>
                </div>
              </div>
            </div>
          </n-gi>
        </n-grid>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getMusicUrl } from '@/api/extra';
import { addSongToNext, initPlayer } from '@/utils/Player';
import { musicData } from '@/stores';
import { getSongPlayTime } from '@/utils/timeTools';
import SvgIcon from '@/components/Global/SvgIcon';

const route = useRoute();
const router = useRouter();
const music = musicData();

const mid = ref(route.query.mid);
const songData = ref(null);
const loading = ref(true);

const fetchSongInfo = async () => {
  if (!mid.value) return;
  loading.value = true;
  try {
    const res = await getMusicUrl(mid.value, 'SQ'); // 默认请求 SQ 获取信息
    const data = res.data || res;
    if (data && data[0]) {
      songData.value = data[0];
    }
  } catch (err) {
    console.error('获取歌曲详情失败:', err);
    $message.error('获取歌曲详情失败');
  } finally {
    loading.value = false;
  }
};

const getCoverUrl = (pmid) => {
  return `/api/web/album/cover/highpic?pic=T002R800x800M000${pmid}.jpg`;
};

const singers = computed(() => {
  return songData.value?.track_info?.singer?.map(s => s.name).join(' / ') || '未知歌手';
});

const displayInfo = computed(() => {
  if (!songData.value?.info) return [];
  const info = songData.value.info;
  return Object.keys(info).map(key => ({
    title: info[key].title,
    content: info[key].content,
    value: info[key].content?.[0]?.value
  }));
});

const handlePlay = async () => {
  if (!songData.value) return;
  const track = songData.value.track_info;

  // 构造播放器需要的数据格式 (参考 SongList.vue)
  const song = {
    id: track.mid, // 使用 mid 作为 id
    mid: track.mid,
    name: track.name,
    artists: track.singer.map(s => ({ id: s.mid, mid: s.mid, name: s.name })),
    album: { id: track.album.mid, name: track.album.name },
    duration: getSongPlayTime(track.interval), // 传递格式化的时长
    cover: getCoverUrl(track.album.pmid),
    coverSize: {
      s: `https://y.qq.com/music/photo_new/T002R300x300M000${track.album.pmid}.jpg`,
      m: `https://y.qq.com/music/photo_new/T002R500x500M000${track.album.pmid}.jpg`,
      l: `https://y.qq.com/music/photo_new/T002R800x800M000${track.album.pmid}.jpg`
    }
  };

  addSongToNext(song, true);
  music.playSongData = song;
  await initPlayer(true);
};

const handleDownload = () => {
  router.push({
    path: '/download',
    query: { mid: mid.value }
  });
};

const goToAlbum = () => {
  const albumMid = songData.value?.track_info?.album?.mid;
  if (albumMid) {
    router.push(`/album?id=${albumMid}`);
  }
};

const goToMV = () => {
  const vid = songData.value?.track_info?.mv?.vid;
  if (vid) {
    router.push(`/videos-player?id=${vid}`);
  }
};

const handleViewComments = () => {
  router.push({
    path: '/comments',
    query: { mid: mid.value }
  });
};

onMounted(fetchSongInfo);

watch(() => route.query.mid, (newMid) => {
  mid.value = newMid;
  fetchSongInfo();
});
</script>

<style scoped>
.song-detail-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.main-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(10px);
}

:deep(.n-card__content) {
  overflow: hidden !important;
}

:deep(.n-grid-item) {
  min-width: 0 !important;
  overflow: hidden;
}

.loading-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.cover-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
}

.main-cover {
  width: 80%;
  max-width: 400px;
  aspect-ratio: 1/1;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

:deep(.main-cover .n-image),
:deep(.main-cover img) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
  display: block;
  border-radius: 16px;
}

.cover-placeholder {
  width: 80%;
  max-width: 400px;
  aspect-ratio: 1/1;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80px;
  color: rgba(255, 255, 255, 0.2);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 80%;
  max-width: 400px;
}

.center-btn :deep(.n-button__content) {
  justify-content: center;
  width: 100%;
}

.info-section {
  min-width: 0;
  overflow: hidden;
  word-break: break-word;
}

.song-title {
  margin: 0;
  font-size: 36px;
  font-weight: 800;
  display: flex;
  align-items: baseline;
  gap: 12px;
  word-break: break-word;
}

.trans-name {
  font-size: 20px;
  font-weight: 400;
}

.artist-album {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.artist-line,
.album-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clickable {
  cursor: pointer;
  transition: opacity 0.3s;
}

.clickable:hover {
  opacity: 0.8;
  color: var(--primary-color);
}

.details-grid {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  min-width: 0;
}

.detail-item {
  min-width: 0;
  overflow: hidden;
}

.detail-label {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
  opacity: 0.6;
}

.detail-value {
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: break-word;
}

.separator {
  margin: 0 4px;
  opacity: 0.5;
}

.pre-wrap-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;
  line-height: 1.6;
  opacity: 0.8;
}

@media (max-width: 700px) {
  .song-detail-container {
    padding: 12px;
  }

  .song-title {
    font-size: 22px;
    flex-direction: column;
    gap: 4px;
  }

  .trans-name {
    font-size: 16px;
  }

  .artist-line,
  .album-line {
    font-size: 14px;
  }

  .main-cover {
    width: 60%;
  }

  .cover-placeholder {
    width: 60%;
  }

  .action-buttons {
    width: 100%;
  }

  .detail-label {
    font-size: 14px;
  }

  .detail-value {
    font-size: 13px;
  }
}
</style>
