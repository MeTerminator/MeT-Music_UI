<!-- 全局设置 -->
<template>
  <div :class="{ setting: true, 'use-cover': themeAutoCover }">
    <n-h1 class="title">
      <n-text>全局设置</n-text>
      <div class="copyright">
        <n-text class="version" depth="3">{{ packageJson.version }}</n-text>
      </div>
    </n-h1>
    <!-- 导航栏 -->
    <n-tabs ref="setTabsRef" v-model:value="setTabsValue" type="segment" @update:value="settingTabChange">
      <n-tab name="setTab1"> 常规 </n-tab>
      <n-tab name="setTab2"> 播放 </n-tab>
      <n-tab name="setTab3"> 歌词 </n-tab>
      <n-tab name="setTab4"> 其他 </n-tab>
    </n-tabs>
    <!-- 设置项 -->
    <n-scrollbar ref="setScrollRef" :style="{
      height: `calc(100vh - ${music.getPlaySongData?.id && showPlayBar ? 328 : 248}px)`,
    }" class="all-set" @scroll="allSetScroll">
      <!-- 常规 -->
      <div class="set-type">
        <n-h3 prefix="bar"> 常规 </n-h3>
        <n-card class="set-item">
          <div class="name">明暗模式</div>
          <n-select v-model:value="themeType" :options="[
            {
              label: '浅色模式',
              value: 'light',
            },
            {
              label: '深色模式',
              value: 'dark',
            },
          ]" class="set" @update:value="(themeAuto = false)" />
        </n-card>
        <n-card class="set-item">
          <div class="name">明暗模式是否跟随系统</div>
          <n-switch v-model:value="themeAuto" :round="false" @update:value="
            (val) => {
              if (val) themeType = osThemeRef;
            }
          " />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            开启侧边栏
            <n-text class="tip">将导航栏放于侧边显示，可展开或收起</n-text>
          </div>
          <n-switch v-model:value="showSider" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            侧边栏展示封面
            <n-text class="tip">侧边栏歌单是否展示歌单封面</n-text>
          </div>
          <n-switch v-model:value="siderShowCover" :disabled="!showSider" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">显示搜索历史</div>
          <n-switch v-model:value="showSearchHistory" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            页面字体
            <n-text class="tip">全局界面显示的字体</n-text>
          </div>
          <n-select v-model:value="siteFont" :options="fontOptions" class="set" @update:value="updateSiteFont" />
        </n-card>
        <n-card class="set-item">
          <div class="name">主题选择</div>
          <n-select v-model:value="themeTypeName" :options="Object.values(themeColorData)" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              全局动态取色
              <n-tag :bordered="false" round size="small" type="warning">
                开发中
                <template #icon>
                  <n-icon>
                    <SvgIcon icon="code" />
                  </n-icon>
                </template>
              </n-tag>
            </div>
            <n-text class="tip">主题色是否跟随封面，目前感觉不好看</n-text>
          </div>
          <n-switch v-model:value="themeAutoCover" :round="false" :disabled="Object.keys(coverTheme)?.length === 0"
            @update:value="themeAutoCoverChange" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              全局动态取色类别
              <n-tag :bordered="false" round size="small" type="warning">
                开发中
                <template #icon>
                  <n-icon>
                    <SvgIcon icon="code" />
                  </n-icon>
                </template>
              </n-tag>
            </div>
            <n-text class="tip">将在下一首播放或刷新时生效，不建议更改</n-text>
          </div>
          <n-select v-model:value="themeAutoCoverType" :disabled="!themeAutoCover" :options="[
            {
              label: '中性',
              value: 'neutral',
            },
            {
              label: '中性变体',
              value: 'neutralVariant',
            },
            {
              label: '主要',
              value: 'primary',
            },
            {
              label: '次要',
              value: 'secondary',
            },
            {
              label: '次次要',
              value: 'tertiary',
            },
          ]" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            SessionID
            <n-text class="tip">{{ sessionId }}</n-text>
          </div>
          <n-button strong secondary type="default" @click="copySessionId"> 复制 </n-button>
        </n-card>
      </div>
      <!-- 播放 -->
      <div class="set-type">
        <n-h3 prefix="bar"> 播放 </n-h3>
        <n-card class="set-item">
          <div class="name">
            在线播放音质
            <n-text class="tip">
              {{ songLevelData[songLevel].tip }}
            </n-text>
          </div>
          <n-select v-model:value="songLevel" :options="Object.values(songLevelData)" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            使用 HTML5 播放器
            <n-text class="tip"> 如果开启，则会使用 Audio 标签播放音频，支持动态加载，但在 Safari 浏览器上可能会遇到进度不同步问题；<br>如果关闭，则会使用 Web Audio API 播放音频，播放需缓存整个音频文件，暂停音乐会导致 Media Session 媒体会话被清除，无法恢复播放。<br>切换该开关后最好刷新页面。 </n-text>
          </div>
          <n-switch v-model:value="html5Player" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            静音模拟播放
            <n-text class="tip"> 不请求音乐文件，但是模拟时间轴以显示歌词，以及上报播放数据 </n-text>
          </div>
          <n-switch v-model:value="simulationPlaying" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            自动播放
            <n-text class="tip">自动播放上次歌曲</n-text>
          </div>
          <n-switch v-model:value="autoPlay" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            记忆上次播放位置
            <n-text v-if="autoPlay" class="tip"> 与自动播放相冲突，已禁用 </n-text>
          </div>
          <n-switch v-model:value="memorySeek" :disabled="autoPlay" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            音乐资源自动缓存
            <n-text class="tip"> 可能会造成加载缓慢，将在下一首播放或刷新时生效 </n-text>
          </div>
          <n-switch v-model:value="useMusicCache" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">音乐渐入渐出</div>
          <n-switch v-model:value="songVolumeFade" :round="false" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            一起听歌同步阈值
            <n-text class="tip">本地播放时间与服务器播放时间差值超过该设定时自动同步进度</n-text>
            <n-text class="tip"> {{ listenTogetherSyncThreshold }} ms </n-text>
          </div>
          <n-slider v-model:value="listenTogetherSyncThreshold" :tooltip="false" :max="2000" :min="100" :step="50" :marks="{
            100: '极小',
            300: '默认',
            1000: '1000ms',
            2000: '2000ms',
          }" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            播放全部搜索歌曲
            <n-text class="tip">
              在播放搜索页面上的歌曲时，是否同时播放所有搜索结果中的歌曲
            </n-text>
          </div>
          <n-switch v-model:value="playSearch" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            底栏歌词显示
            <n-text class="tip">是否在播放时将歌手信息更改为歌词</n-text>
          </div>
          <n-switch v-model:value="bottomLyricShow" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">显示播放列表歌曲数量</div>
          <n-switch v-model:value="showPlaylistCount" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            播放器样式
            <n-text class="tip"> 播放器左侧区域样式 </n-text>
          </div>
          <n-select v-model:value="playCoverType" :options="[
            {
              label: '封面模式',
              value: 'cover',
            },
            {
              label: '唱片模式',
              value: 'record',
            },
          ]" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            播放背景样式
            <n-text class="tip">
              {{
                playerBackgroundType === "animation"
                  ? "流体效果，较消耗性能，请谨慎开启"
                  : playerBackgroundType === "blur"
                    ? "将封面模糊处理为背景"
                    : "提取封面主色为渐变色"
              }}
            </n-text>
          </div>
          <n-select v-model:value="playerBackgroundType" :options="[
            {
              label: '流体效果',
              value: 'animation',
            },
            {
              label: '封面模糊',
              value: 'blur',
            },
            {
              label: '主色渐变',
              value: 'gradient',
            },
            {
              label: 'AMLL 流体效果',
              value: 'amllAnimation',
            },
          ]" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            显示前奏倒计时
            <n-text class="tip">部分歌曲前奏可能存在显示错误</n-text>
          </div>
          <n-switch v-model:value="countDownShow" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              显示音乐频谱
              <n-tag :bordered="false" round size="small" type="warning">
                开发中
                <template #icon>
                  <n-icon>
                    <SvgIcon icon="code" />
                  </n-icon>
                </template>
              </n-tag>
            </div>
            <n-text class="tip">
              {{
                showSpectrums
                  ? "开启音乐频谱会极大影响性能，如遇问题请关闭"
                  : "是否在播放器底部显示音乐频谱"
              }}
            </n-text>
          </div>
          <n-switch v-model:value="showSpectrums" :round="false" />
        </n-card>
      </div>
      <!-- 歌词 -->
      <div class="set-type">
        <n-h3 prefix="bar"> 歌词 </n-h3>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            歌词文本大小
            <n-text :style="{ fontSize: lyricsFontSize + 'px', fontWeight: 'bold' }" class="tip">
              我是一句歌词
            </n-text>
          </div>
          <n-slider v-model:value="lyricsFontSize" :tooltip="false" :max="56" :min="36" :step="1" :marks="{
            36: '最小',
            46: '默认',
            56: '最大',
          }" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            歌词显示字体
            <n-text class="tip">播放页展示歌词所使用的字体</n-text>
          </div>
          <n-select v-model:value="lyricFont" :options="fontOptions" class="set" @update:value="updateLyricFont" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            歌词偏转
            <n-text class="tip">使歌词提前切到下一行，用于抵消歌词步进延迟</n-text>
            <n-text class="tip">
              {{ lyricsOffset }} s
            </n-text>
          </div>
          <n-slider v-model:value="lyricsOffset" :tooltip="false" :max="3" :min="0" :step="0.01" :marks="{
            0: '无',
            0.4: '默认',
            3: '最大',
          }" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            Hook 歌词偏转
            <n-text class="tip">window.$MeTMusic_Data 中歌词计算的偏移量，用于桌面歌词等外部场景</n-text>
            <n-text class="tip">
              {{ lyricsHookOffset }} s
            </n-text>
          </div>
          <n-slider v-model:value="lyricsHookOffset" :tooltip="false" :max="3" :min="0" :step="0.01" :marks="{
            0: '无',
            0.3: '默认',
            3: '最大',
          }" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            智能暂停滚动
            <n-text class="tip">鼠标移入歌词区域是否暂停滚动</n-text>
          </div>
          <n-switch v-model:value="lrcMousePause" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            歌词位置
            <n-text class="tip">歌词的默认垂直位置</n-text>
          </div>
          <n-select v-model:value="lyricsPosition" :options="[
            {
              label: '居左',
              value: 'left',
            },
            {
              label: '居中',
              value: 'center',
            },
            {
              label: '居右',
              value: 'right',
            },
          ]" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            歌词滚动位置
            <n-text class="tip">歌词高亮时所处的位置</n-text>
          </div>
          <n-select v-model:value="lyricsBlock" :options="[
            {
              label: '靠近顶部',
              value: 'start',
            },
            {
              label: '水平居中',
              value: 'center',
            },
          ]" class="set" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              是否去除歌曲信息
            </div>
            <n-text class="tip">去除歌词最前面的版权信息</n-text>
          </div>
          <n-switch v-model:value="removeInfo" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              显示逐字歌词
              <n-tag :bordered="false" round size="small" type="warning">
                开发中
                <template #icon>
                  <n-icon>
                    <SvgIcon icon="code" />
                  </n-icon>
                </template>
              </n-tag>
            </div>
            <n-text class="tip">是否在具有逐字歌词时显示</n-text>
          </div>
          <n-switch v-model:value="showYrc" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              显示逐字歌词动画
              <n-tag :bordered="false" round size="small" type="warning">
                开发中
                <template #icon>
                  <n-icon>
                    <SvgIcon icon="code" />
                  </n-icon>
                </template>
              </n-tag>
            </div>
            <n-text class="tip">可能会造成卡顿等性能问题，建议显卡为 GTX 2060 及以上</n-text>
          </div>
          <n-switch v-model:value="showYrcAnimation" :disabled="!showYrc" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            显示歌词翻译
            <n-text class="tip">是否在具有翻译歌词时显示</n-text>
          </div>
          <n-switch v-model:value="showTransl" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            显示歌词音译
            <n-text class="tip">是否在具有音译歌词时显示</n-text>
          </div>
          <n-switch v-model:value="showRoma" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            歌词自动聚焦
            <n-text class="tip">是否聚焦显示当前播放行，其他行将模糊显示</n-text>
          </div>
          <n-switch v-model:value="lyricsBlur" :round="false" />
        </n-card>

        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              使用 Apple Music-like Lyrics
            </div>
            <n-text class="tip">歌词使用 Apple Music-like Lyrics 进行渲染，需要高性能设备</n-text>
          </div>
          <n-switch v-model:value="useAMLyrics" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              Apple Music-like Lyrics 歌词弹簧效果
            </div>
            <n-text class="tip">是否使用物理弹簧算法实现歌词动画效果，需要高性能设备</n-text>
          </div>
          <n-switch v-model:value="useAMSpring" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              Apple Music-like Lyrics 歌词缩放效果
            </div>
            <n-text class="tip">放大高亮行歌词，需要高性能设备</n-text>
          </div>
          <n-switch v-model:value="useAMScale" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              Apple Music-like Lyrics 去除歌词信息
            </div>
            <n-text class="tip">去除 AM 歌词最前面的版权信息</n-text>
          </div>
          <n-switch v-model:value="removeAMInfo" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              Apple Music-like Lyrics 使用社区动效歌词
            </div>
            <n-text class="tip">使用 Steve-xmh/amll-ttml-db 的社区动效歌词库</n-text>
          </div>
          <n-switch v-model:value="useAMttmlDB" :round="false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            <div class="dev">
              Apple Music-like Lyrics 对 TMLL 歌词使用偏转
            </div>
            <n-text class="tip">不推荐开启，TMLL已对歌词进行过优化</n-text>
          </div>
          <n-switch v-model:value="lyricsAMttmlUseOffset" :round="false" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            Apple Music-like Lyrics 歌词偏转
            <n-text class="tip">用于抵消歌词动画产生的延迟</n-text>
            <n-text class="tip">
              {{ lyricsAMOffset }} ms
            </n-text>
          </div>
          <n-slider v-model:value="lyricsAMOffset" :tooltip="false" :max="2000" :min="0" :step="1" :marks="{
            0: '无',
            150: '默认',
            2000: '最大',
          }" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            Apple Music-like Lyrics 歌词切行偏转
            <n-text class="tip">使歌词提前切到下一行，仅对非 TTML 歌词有效</n-text>
            <n-text class="tip"> {{ lyricsAMEndTimeOffset }} ms </n-text>
          </div>
          <n-slider v-model:value="lyricsAMEndTimeOffset" :tooltip="false" :max="2000" :min="0" :step="1" :marks="{
            0: '无',
            250: '默认',
            2000: '最大',
          }" />
        </n-card>
        <n-card class="set-item" :content-style="{
          flexDirection: 'column',
          alignItems: 'flex-start',
        }">
          <div class="name">
            Apple Music-like Lyrics 背景流动速度
            <n-text class="tip">可以设置 AMLL 歌词背景流动速度</n-text>
            <n-text class="tip">
              {{ amllPlayerBackgroundFlowSpeed }}
            </n-text>
          </div>
          <n-slider v-model:value="amllPlayerBackgroundFlowSpeed" :tooltip="false" :max="10" :min="1" :step="1" :marks="{
            1: '最小',
            2: '默认',
            10: '最大',
          }" />
        </n-card>
      </div>
      <!-- 其他 -->
      <div class="set-type">
        <n-h3 prefix="bar"> 其他 </n-h3>
        <n-card class="set-item">
          <div class="name">
            默认加载数量
            <n-text class="tip">在部分列表页面显示几条数据</n-text>
          </div>
          <n-select v-model:value="loadSize" :options="[
            {
              label: '少一点（ 30 条 ）',
              value: 30,
            },
            {
              label: '差不多刚刚好（ 50 条 ）',
              value: 50,
            },
            {
              label: '我要很多（ 100 条 ）',
              value: 100,
            },
          ]" class="set" @update:value="themeAuto = false" />
        </n-card>
        <n-card class="set-item">
          <div class="name">
            程序重置
            <n-text class="tip">若程序显示异常或出现问题时可尝试此操作</n-text>
          </div>
          <n-button strong secondary type="error" @click="resetApp"> 重置 </n-button>
        </n-card>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup>
