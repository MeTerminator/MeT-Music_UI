/**
 * 全局设置(旧 src/views/Setting/index.vue 的 React 移植,U3 阶段)。
 * 所有设置项直接读写 useSettingsStore(setState 即自动持久化,引擎实时读取)。
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { useHostStore } from "@/host";
import { cleanAll, getSessionId } from "@/platform/web";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SettingItem, SettingSection, SliderMarks } from "./setting/SettingItem";
import {
  closeTypeOptions,
  fontOptions,
  loadSizeOptions,
  lyricsBlockOptions,
  lyricsPositionOptions,
  playCoverTypeOptions,
  playerBackgroundTypeOptions,
  searchLoadSizeOptions,
  songLevelData,
  songLevelOptions,
  themeAutoCoverTypeOptions,
  themeColorOptions,
  themeTypeOptions,
} from "./setting/options";
import packageJson from "../../package.json";

const set = useSettingsStore.setState;

/** 分区导航(点击滚动至对应分组) */
const sections = ["常规", "桌面客户端", "播放", "歌词", "其他"] as const;
type SectionName = (typeof sections)[number];

const Setting = () => {
  const settings = useSettingsStore();
  const coverTheme = useStatusStore((s) => s.coverTheme);
  const isHosted = useHostStore((s) => s.isHosted);

  const [activeTab, setActiveTab] = useState<SectionName>("常规");
  const [resetOpen, setResetOpen] = useState(false);
  const sectionRefs = useRef<Partial<Record<SectionName, HTMLDivElement | null>>>({});

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

  // 复制 Session ID(对齐旧 copySessionId,浏览器剪贴板 + 旧浏览器兜底)
  const copySessionId = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sessionId);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = sessionId;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("已复制 Session ID 到剪贴板");
    } catch (err) {
      console.error("复制 Session ID 失败：", err);
      toast.error("复制失败");
    }
  };

  // 程序重置(Dialog 二次确认后执行,对齐旧 resetApp)
  const confirmReset = () => {
    setResetOpen(false);
    cleanAll(false);
    toast.success("重置成功，正在重启");
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  // 分区跳转
  const scrollToSection = (name: SectionName) => {
    setActiveTab(name);
    sectionRefs.current[name]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bindSection = (name: SectionName) => (el: HTMLDivElement | null) => {
    sectionRefs.current[name] = el;
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* 标题(对齐旧页:标题 + 版本号) */}
      <div className="mb-5 flex items-end gap-3">
        <h1 className="text-3xl font-bold text-[var(--met-fg)]">全局设置</h1>
        <span className="pb-1 text-sm text-[var(--met-fg-dim)]">v{packageJson.version}</span>
      </div>

      {/* 分区导航 */}
      <div className="sticky top-0 z-10 -mx-2 mb-2 flex gap-1 rounded-xl bg-[var(--met-bg-elevated)] p-1">
        {sections.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => scrollToSection(name)}
            className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors ${
              activeTab === name
                ? "bg-[var(--met-bg-hover)] text-[var(--met-fg)]"
                : "text-[var(--met-fg-dim)] hover:text-[var(--met-fg)]"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 常规 */}
      <div ref={bindSection("常规")}>
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
          <SettingItem name="全局动态取色" dev tip="主题色是否跟随封面，目前感觉不好看">
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
      </div>

      {/* 桌面客户端(Electron 专属,浏览器中置灰展示) */}
      <div ref={bindSection("桌面客户端")}>
        <SettingSection title="桌面客户端" note={isHosted ? undefined : "桌面客户端生效"}>
          <SettingItem name="关闭软件提醒弹窗" tip="关闭软件时是否弹窗询问" dimmed={!isHosted}>
            <Switch
              checked={settings.closeTip}
              disabled={!isHosted}
              onCheckedChange={(v) => set({ closeTip: v })}
            />
          </SettingItem>
          <SettingItem name="关闭软件方式" tip="点击关闭按钮时的默认行为" dimmed={!isHosted}>
            <Select
              value={settings.closeType}
              options={closeTypeOptions}
              disabled={!isHosted}
              onValueChange={(v) => set({ closeType: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="显示歌曲任务栏进度" tip="在任务栏图标上显示播放进度" dimmed={!isHosted}>
            <Switch
              checked={settings.showTaskbarProgress}
              disabled={!isHosted}
              onCheckedChange={(v) => set({ showTaskbarProgress: v })}
            />
          </SettingItem>
        </SettingSection>
      </div>

      {/* 播放 */}
      <div ref={bindSection("播放")}>
        <SettingSection title="播放">
          <SettingItem
            name="在线播放音质"
            tip={songLevelData[settings.songLevel]?.tip ?? ""}
          >
            <Select
              value={settings.songLevel}
              options={songLevelOptions}
              onValueChange={(v) => set({ songLevel: v })}
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
          <SettingItem name="自动播放" tip="自动播放上次歌曲">
            <Switch checked={settings.autoPlay} onCheckedChange={(v) => set({ autoPlay: v })} />
          </SettingItem>
          <SettingItem
            name="记忆上次播放位置"
            tip={settings.autoPlay ? "与自动播放相冲突，已禁用" : undefined}
          >
            <Switch
              checked={settings.memorySeek}
              disabled={settings.autoPlay}
              onCheckedChange={(v) => set({ memorySeek: v })}
            />
          </SettingItem>
          <SettingItem
            name="音乐资源自动缓存"
            tip="可能会造成加载缓慢，将在下一首播放或刷新时生效"
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
          <SettingItem name="显示前奏倒计时" tip="部分歌曲前奏可能存在显示错误">
            <Switch
              checked={settings.countDownShow}
              onCheckedChange={(v) => set({ countDownShow: v })}
            />
          </SettingItem>
          <SettingItem
            name="显示音乐频谱"
            dev
            tip={
              settings.showSpectrums
                ? "开启音乐频谱会极大影响性能，如遇问题请关闭"
                : "是否在播放器底部显示音乐频谱"
            }
          >
            <Switch
              checked={settings.showSpectrums}
              onCheckedChange={(v) => set({ showSpectrums: v })}
            />
          </SettingItem>
        </SettingSection>
      </div>

      {/* 歌词 */}
      <div ref={bindSection("歌词")}>
        <SettingSection title="歌词">
          <SettingItem
            name="歌词文本大小"
            column
            tip={
              <span
                className="font-bold text-[var(--met-fg)]"
                style={{ fontSize: `${settings.lyricsFontSize}px` }}
              >
                我是一句歌词
              </span>
            }
          >
            <Slider
              value={settings.lyricsFontSize}
              min={36}
              max={56}
              step={1}
              onValueChange={(v) => set({ lyricsFontSize: v })}
            />
            <SliderMarks marks={["最小", "默认 46", "最大"]} />
          </SettingItem>
          <SettingItem name="歌词显示字体" tip="播放页展示歌词所使用的字体">
            <Select
              value={settings.lyricFont}
              options={fontOptions}
              onValueChange={(v) => set({ lyricFont: v })}
              className="w-52"
            />
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
          <SettingItem name="歌词位置" tip="歌词的默认垂直位置">
            <Select
              value={settings.lyricsPosition}
              options={lyricsPositionOptions}
              onValueChange={(v) => set({ lyricsPosition: v })}
              className="w-52"
            />
          </SettingItem>
          <SettingItem name="歌词滚动位置" tip="歌词高亮时所处的位置">
            <Select
              value={settings.lyricsBlock}
              options={lyricsBlockOptions}
              onValueChange={(v) => set({ lyricsBlock: v })}
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
          <SettingItem
            name="Apple Music-like Lyrics 背景流动速度"
            column
            tip={
              <>
                <span className="block">可以设置 AMLL 歌词背景流动速度</span>
                <span className="block">{settings.amllPlayerBackgroundFlowSpeed}</span>
              </>
            }
          >
            <Slider
              value={settings.amllPlayerBackgroundFlowSpeed}
              min={1}
              max={10}
              step={1}
              onValueChange={(v) => set({ amllPlayerBackgroundFlowSpeed: v })}
            />
            <SliderMarks marks={["最小", "默认 2", "最大"]} />
          </SettingItem>
        </SettingSection>
      </div>

      {/* 其他 */}
      <div ref={bindSection("其他")}>
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
      </div>

      {/* 关于 */}
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

export default Setting;
