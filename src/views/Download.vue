<template>
  <div class="main-container">
    <n-grid :cols="24" :y-gap="24" item-responsive responsive="screen">
      <n-gi span="24">
        <n-space vertical size="large">
          <n-h2 prefix="bar" align-text>
            <n-text type="primary">歌曲</n-text>
          </n-h2>

          <n-card segmented size="huge">
            <template #header>
              <div class="card-header-custom">
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <div class="cover-wrapper" @click="downloadCover">
                      <n-image v-if="musicInfo.cover" :src="musicInfo.cover" height="64px" width="64px" preview-disabled
                        class="song-cover" />
                      <div v-else class="cover-placeholder">
                        <i class="ri-image-line"></i>
                      </div>
                    </div>
                  </template>
                  点击下载封面
                </n-tooltip>
                <div class="title-info">
                  <div class="title-text">
                    {{ musicInfo.name || '正在解析...' }}
                  </div>
                  <div class="artist-album-text" v-if="rawTrackInfo">
                    <div class="artist-line-mini">
                      <n-icon size="14" depth="3">
                        <SvgIcon icon="account-music" />
                      </n-icon>
                      <template v-for="(ar, index) in rawTrackInfo.singer" :key="ar.mid">
                        <n-text depth="3" class="clickable-text" @click="router.push(`/artist?id=${ar.mid}`)">
                          {{ ar.name }}
                        </n-text>
                        <n-text v-if="index < (rawTrackInfo.singer.length - 1)" depth="3">/</n-text>
                      </template>
                    </div>
                    <div class="album-line-mini">
                      <n-icon size="14" depth="3">
                        <SvgIcon icon="album" />
                      </n-icon>
                      <n-text depth="3" class="clickable-text"
                        @click="router.push(`/album?id=${rawTrackInfo.album.mid}`)">
                        {{ rawTrackInfo.album.name }}
                      </n-text>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <n-space vertical size="medium">
              <n-statistic label="解析音质">
                <n-text type="info" strong>{{ currentLevelLabel }}</n-text>
                <n-space v-if="musicInfo.url">
                  <n-tag v-if="tags[0]" type="warning" size="small" round :bordered="false">{{ tags[0] }}</n-tag>
                  <n-tag v-if="tags[1]" type="success" size="small" round :bordered="false">{{ tags[1] }}</n-tag>
                </n-space>
              </n-statistic>
              <n-button type="primary" block size="large" :loading="isDownloading" :disabled="!musicInfo.url"
                @click="downloadFile">
                <template #icon><i class="ri-download-cloud-2-line"></i></template>
                {{ isDownloading ? `正在下载 ${progressText}` : '立即下载歌曲文件' }}
              </n-button>
              <n-space vertical size="small">
                <n-button tertiary block size="large" @click="handleViewInfo">
                  <template #icon><i class="ri-information-line"></i></template>
                  查看单曲信息
                </n-button>
              </n-space>
              <n-collapse-transition :show="isDownloading || downloadStatus !== 'idle'">
                <n-progress type="line" :percentage="progressPercent" :status="progressStatus"
                  indicator-placement="inside" processing />
              </n-collapse-transition>
            </n-space>
          </n-card>

          <n-card title="音质选择" size="small">
            <n-select v-model:value="currentQuality" :options="qualityOptions" placeholder="请选择音质"
              @update:value="handleQualityChange" />
          </n-card>

          <n-alert title="音质说明" type="info">{{ SONG_LEVEL_DATA[currentQuality]?.tip || '暂无说明' }}</n-alert>
        </n-space>
      </n-gi>

      <n-gi span="24">
        <n-space vertical size="large">
          <n-h2 prefix="bar" align-text>
            <n-text type="primary">歌词</n-text>
          </n-h2>

          <n-card size="huge" segmented>
            <n-tabs v-model:value="activeLyricTab" type="line" animated>
              <n-tab-pane v-for="item in lyricList" :key="item.type" :name="item.type" :tab="item.label">
                <div class="lyric-preview">
                  <pre>{{ item.content }}</pre>
                </div>
                <n-space justify="end" style="margin-top: 16px">
                  <n-button secondary size="small" @click="copyLyric(item.content)">
                    复制内容
                  </n-button>
                  <n-button type="primary" size="small" @click="downloadLyric(item)">
                    下载 .{{ item.ext }}
                  </n-button>
                </n-space>
              </n-tab-pane>
              <template #empty>
                <n-empty description="未找到可用的歌词文件" />
              </template>
            </n-tabs>
          </n-card>
        </n-space>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getMusicUrl } from '@/api/extra';