import { inject } from "vue";
import { storeToRefs } from "pinia";
import { useOsTheme } from "naive-ui";
import { siteSettings, siteStatus, musicData } from "@/stores";
import { getSessionId } from "@/utils/helper";
import debounce from "@/utils/debounce";
// import themeColorData from "@/assets/themeColor.json";
import packageJson from "@/../package.json";

const music = musicData();
const status = siteStatus();
const settings = siteSettings();
const { showPlayBar, coverTheme } = storeToRefs(status);
const {
  themeType,
  themeTypeName,
  themeAuto,
  themeAutoCover,
  themeAutoCoverType,
  showSider,
  loadSize,
  songVolumeFade,
  autoPlay,
  showYrc,
  showYrcAnimation,
  countDownShow,
  playerBackgroundType,
  showTransl,
  showRoma,
  songLevel,
  lyricsPosition,
  lyricsBlock,
  lrcMousePause,
  lyricsFontSize,
  lyricsBlur,
  showSearchHistory,
  bottomLyricShow,
  memorySeek,
  playCoverType,
  playSearch,
  showPlaylistCount,
  showSpectrums,
  siderShowCover,
  useMusicCache,
  removeInfo,
  lyricsOffset,
  lyricsAMOffset,
  useAMLyrics,
  useAMSpring,
  useAMScale,
  removeAMInfo,
  useAMttmlDB,
  lyricsAMttmlUseOffset,
  lyricsAMEndTimeOffset,
  simulationPlaying,
  amllPlayerBackgroundFlowSpeed,
  lyricsHookOffset,
  siteFont,
  lyricFont,
  html5Player,
  listenTogetherSyncThreshold,
} = storeToRefs(settings);

