/**
 * IndexedDB 文件存储(下载/本地音乐缓存)。
 * 旧实现是 localforage.createInstance({ name: "filesDB" }),其底层为
 * IndexedDB 数据库 "filesDB" 的 "keyvaluepairs" 对象仓库;
 * 这里用 idb-keyval 指向同一数据库/仓库,老用户已存数据可直接读取。
 * ($cleanAll 的 indexedDB.deleteDatabase("filesDB") 亦保持有效。)
 */
import { createStore, del, get, keys, set } from "idb-keyval";

const filesStore = createStore("filesDB", "keyvaluepairs");

export const setFile = (key: string, value: unknown): Promise<void> =>
  set(key, value, filesStore);

export const getFile = <T = unknown>(key: string): Promise<T | undefined> =>
  get<T>(key, filesStore);

export const deleteFile = (key: string): Promise<void> => del(key, filesStore);

export const listFileKeys = (): Promise<IDBValidKey[]> => keys(filesStore);