import { getSongLyric, getAMttmlLyric } from "@/api/song";
import { parseLyric } from "@/utils/parseLyric";
import { copyData } from "@/utils/helper";
import SvgIcon from "@/components/Global/SvgIcon";

const route = useRoute();
const router = useRouter();

// 状态
const mid = ref(route.query.mid);
const currentQuality = ref(route.query.music_quality?.toUpperCase() || 'SQ');
const lyricList = ref([]); // 存储解析后的歌词数组
const isDownloading = ref(false);
const downloadStatus = ref('idle');
const progressPercent = ref(0);
const progressText = ref('0%');
const activeLyricTab = ref(null);
const rawTrackInfo = ref(null);

const musicInfo = reactive({
  url: '',
  name: '',
  filename: '',
  extension: '',
  rawTags: [],
  cover: '',
  coverFilename: ''
});

// 常量
const SONG_LEVEL_DATA = {
  "NAC": { label: "NAC 品质", tip: "最高76kbps 自研AICodec编码" },
  "WEB": { label: "普通 WEB", tip: "在线流媒体音质" },
  "HQ": { label: "极高 HQ", tip: "最高 320kbps" },
  "SQ": { label: "无损 SQ", tip: "高保真无损音质" },
  "RS": { label: "高分辨率音源 Hi-Res", tip: "高于 44.1kHz/16bit" },
  "DTS": { label: "杜比 5.1 声道", tip: "环绕声体验" },
  "Q360V1": { label: "臻品全景声 V1", tip: "独家自研空间音频" },
  "Q360V2": { label: "臻品全景声 V2", tip: "多声道空间音频" },
  "QAI": { label: "臻品母带", tip: "AI 还原极致细节" },
  "DTSX": { label: "DTS:X", tip: "三维感音效" },
  "RA360": { label: "360 Reality Audio", tip: "球形空间音频" },
  "DA": { label: "杜比全景声 Dolby Atmos", tip: "自然真实的环绕音效" },
};

const TAG_MAP = {
  "TL01": "NAC 品质", "C400": "WEB 普通", "M500": "NQ 标准5",
  "O400": "NQ 标准4", "O600": "NQ 标准6", "O800": "HQ 高品OGG",
  "M800": "HQ 高品MP3", "F000": "SQ 无损", "RS01": "Hi-Res"
};

// 计算属性
const qualityOptions = computed(() => Object.keys(SONG_LEVEL_DATA).map(key => ({
  label: SONG_LEVEL_DATA[key].label,
  value: key
})));

const currentLevelLabel = computed(() => SONG_LEVEL_DATA[currentQuality.value]?.label || '未知');

const progressStatus = computed(() => {
  if (downloadStatus.value === 'completed') return 'success';
  if (downloadStatus.value === 'failed') return 'error';
  return 'info';
});

const tags = computed(() => {
  if (!musicInfo.url) return [];
  const tag0 = TAG_MAP[musicInfo.rawTags[0]] || "未知";
  const tag1 = musicInfo.extension.toUpperCase();
  return [tag0, tag1];
});

// 业务逻辑：获取歌词并解析
const fetchLyrics = async () => {
  if (!mid.value) return;
  try {
    const [lrcRes, ttmlRes] = await Promise.all([
      getSongLyric(mid.value),
      getAMttmlLyric(mid.value)
    ]);
    const result = await parseLyric(lrcRes, ttmlRes);

    const lyrics = [];
    const res = result?.lyricResponse;
    const ttml = result?.ttmlLyricResponse;

    if (res?.qrc) lyrics.push({ label: 'QRC 歌词', content: res.qrc, type: 'qrc', ext: 'qrc' });
    if (res?.qrctrans) lyrics.push({ label: 'QRC 翻译', content: res.qrctrans, type: 'qrctrans', ext: 'lrc' });
    if (res?.qrcroma) lyrics.push({ label: 'QRC 音译', content: res.qrcroma, type: 'roma', ext: 'qrc' });
    if (res?.lrc) lyrics.push({ label: 'LRC 歌词', content: res.lrc, type: 'lrc', ext: 'lrc' });
    if (res?.lrctrans) lyrics.push({ label: 'LRC 翻译', content: res.lrctrans, type: 'lrctrans', ext: 'lrc' });

    if (ttml?.status === 'success' && ttml.content) {
      lyrics.push({ label: 'TTML 歌词', content: ttml.content, type: 'ttml', ext: 'ttml' });
    }
    lyricList.value = lyrics;

    if (lyrics.length > 0) {
      activeLyricTab.value = lyrics[0].type;
    } else {
      activeLyricTab.value = null;
    }
  } catch (err) {
    console.error('歌词加载失败:', err);
  }
};