const updateLyricFont = inject("updateLyricFont");
const updateSiteFont = inject("updateSiteFont");

// 标签页数据
// const setTabsRef = ref(null);
// const setScrollRef = ref(null);
const setTabsValue = ref("setTab1");

// 基础数据
const osThemeRef = useOsTheme();
const sessionId = getSessionId();

// 音质数据
const songLevelData = {
  web: {
    label: "普通 WEB",
    tip: "在线流媒体音质",
    value: "web",
  },
  hq: {
    label: "极高 HQ",
    tip: "近 CD 品质的细节体验，最高 320kbps",
    value: "hq",
  },
  sq: {
    label: "无损 SQ",
    tip: "高保真无损音质，最高 48kHz/24bit",
    value: "sq",
  },
  rs: {
    label: "高分辨率音源 Hi-Res",
    tip: "索尼高品质音乐标准，高于 44.1kHz/16bit",
    value: "rs",
  },
  dts: {
    label: "杜比 5.1 声道",
    tip: "六声道环绕声，使人产生犹如身临音乐厅的感觉",
    value: "dts",
  },
  q360v1: {
    label: "臻品全景声 V1",
    tip: "独家自研空间音频，V1 版本，立体声",
    value: "q360v1",
  },
  q360v2: {
    label: "臻品全景声 V2",
    tip: "独家自研空间音频，V2 版本，多声道",
    value: "q360v2",
  },
  qai: {
    label: "臻品母带",
    tip: "还原声音细节，让声音还原更加极致",
    value: "qai",
  },
};

