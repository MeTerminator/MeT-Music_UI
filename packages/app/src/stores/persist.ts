import type { PersistStorage } from "zustand/middleware";

/**
 * 兼容旧 pinia-plugin-persistedstate 的存储格式。
 *
 * 旧格式:localStorage[key] = JSON.stringify(state 裸对象)
 * zustand 默认格式:JSON.stringify({ state, version })
 *
 * 本适配器读写裸对象格式,保证:
 *   1. 老用户的 musicData / siteStatus / siteSettings / siteData 无损迁移;
 *   2. 切换期间新旧 UI 读写同一份数据可互换(回滚安全)。
 */
export const legacyStorage = <S>(): PersistStorage<S> => ({
  getItem: (name) => {
    const raw = localStorage.getItem(name);
    if (raw == null) return null;
    try {
      return { state: JSON.parse(raw) as S, version: 0 };
    } catch {
      console.warn(`[persist] 无法解析 localStorage["${name}"],忽略旧值`);
      return null;
    }
  },
  setItem: (name, value) => {
    localStorage.setItem(name, JSON.stringify(value.state));
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
});