const fetchMusicUrl = async () => {
  if (!mid.value) return;
  try {
    const res = await getMusicUrl(mid.value, currentQuality.value);
    const data = res.data || res;
    const track = data[0]?.track_info;
    rawTrackInfo.value = track;

    if (track && track.file_url) {
      musicInfo.url = track.file_url.replace("http://", "https://");
      musicInfo.name = track.name;
      const singers = track.singer.map(s => s.name).join('_');
      const path = new URL(musicInfo.url).pathname;
      musicInfo.extension = path.split('.').pop().toLowerCase();
      musicInfo.filename = `${track.name} - ${singers}.${musicInfo.extension}`;
      musicInfo.rawTags = [path.substring(1, 5)];

      const pmid = track?.album?.pmid || "";
      if (pmid) {
        musicInfo.cover = `/api/web/album/cover/highpic?pic=T002R800x800M000${pmid}.jpg`;
        musicInfo.coverFilename = `${track.name} - ${singers}.jpg`;
      }
    } else {
      musicInfo.name = "暂无信息";
      musicInfo.filename = "该音质暂无可下载链接";
      musicInfo.url = "";
    }
  } catch (err) {
    musicInfo.filename = "网络请求错误";
  }
};

const handleQualityChange = (key) => {
  currentQuality.value = key;
  router.push({ query: { ...route.query, music_quality: key } });
};

const copyLyric = (content) => {
  copyData(content, "歌词复制成功");
};

const downloadLyric = (item) => {
  try {
    const blob = new Blob([item.content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const songBaseName = musicInfo.filename ? musicInfo.filename.replace(/\.[^/.]+$/, "") : "lyric";
    link.href = url;
    link.setAttribute('download', `${songBaseName}.${item.ext}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    $message.success(`${item.label} 下载成功`);
  } catch (e) {
    $message.error("下载失败");
  }
};

const downloadFile = async () => {
  if (!musicInfo.url || isDownloading.value) return;
  isDownloading.value = true;
  downloadStatus.value = 'downloading';
  try {
    const response = await fetch(musicInfo.url);
    if (!response.ok) throw new Error('Download failed');
    const contentLength = response.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total) {
        progressPercent.value = Math.round((loaded * 100) / total);
        progressText.value = progressPercent.value + '%';
      }
    }
    const blob = new Blob(chunks);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', musicInfo.filename);
    link.click();
    window.URL.revokeObjectURL(url);
    downloadStatus.value = 'completed';
    $message.success(`歌曲文件 ${musicInfo.filename} 下载成功`);
  } catch (error) {
    downloadStatus.value = 'failed';
    console.error('歌曲下载失败:', error);
    $message.error(`歌曲文件 ${musicInfo.filename} 下载失败`);
  } finally {
    isDownloading.value = false;
  }
};



const handleViewInfo = () => {
  router.push({
    path: '/song',
    query: { mid: mid.value }
  });
};

const downloadCover = async () => {
  if (!musicInfo.cover) return;
  try {
    const response = await fetch(musicInfo.cover);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', musicInfo.coverFilename || 'cover.jpg');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    $message.success("封面保存成功");
  } catch (e) {
    $message.error("封面保存失败");
  }
};

onMounted(() => {
  fetchMusicUrl();
  fetchLyrics();
});

watch(() => route.query.music_quality, fetchMusicUrl);
watch(() => route.query.mid, () => {
  mid.value = route.query.mid;
  fetchMusicUrl();
  fetchLyrics();
});
</script>

<style scoped>
.main-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.lyric-preview {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  height: 300px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.lyric-preview pre {
  margin: 0;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #adadad;
}

.card-header-custom {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cover-wrapper {
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  flex-shrink: 0;
}

.cover-wrapper:hover {
  transform: scale(1.05);
}

.song-cover {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: block;
}

.cover-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #666;
}

.title-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  width: 0;
  overflow: hidden;
}

.artist-album-text {
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0.8;
}

.artist-line-mini,
.album-line-mini {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clickable-text {
  cursor: pointer;
  transition: opacity 0.3s;
}

.clickable-text:hover {
  opacity: 0.6;
}

.title-text {
  font-size: 18px;
  font-weight: bold;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 600px) {
  .main-container {
    padding: 12px;
  }

  .card-header-custom {
    gap: 12px;
  }

  .title-text {
    font-size: 16px;
  }

  .artist-album-text {
    font-size: 12px;
  }

  .lyric-preview {
    height: 240px;
  }

  :deep(.n-card-header) {
    padding: 16px !important;
  }

  :deep(.n-card__content) {
    padding: 16px !important;
  }
}
</style>