// 主题数据
const themeColorData = {
  red: {
    label: "欢快派对",
    value: "red",
  },
  orange: {
    label: "柑橘桔梦",
    value: "orange",
  },
  blue: {
    label: "深海蓝梦",
    value: "blue",
  },
  pink: {
    label: "粉色梦幻",
    value: "pink",
  },
  brown: {
    label: "深棕林荫",
    value: "brown",
  },
  indigo: {
    label: "星空靛蓝",
    value: "indigo",
  },
  green: {
    label: "生命绿洲",
    value: "green",
  },
  purple: {
    label: "皇室紫梦",
    value: "purple",
  },
  yellow: {
    label: "金色阳光",
    value: "yellow",
  },
  teal: {
    label: "海洋碧绿",
    value: "teal",
  }
};

// 字体选项
const fontOptions = [
  { label: 'HarmonyOS Regular', value: 'harmony_reg' },
  { label: 'HarmonyOS Bold', value: 'harmony_bold' },
  { label: 'PingFangSC Regular', value: 'pingfang_reg' },
  { label: 'PingFangSC Semibold', value: 'pingfang_semi' },
  { label: '系统默认', value: 'system' },
];


// 封面自动跟随变化
const themeAutoCoverChange = (val) => {
  if ($changeThemeColor !== "undefined" && Object.keys(coverTheme.value)?.length) {
    $changeThemeColor(val ? coverTheme.value : themeTypeName.value, val);
  }
};

