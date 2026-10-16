/**
 * 全局设置内容(旧 src/views/Setting/index.vue 的 React 移植,U3 阶段)。
 * 所有设置项直接读写 useSettingsStore(setState 即自动持久化,引擎实时读取)。
 *
 * 从原路由页 pages/Setting.tsx 抽出,同时被两处复用:
 * - /setting 路由页(全页渲染,深链兼容);
 * - SettingsOverlay 悬浮层(内部滚动容器渲染)。
 * 左侧分类导航与右侧设置面板共用，窄屏保持紧凑分栏。
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { soundStop } from "@met/core";
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { cleanAll, getSessionId } from "@/platform/web";
import { DEFAULT_DESKTOP_LYRIC_FALLBACK } from "@/platform/desktop-lyric-color";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingNumber } from "./SettingNumber";
import { AmllSettings } from "./AmllSettings";
import { Settings2, Play, Captions, SlidersHorizontal, Info } from "lucide-react";
import { SettingItem, SettingSection, SliderMarks } from "./SettingItem";
import {
  fontOptions,
  loadSizeOptions,
  lyricsBlockOptions,
  lyricsPositionOptions,
  playCoverTypeOptions,
  playerBackgroundTypeOptions,
  searchLoadSizeOptions,
  songLevelData,
  songLevelOptions,
  neteaseSongLevelData,
  neteaseSongLevelOptions,
  themeAutoCoverTypeOptions,
  themeColorOptions,
  themeTypeOptions,
} from "./options";
import packageJson from "../../../package.json";

const set = useSettingsStore.setState;

/** 设置分类 */
const sections = ["常规", "播放", "歌词", "其他", "关于"] as const;
const sectionIcons = [Settings2, Play, Captions, SlidersHorizontal, Info];
type SectionName = (typeof sections)[number];

export interface SettingsContentProps {
  /** 悬浮层内渲染时隐藏页内大标题(标题已在悬浮层 header 中) */
  hideHeader?: boolean;
}

