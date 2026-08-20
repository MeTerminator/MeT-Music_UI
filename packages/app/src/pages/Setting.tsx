/**
 * 全局设置路由页(/setting 深链兼容的薄壳)。
 *
 * 设置内容已抽至 ./setting/SettingsContent(同时被 SettingsOverlay 悬浮层复用):
 * - 侧栏「设置」项现走悬浮层(useStatusStore.showSettingsPanel);
 * - 直接访问 /setting(旧深链 / 收藏)仍全页渲染同一套内容。
 */
import SettingsContent from "./setting/SettingsContent";

const Setting = () => <SettingsContent />;

export default Setting;