// 标签页切换
const settingTabChange = (name) => {
  const index = Number(name.replace("setTab", ""));
  const setDom = document.querySelectorAll(".set-type")?.[index - 1];
  if (!setDom) return false;
  // 滚动至设置分类
  setDom.scrollIntoView({ behavior: "smooth" });
};

// 设置列表滚动
const allSetScroll = debounce((e) => {
  const distance = e.target.scrollTop + 30;
  const allSetDom = document.querySelectorAll(".set-type");
  allSetDom.forEach((v, i) => {
    if (distance >= v.offsetTop) setTabsValue.value = `setTab${i + 1}`;
  });
}, 100);

// 程序重置
const resetApp = () => {
  $dialog.warning({
    title: "程序重置",
    content: "确认重置为默认状态？你的登录状态以及自定义设置都将丢失！",
    positiveText: "重置",
    negativeText: "取消",
    onPositiveClick: () => {
      if (typeof $cleanAll === "undefined") {
        return $message.error("重置操作出现错误，请重试");
      }
      $cleanAll(false);
      $message.success("重置成功，正在重启");
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    },
  });
};

// 复制 Session ID
const copySessionId = async () => {
  try {
    if (window?.electron?.clipboard) {
      // Electron 环境
      electron.clipboard.writeText(sessionId);
    } else if (navigator.clipboard?.writeText) {
      // 浏览器环境
      await navigator.clipboard.writeText(sessionId);
    } else {
      // Fallback：旧浏览器或不支持 navigator.clipboard
      const textarea = document.createElement("textarea");
      textarea.value = sessionId;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    $message.success("已复制 Session ID 到剪贴板");
  } catch (err) {
    console.error("复制 Session ID 失败：", err);
    $message.error("复制失败");
  }
};

</script>

<style lang="scss" scoped>
.setting {
  max-width: 1200px;
  margin: 0 auto;

  .title {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    height: 58px;
    margin: 20px 0;
    font-size: 36px;
    font-weight: bold;

    .copyright {
      display: flex;
      flex-direction: row;
      align-items: center;
      margin-left: 12px;
      margin-bottom: 6px;
      font-size: 16px;
      font-weight: normal;
      cursor: pointer;

      .author {
        display: flex;
        align-items: center;

        &::after {
          content: "/";
          transform: translateY(2px);
          font-size: 14px;
          margin: 0 6px;
          opacity: 0.6;
        }

        .author-text {
          margin-left: 6px;
        }
      }

      .version {
        &::before {
          content: "v";
          margin-right: 2px;
        }
      }
    }
  }

  .n-tabs {
    height: 42px;
  }

  .set-type {
    padding-top: 30px;

    .set-item {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 12px;

      &:last-child {
        margin-bottom: 0;
      }

      :deep(.n-card__content) {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      .name {
        font-size: 16px;
        display: flex;
        flex-direction: column;
        padding-right: 20px;

        .dev {
          display: flex;
          flex-direction: row;
          align-items: center;

          .n-tag {
            margin-left: 6px;
          }
        }

        .tip {
          font-size: 12px;
          opacity: 0.8;
        }
      }

      .set {
        width: 200px;

        @media (max-width: 768px) {
          width: 140px;
          min-width: 140px;
        }
      }
    }
  }

  &.use-cover {
    .n-switch {
      &.n-switch--active {
        :deep(.n-switch__rail) {
          background-color: var(--main-second-color);
        }
      }
    }
  }
}
</style>
