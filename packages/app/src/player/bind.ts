/**
 * 引擎 ↔ zustand 桥接。
 *
 * core 引擎按旧 Pinia 风格直接对状态对象读写(含 `status.playState = true`、
 * `music.playList.splice(...)`、`music.playSongData.localCover = ...` 这类
 * 就地写入)。本文件用 commit-on-write 代理把这些写入转为 zustand 的
 * 不可变 setState,保证 React 侧订阅正常触发。
 *
 * 约定:
 *   - 顶层属性读:实时读 store.getState()(引擎解构后仍保持新鲜);
 *   - 顶层属性写:setState({ key: value });
 *   - 一层嵌套对象写(playTimeData.bar = ...):浅拷贝后 setState;
 *   - 数组变异方法(splice/push/...):调用时刻重读当前数组 → 拷贝 →
 *     应用变异 → setState(嵌套 splice 场景依赖"调用时刻重读"保证正确);
 *   - 更深层写入引擎不存在,不支持。
 */
import type { StoreApi } from "zustand";

type AnyState = object;

const stateOf = <S extends AnyState>(store: StoreApi<S>): Record<string, unknown> =>
  store.getState() as Record<string, unknown>;

const ARRAY_MUTATORS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** 包装数组:变异方法在调用时刻重读 → 拷贝 → 应用 → 提交 */
const wrapArray = <S extends AnyState>(store: StoreApi<S>, topKey: string): unknown[] => {
  const current = () => stateOf(store)[topKey] as unknown[];
  return new Proxy([] as unknown[], {
    get(_t, prop) {
      if (typeof prop === "string" && ARRAY_MUTATORS.has(prop)) {
        return (...args: unknown[]) => {
          const copy = [...current()];
          const result = (copy[prop as keyof typeof copy] as (...a: unknown[]) => unknown).apply(
            copy,
            args,
          );
          store.setState({ [topKey]: copy } as Partial<S>);
          return result;
        };
      }
      const arr = current();
      const value = arr[prop as keyof typeof arr];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(arr) : value;
    },
    set(_t, prop, value) {
      const copy = [...current()];
      (copy as unknown as Record<string, unknown>)[prop as string] = value;
      store.setState({ [topKey]: copy } as Partial<S>);
      return true;
    },
    has: (_t, prop) => prop in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, prop) => Object.getOwnPropertyDescriptor(current(), prop),
  });
};

/** 包装一层嵌套对象:属性写 → 浅拷贝提交 */
const wrapObject = <S extends AnyState>(
  store: StoreApi<S>,
  topKey: string,
): Record<string, unknown> => {
  const current = () => stateOf(store)[topKey] as Record<string, unknown>;
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => current()[prop as string],
    set(_t, prop, value) {
      store.setState({ [topKey]: { ...current(), [prop]: value } } as Partial<S>);
      return true;
    },
    has: (_t, prop) => prop in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, prop) => Object.getOwnPropertyDescriptor(current(), prop),
  });
};

/**
 * 生成引擎可读写的 store 代理。
 * @param store zustand store
 * @param extras 附加成员(getter 与方法,如 getPlaySongData / setPlayHistory)
 */
export const bindStore = <T extends object, S extends AnyState>(
  store: StoreApi<S>,
  extras?: Record<string, unknown | (() => unknown)>,
): T => {
  return new Proxy({} as T, {
    get(_t, prop: string) {
      if (extras && prop in extras) {
        const member = extras[prop];
        // getter 约定:以 get 开头且标记为 getter 的成员按属性取值
        if (typeof member === "function" && (member as { __getter?: boolean }).__getter) {
          return (member as () => unknown)();
        }
        return member;
      }
      const value = stateOf(store)[prop];
      if (Array.isArray(value)) return wrapArray(store, prop);
      if (isPlainObject(value)) return wrapObject(store, prop);
      return value;
    },
    set(_t, prop: string, value) {
      store.setState({ [prop]: value } as Partial<S>);
      return true;
    },
    has: (_t, prop) => (extras ? prop in extras : false) || prop in stateOf(store),
  }) as T;
};

/** 把函数标记为属性 getter(bindStore extras 用) */
export const asGetter = <F extends () => unknown>(fn: F): F => {
  (fn as F & { __getter: boolean }).__getter = true;
  return fn;
};