const SettingsContent = ({ hideHeader = false }: SettingsContentProps) => {
  const settings = useSettingsStore();
  const coverTheme = useStatusStore((s) => s.coverTheme);

  const [activeTab, setActiveTab] = useState<SectionName>("常规");
  const rootRef = useRef<HTMLDivElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const sessionId = getSessionId();

  // 明暗模式切换(对齐旧 setThemeType:setState + toast + 关闭跟随系统)
  const changeThemeType = (value: "light" | "dark") => {
    if (value === settings.themeType && !settings.themeAuto) return;
    set({ themeType: value, themeAuto: false });
    toast(`已切换至${value === "light" ? "浅色" : "深色"}模式`);
  };

  // 明暗模式跟随系统(开启时同步为系统主题,对齐旧页 osThemeRef)
  const changeThemeAuto = (value: boolean) => {
    if (value) {
      const osTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      set({ themeAuto: true, themeType: osTheme });
    } else {
      set({ themeAuto: false });
    }
  };

  // 复制 Session ID(对齐旧 copySessionId)
  const copySessionId = () => copyText(sessionId, "已复制 Session ID 到剪贴板");

  // 程序重置(Dialog 二次确认后执行,对齐旧 resetApp)。
  // 必须先停播放器:播放中的 rAF tick 每帧都在写 siteStatus,
  // 否则 localStorage 清完立刻又被 tick 写回,重置等于没生效。
  const confirmReset = () => {
    setResetOpen(false);
    soundStop();
    cleanAll(false);
    toast.success("重置成功，正在重启");
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-6xl px-3 py-5 md:px-6">
      {/* 标题(对齐旧页:标题 + 版本号;悬浮层内由 header 承担) */}
      {!hideHeader && (
        <div className="mb-5 flex items-end gap-3">
          <h1 className="text-3xl font-bold text-[var(--met-fg)]">全局设置</h1>
          <span className="pb-1 text-sm text-[var(--met-fg-dim)]">v{packageJson.version}</span>
        </div>
      )}

      <div className="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-3 md:grid-cols-[168px_minmax(0,1fr)] md:gap-6">
        <nav aria-label="设置分类" className="sticky top-0 flex flex-col gap-1 rounded-2xl border border-[var(--met-border)] bg-[var(--met-bg-elevated)] p-1.5 md:p-2">
          {sections.map((name, index) => {
            const Icon = sectionIcons[index];
            return (
              <button key={name} type="button" aria-current={activeTab === name ? "page" : undefined}
                onClick={() => { setActiveTab(name); rootRef.current?.scrollIntoView({ block: "start" }); }}
                className={`flex min-h-12 cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs transition-colors md:flex-row md:gap-3 md:px-4 md:text-sm ${activeTab === name ? "bg-[var(--met-primary)] font-semibold text-[var(--met-primary-fg)]" : "text-[var(--met-fg-dim)] hover:bg-[var(--met-bg-hover)] hover:text-[var(--met-fg)]"}`}>
                <Icon size={18} aria-hidden="true" />{name}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0" key={activeTab}>
      {/* 常规 */}
      {activeTab === "常规" && <div>
        <SettingSection title="常规">
          <SettingItem name="明暗模式">
            <Select
              value={settings.themeType}
              options={themeTypeOptions}
              onValueChange={changeThemeType}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="明暗模式是否跟随系统">
            <Switch checked={settings.themeAuto} onCheckedChange={changeThemeAuto} />
          </SettingItem>
          <SettingItem name="开启侧边栏" tip="将导航栏放于侧边显示，可展开或收起">
            <Switch
              checked={settings.showSider}
              onCheckedChange={(v) => set({ showSider: v })}
            />
          </SettingItem>
          <SettingItem name="侧边栏展示封面" tip="侧边栏歌单是否展示歌单封面">
            <Switch
              checked={settings.siderShowCover}
              disabled={!settings.showSider}
              onCheckedChange={(v) => set({ siderShowCover: v })}
            />
          </SettingItem>
          <SettingItem name="显示搜索历史">
            <Switch
              checked={settings.showSearchHistory}
              onCheckedChange={(v) => set({ showSearchHistory: v })}
            />
          </SettingItem>
          <SettingItem name="页面字体" tip="全局界面显示的字体">
            <Select
              value={settings.siteFont}
              options={fontOptions}
              onValueChange={(v) => set({ siteFont: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="主题选择">
            <Select
              value={settings.themeTypeName}
              options={themeColorOptions}
              onValueChange={(v) => set({ themeTypeName: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem
            name="全局动态取色"
            dev
            tip={
              Object.keys(coverTheme).length === 0
                ? "主题色是否跟随封面；需先播放一首带封面的歌曲取到主色后才能开启"
                : "主题色是否跟随封面，目前感觉不好看"
            }
          >
            <Switch
              checked={settings.themeAutoCover}
              disabled={Object.keys(coverTheme).length === 0}
              onCheckedChange={(v) => set({ themeAutoCover: v })}
            />
          </SettingItem>
          <SettingItem name="全局动态取色类别" dev tip="将在下一首播放或刷新时生效，不建议更改">
            <Select
              value={settings.themeAutoCoverType}
              options={themeAutoCoverTypeOptions}
              disabled={!settings.themeAutoCover}
              onValueChange={(v) => set({ themeAutoCoverType: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="SessionID" tip={sessionId}>
            <Button variant="outline" onClick={copySessionId}>
              复制
            </Button>
          </SettingItem>
        </SettingSection>
      </div>}

      {/* 播放 */}
      {activeTab === "播放" && <div>
        <SettingSection title="播放">
          <SettingItem
            name="QQ 音乐音质选择"
            tip={songLevelData[settings.songLevel]?.tip ?? ""}
          >
            <Select
              value={settings.songLevel}
              options={songLevelOptions}
              onValueChange={(v) => set({ songLevel: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="网易云音乐音质选择" tip={`${neteaseSongLevelData[settings.neteaseSongLevel]?.tip ?? ""}。实际音质取决于歌曲、账号权益和设备，缺少所选音质时由网易云回退。`}>
            <Select
              value={settings.neteaseSongLevel}
              options={neteaseSongLevelOptions}
              onValueChange={(v) => set({ neteaseSongLevel: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem
            name="使用 HTML5 播放器"
            tip={
              <>
                <span className="block">
                  如果开启，则会使用 Audio 标签播放音频，支持动态加载，但在 Safari
                  浏览器上可能会遇到进度不同步问题；
                </span>
                <span className="block">
                  如果关闭，则会使用 Web Audio API 播放音频，播放需缓存整个音频文件，暂停音乐会导致
                  Media Session 媒体会话被清除，无法恢复播放。
                </span>
                <span className="block">切换该开关后最好刷新页面。</span>
              </>
            }
          >
            <Switch
              checked={settings.html5Player}
              onCheckedChange={(v) => set({ html5Player: v })}
            />
          </SettingItem>
          <SettingItem
            name="静音模拟播放"
            tip="不请求音乐文件，但是模拟时间轴以显示歌词，以及上报播放数据"
          >
            <Switch
              checked={settings.simulationPlaying}
              onCheckedChange={(v) => set({ simulationPlaying: v })}
            />
          </SettingItem>
          <SettingItem name="自动播放" tip="重新进入时自动播放上次的歌曲">
            <Switch checked={settings.autoPlay} onCheckedChange={(v) => set({ autoPlay: v })} />
          </SettingItem>
          <SettingItem
            name="记忆上次播放位置"
            tip="刷新页面或重新进入时，从上次播放到的位置继续（可与自动播放同时开启）"
          >
            <Switch
              checked={settings.memorySeek}
              onCheckedChange={(v) => set({ memorySeek: v })}
            />
          </SettingItem>
          <SettingItem
            name="音乐资源自动缓存"
            tip="开启后需先下载完整首歌曲才会开始播放（此时进度条临时显示下载进度），可能造成加载缓慢；将在下一首播放或刷新时生效"
          >
            <Switch
              checked={settings.useMusicCache}
              onCheckedChange={(v) => set({ useMusicCache: v })}
            />
          </SettingItem>
          <SettingItem name="音乐渐入渐出">
            <Switch
              checked={settings.songVolumeFade}
              onCheckedChange={(v) => set({ songVolumeFade: v })}
            />
          </SettingItem>
          <SettingItem
            name="一起听歌同步阈值"
            column
            tip={
              <>
                <span className="block">
                  本地播放时间与服务器播放时间差值超过该设定时自动同步进度
                </span>
                <span className="block">{settings.listenTogetherSyncThreshold} ms</span>
              </>
            }
          >
            <Slider
              value={settings.listenTogetherSyncThreshold}
              min={100}
              max={2000}
              step={50}
              onValueChange={(v) => set({ listenTogetherSyncThreshold: v })}
            />
            <SliderMarks marks={["极小", "2000ms"]} />
          </SettingItem>
          <SettingItem
            name="播放全部搜索歌曲"
            tip="在播放搜索页面上的歌曲时，是否同时播放所有搜索结果中的歌曲"
          >
            <Switch
              checked={settings.playSearch}
              onCheckedChange={(v) => set({ playSearch: v })}
            />
          </SettingItem>
          <SettingItem name="底栏歌词显示" tip="是否在播放时将歌手信息更改为歌词">
            <Switch
              checked={settings.bottomLyricShow}
              onCheckedChange={(v) => set({ bottomLyricShow: v })}
            />
          </SettingItem>
          <SettingItem name="显示播放列表歌曲数量">
            <Switch
              checked={settings.showPlaylistCount}
              onCheckedChange={(v) => set({ showPlaylistCount: v })}
            />
          </SettingItem>
          <SettingItem name="封面布局" tip="全屏播放器封面的呈现方式（桌面分栏生效）">
            <Select value={settings.coverLayout} options={[{ label: "默认", value: "default" }, { label: "全幅封面", value: "fullscreen" }]} onValueChange={(v) => set({ coverLayout: v })} className="w-52" />
          </SettingItem>
          <SettingItem name="封面/歌词占比" column tip="播放页封面与歌词区域的宽度比例（桌面分栏生效）">
            <SettingNumber label="封面/歌词占比" value={Math.round(settings.coverLyricRatio * 100)} min={30} max={60} step={1} unit="%" onChange={(v) => set({ coverLyricRatio: v / 100 })} />
            <SliderMarks marks={["30%", "45%", "60%"]} />
          </SettingItem>
          <SettingItem name="播放器样式" tip="播放器左侧区域样式">
            <Select
              value={settings.playCoverType}
              options={playCoverTypeOptions}
              onValueChange={(v) => set({ playCoverType: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem
            name="播放背景样式"
            tip={
              settings.playerBackgroundType === "animation"
                ? "流体效果，较消耗性能，请谨慎开启"
                : settings.playerBackgroundType === "amllAnimation"
                  ? "AMLL 流体背景，可在下方调整渲染器与性能参数"
                : settings.playerBackgroundType === "blur"
                  ? "将封面模糊处理为背景"
                  : "提取封面主色为渐变色"
            }
          >
            <Select
              value={settings.playerBackgroundType}
              options={playerBackgroundTypeOptions}
              onValueChange={(v) => set({ playerBackgroundType: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem
            name="全屏播放器背景流动速度"
            column
            tip={
              <>
                <span className="block">调整 AMLL 与流体背景的运动速度，静态背景不受影响</span>
                <span className="block">{settings.amllPlayerBackgroundFlowSpeed}</span>
              </>
            }
          >
            <SettingNumber label="全屏播放器背景流动速度" value={settings.amllPlayerBackgroundFlowSpeed} min={0} max={10} step={1} onChange={(v) => set({ amllPlayerBackgroundFlowSpeed: v })} />
            <SliderMarks marks={["静止 0", "默认 1", "最大 10"]} />
          </SettingItem>
          <AmllSettings kind="background" />
          <SettingItem name="显示前奏倒计时" tip="部分歌曲前奏可能存在显示错误">
            <Switch
              checked={settings.countDownShow}
              onCheckedChange={(v) => set({ countDownShow: v })}
            />
          </SettingItem>
        </SettingSection>
      </div>}

      {/* 歌词 */}
      {activeTab === "歌词" && <div>
        <SettingSection title="歌词">
          <SettingItem name="歌词脏字补全" tip="还原 f**k、sh*t 等英文屏蔽词及常见变形；无法确定的词保留原样">
            <Switch
              aria-label="歌词脏字补全"
              checked={settings.uncensorMaskedProfanity}
              onCheckedChange={(v) => set({ uncensorMaskedProfanity: v })}
            />
          </SettingItem>
          <SettingItem name="歌词文本大小" column tip="播放页歌词的文字大小">
            {/* 预览独立成行,避免与标题/说明重叠 */}
            <div className="mb-3 flex min-h-[72px] items-center justify-center overflow-hidden rounded-lg bg-[var(--met-bg)] px-4 py-2">
              <span
                className="lyric-font truncate text-[var(--met-fg)]"
                style={{ fontSize: `${settings.lyricsFontSize}px`, fontWeight: settings.lyricFontWeight || undefined }}
              >
                我是一句歌词
              </span>
            </div>
            <SettingNumber label="歌词字号" value={settings.lyricsFontSize} min={16} max={96} step={1} unit="px" onChange={(v) => set({ lyricsFontSize: v })} />
            <SliderMarks marks={["16px", "默认 42px", "96px"]} />
          </SettingItem>
          <SettingItem name="歌词显示字体" tip="播放页展示歌词所使用的字体">
            <Select
              value={settings.lyricFont}
              options={fontOptions}
              onValueChange={(v) => set({ lyricFont: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="歌词字重" column tip="自定义 100–900；设为 0 时跟随字体，默认 700">
            <SettingNumber label="歌词字重" value={settings.lyricFontWeight} min={0} max={900} step={1} onChange={(v) => set({ lyricFontWeight: v === 0 ? 0 : Math.max(100, v) })} />
          </SettingItem>
          <SettingItem
            name="歌词偏转"
            column
            tip={
              <>
                <span className="block">使歌词提前切到下一行，用于抵消歌词步进延迟</span>
                <span className="block">{settings.lyricsOffset} s</span>
              </>
            }
          >
            <Slider
              value={settings.lyricsOffset}
              min={0}
              max={3}
              step={0.01}
              onValueChange={(v) => set({ lyricsOffset: Math.round(v * 100) / 100 })}
            />
            <SliderMarks marks={["无", "默认 0.4", "最大"]} />
          </SettingItem>
          <SettingItem
            name="歌词时间平移"
            column
            tip={
              <>
                <span className="block">
                  整体平移歌词时间轴，对普通歌词与 AMLL 歌词同时生效；
                  正值让歌词更晚出现，负值更早（全屏播放器控制条上有 ±10ms 快捷按钮）
                </span>
                <span className="block">
                  {settings.lyricsShiftMs > 0 ? `+${settings.lyricsShiftMs}` : settings.lyricsShiftMs} ms
                </span>
              </>
            }
          >
            <Slider
              value={settings.lyricsShiftMs}
              min={-2000}
              max={2000}
              step={10}
              onValueChange={(v) => set({ lyricsShiftMs: v })}
            />
            <SliderMarks marks={["-2000ms", "默认 0", "+2000ms"]} />
          </SettingItem>
          <SettingItem
            name="桌面歌词备选主题色"
            tip="封面主题色偏白时，桌面歌词使用此颜色"
          >
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="桌面歌词备选主题色"
                value={settings.desktopLyricFallbackColor}
                onChange={(event) => set({ desktopLyricFallbackColor: event.target.value.toUpperCase() })}
                className="h-9 w-12 cursor-pointer rounded border border-[var(--met-border)] bg-transparent p-1"
              />
              <span className="font-mono text-sm">{settings.desktopLyricFallbackColor}</span>
              <Button
                onClick={() => set({ desktopLyricFallbackColor: DEFAULT_DESKTOP_LYRIC_FALLBACK })}
                disabled={settings.desktopLyricFallbackColor === DEFAULT_DESKTOP_LYRIC_FALLBACK}
              >
                恢复默认
              </Button>
            </div>
          </SettingItem>
          <SettingItem
            name="Hook 歌词偏转"
            column
            tip={
              <>
                <span className="block">
                  window.$MeTMusic_Data 中歌词计算的偏移量，用于桌面歌词等外部场景
                </span>
                <span className="block">{settings.lyricsHookOffset} s</span>
              </>
            }
          >
            <Slider
              value={settings.lyricsHookOffset}
              min={0}
              max={3}
              step={0.01}
              onValueChange={(v) => set({ lyricsHookOffset: Math.round(v * 100) / 100 })}
            />
            <SliderMarks marks={["无", "默认 0.3", "最大"]} />
          </SettingItem>
          <SettingItem name="智能暂停滚动" tip="鼠标移入歌词区域是否暂停滚动">
            <Switch
              checked={settings.lrcMousePause}
              onCheckedChange={(v) => set({ lrcMousePause: v })}
            />
          </SettingItem>
          <SettingItem name="歌词位置" tip="普通歌词的水平对齐方式">
            <Select
              value={settings.lyricsPosition}
              options={lyricsPositionOptions}
              onValueChange={(v) => set({ lyricsPosition: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="歌词滚动位置" tip="普通歌词的高亮位置，同时设置 AMLL 聚焦行预设位置">
            <Select
              value={settings.lyricsBlock}
              options={lyricsBlockOptions}
              onValueChange={(v) => set({ lyricsBlock: v, amllAlignPosition: v === "center" ? 0.5 : 0.25 })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="是否去除歌曲信息" tip="去除歌词最前面的版权信息">
            <Switch
              checked={settings.removeInfo}
              onCheckedChange={(v) => set({ removeInfo: v })}
            />
          </SettingItem>
          <SettingItem name="显示逐字歌词" dev tip="是否在具有逐字歌词时显示">
            <Switch checked={settings.showYrc} onCheckedChange={(v) => set({ showYrc: v })} />
          </SettingItem>
          <SettingItem
            name="显示逐字歌词动画"
            dev
            tip="可能会造成卡顿等性能问题，建议显卡为 GTX 2060 及以上"
          >
            <Switch
              checked={settings.showYrcAnimation}
              disabled={!settings.showYrc}
              onCheckedChange={(v) => set({ showYrcAnimation: v })}
            />
          </SettingItem>
          <SettingItem name="显示歌词翻译" tip="是否在具有翻译歌词时显示">
            <Switch
              checked={settings.showTransl}
              onCheckedChange={(v) => set({ showTransl: v })}
            />
          </SettingItem>
          <SettingItem name="显示歌词音译" tip="是否在具有音译歌词时显示">
            <Switch checked={settings.showRoma} onCheckedChange={(v) => set({ showRoma: v })} />
          </SettingItem>
          <SettingItem name="歌词自动聚焦" tip="是否聚焦显示当前播放行，其他行将模糊显示">
            <Switch
              checked={settings.lyricsBlur}
              onCheckedChange={(v) => set({ lyricsBlur: v })}
            />
          </SettingItem>
          <SettingItem
            name="使用 Apple Music-like Lyrics"
            tip="歌词使用 Apple Music-like Lyrics 进行渲染，需要高性能设备"
          >
            <Switch
              checked={settings.useAMLyrics}
              onCheckedChange={(v) => set({ useAMLyrics: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 模糊未播放行"
            tip="模糊非当前播放行的歌词，默认关闭"
          >
            <Switch
              checked={settings.useAMBlur}
              onCheckedChange={(v) => set({ useAMBlur: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 歌词弹簧效果"
            tip="是否使用物理弹簧算法实现歌词动画效果，需要高性能设备"
          >
            <Switch
              checked={settings.useAMSpring}
              onCheckedChange={(v) => set({ useAMSpring: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 歌词缩放效果"
            tip="放大高亮行歌词，需要高性能设备"
          >
            <Switch
              checked={settings.useAMScale}
              onCheckedChange={(v) => set({ useAMScale: v })}
            />
          </SettingItem>
          <AmllSettings kind="lyrics" />
          <SettingItem
            name="Apple Music-like Lyrics 去除歌词信息"
            tip="去除 AM 歌词最前面的版权信息"
          >
            <Switch
              checked={settings.removeAMInfo}
              onCheckedChange={(v) => set({ removeAMInfo: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 使用社区动效歌词"
            tip="使用 Steve-xmh/amll-ttml-db 的社区动效歌词库"
          >
            <Switch
              checked={settings.useAMttmlDB}
              onCheckedChange={(v) => set({ useAMttmlDB: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 对 TMLL 歌词使用偏转"
            tip="不推荐开启，TMLL已对歌词进行过优化"
          >
            <Switch
              checked={settings.lyricsAMttmlUseOffset}
              onCheckedChange={(v) => set({ lyricsAMttmlUseOffset: v })}
            />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 歌词偏转"
            column
            tip={
              <>
                <span className="block">用于抵消歌词动画产生的延迟</span>
                <span className="block">{settings.lyricsAMOffset} ms</span>
              </>
            }
          >
            <Slider
              value={settings.lyricsAMOffset}
              min={0}
              max={2000}
              step={1}
              onValueChange={(v) => set({ lyricsAMOffset: v })}
            />
            <SliderMarks marks={["无", "默认 150", "最大"]} />
          </SettingItem>
          <SettingItem
            name="Apple Music-like Lyrics 歌词切行偏转"
            column
            tip={
              <>
                <span className="block">使歌词提前切到下一行，仅对非 TTML 歌词有效</span>
                <span className="block">{settings.lyricsAMEndTimeOffset} ms</span>
              </>
            }
          >
            <Slider
              value={settings.lyricsAMEndTimeOffset}
              min={0}
              max={2000}
              step={1}
              onValueChange={(v) => set({ lyricsAMEndTimeOffset: v })}
            />
            <SliderMarks marks={["无", "默认 250", "最大"]} />
          </SettingItem>

        </SettingSection>
      </div>}

      {/* 其他 */}
      {activeTab === "其他" && <div>
        <SettingSection title="其他">
          <SettingItem name="默认加载数量" tip="在部分列表页面显示几条数据">
            <Select
              value={String(settings.loadSize)}
              options={loadSizeOptions}
              onValueChange={(v) => set({ loadSize: Number(v) })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="搜索结果加载数量" tip="搜索结果每页加载几条数据">
            <Select
              value={String(settings.searchLoadSize)}
              options={searchLoadSizeOptions}
              onValueChange={(v) => set({ searchLoadSize: Number(v) })}
              className="w-52"
            />
          </SettingItem>
        </SettingSection>
      </div>}

      {/* 关于 */}
      {activeTab === "关于" && <div>
        <SettingSection title="关于">
        <SettingItem name="版本" tip="MeT-Music">
          <span className="text-sm text-[var(--met-fg-dim)]">v{packageJson.version}</span>
        </SettingItem>
        <SettingItem name="程序重置" tip="若程序显示异常或出现问题时可尝试此操作">
          <Button variant="danger" onClick={() => setResetOpen(true)}>
            重置
          </Button>
        </SettingItem>
      </SettingSection>
      </div>}
        </div>
      </div>

      {/* 程序重置确认弹窗(对齐旧 $dialog.warning) */}
      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="程序重置"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmReset}>
              重置
            </Button>
          </>
        }
      >
        确认重置为默认状态？你的登录状态以及自定义设置都将丢失！
      </Dialog>
    </div>
  );
};

export default SettingsContent;
