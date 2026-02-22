<template>
  <div class="music-comments-view" style="max-width: 900px; margin: 0 auto; padding: 20px">
    <n-card :bordered="false" size="huge">
      <n-skeleton v-if="loading.song" text :repeat="3" />
      <n-space v-else vertical size="small">
        <n-h1 style="margin: 0 0 10px 0">{{ songInfo.title }}</n-h1>
        <div>
          <n-text depth="3">
            <n-icon :component="MicIcon" /> 歌手：{{ songInfo.singers }}
          </n-text>
        </div>
        <div>
          <n-text depth="3">
            <n-icon :component="DiscIcon" /> 专辑：{{ songInfo.album }}
          </n-text>
        </div>
      </n-space>
    </n-card>

    <n-divider />

    <n-h2 prefix="bar"> 歌曲评论 (第 {{ pageNum }} 页) </n-h2>

    <n-spin :show="loading.comments">
      <n-empty v-if="comments.length === 0 && !loading.comments" description="暂无评论" />

      <n-list v-else hoverable>
        <n-list-item v-for="comment in comments" :key="comment.SeqNo"
          style="align-items: flex-start; padding-top: 20px">
          <template #prefix>
            <n-avatar round size="large" :src="comment.Avatar || ''" />
          </template>

          <n-thing :title="comment.Nick">
            <template #header-extra>
              <n-space align="center">
                <n-image v-if="comment.VipIcon" width="40" :src="comment.VipIcon" preview-disabled />
                <n-text depth="3" style="font-size: 12px">
                  <n-icon :component="LocationIcon" /> {{ comment.Location || '未知' }}
                </n-text>
              </n-space>
            </template>

            <div style="white-space: pre-wrap; margin: 10px 0; line-height: 1.6">
              {{ comment.Content }}
            </div>

            <n-image v-if="comment.Pic" width="200" :src="comment.Pic" style="border-radius: 8px" />

            <template #footer>
              <n-space justify="space-between" align="center">
                <n-text depth="3" style="font-size: 12px">
                  <n-icon :component="TimeIcon" /> {{ formatTime(comment.PubTime) }}
                </n-text>
                <n-button quaternary circle size="small" disabled style="opacity: 0.8">
                  <template #icon><n-icon :component="LikeIcon" /></template>
                  {{ comment.PraiseNum }}
                </n-button>
              </n-space>
            </template>

            <div v-if="comment.SubComments?.length"
              style="margin-top: 12px; padding: 12px; border-radius: 4px; border: 1px solid #666;">
              <div v-for="(sub, idx) in comment.SubComments" :key="idx" style="margin-bottom: 8px">
                <n-text strong>{{ sub.Nick }}</n-text>
                <n-text>{{ sub.Content }}</n-text>
                <n-space align="center" style="display: inline-flex; margin-left: 10px">
                  <n-icon :component="sub.AuthorPraise ? HeartIcon : LikeIcon"
                    :color="sub.AuthorPraise ? '#d03050' : '#999'" />
                  <n-text depth="3" style="font-size: 12px">{{ sub.PraiseNum }}</n-text>
                </n-space>
              </div>
            </div>
          </n-thing>
        </n-list-item>
      </n-list>
    </n-spin>

    <n-space justify="center" style="margin-top: 30px; padding-bottom: 40px">
      <n-button :disabled="pageNum <= 1 || loading.comments" @click="handlePrevPage">上一页</n-button>
      <n-text align="center" style="line-height: 34px; min-width: 80px">第 {{ pageNum }} 页</n-text>
      <n-button :disabled="comments.length < pageSize || loading.comments" @click="handleNextPage">下一页</n-button>
    </n-space>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { getMusicInfo, getComments } from '../api/extra';
import {
  MicOutline as MicIcon,
  DiscOutline as DiscIcon,
  LocationOutline as LocationIcon,
  TimeOutline as TimeIcon,
  ThumbsUpOutline as LikeIcon,
  Heart as HeartIcon
} from '@vicons/ionicons5';

const route = useRoute();
const mid = route.query.mid;

// 状态
const pageNum = ref(1);
const pageSize = 25;
const loading = reactive({ song: true, comments: true });
const comments = ref([]);
const songInfo = reactive({ title: '', album: '', singers: '', id: 0 });

// 分页游标栈（用于回到上一页）
const seqNoStack = ref(['']); // index 0 是第一页的空游标

// 格式化时间
const formatTime = (ts) => {
  const date = new Date(ts * 1000);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
};

// 获取歌曲信息
const fetchSongInfo = async () => {
  try {
    loading.song = true;
    const res = await getMusicInfo(mid);
    
    // 1. 安全获取 mid 对应的数据块
    const songDataBlock = res[mid];

    if (songDataBlock && songDataBlock.track_info) {
      const track = songDataBlock.track_info;

      // 2. 映射数据到状态变量
      songInfo.title = track.title || '未知标题';
      songInfo.album = track.album?.title || '未知专辑';

      // 3. 处理歌手数组
      if (Array.isArray(track.singer)) {
        songInfo.singers = track.singer.map(s => s.name || s.title).join(' / ');
      } else {
        songInfo.singers = '未知歌手';
      }

      songInfo.id = track.id;
      return track.id; 
    } else {
      console.error("API 返回格式不匹配或未找到歌曲:", res);
      return null;
    }
  } catch (err) {
    console.error("Fetch song info error:", err);
    return null;
  } finally {
    loading.song = false;
  }
};

// 获取评论
const fetchComments = async (songId, cursor = '') => {
  if (!songId) return; // 安全检查
  
  try {
    loading.comments = true;
    const res = await getComments(songId, pageNum.value, pageSize, cursor);
    
    if (res.code === 0) {
      comments.value = res.req.data.CommentList.Comments || [];
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    console.error("Fetch comments error", err);
  } finally {
    loading.comments = false;
  }
};

// 下一页
const handleNextPage = () => {
  const lastSeqNo = comments.value[comments.value.length - 1]?.SeqNo;
  if (lastSeqNo) {
    seqNoStack.value.push(lastSeqNo); // 记录当前页末尾作为下一页的起点
    pageNum.value++;
    fetchComments(songInfo.id, lastSeqNo);
  }
};

// 上一页
const handlePrevPage = () => {
  if (pageNum.value > 1) {
    seqNoStack.value.pop(); // 弹出当前页起点
    pageNum.value--;
    const prevCursor = seqNoStack.value[seqNoStack.value.length - 1]; // 获取上一页的起点
    fetchComments(songInfo.id, prevCursor);
  }
};

onMounted(async () => {
  const songId = await fetchSongInfo();
  if (songId) {
    fetchComments(songId);
  }
});
</script>