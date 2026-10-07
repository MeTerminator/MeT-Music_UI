# 固定接口契约

音乐 HTTP 响应和房间 WebSocket schema 来自相邻 `MeT-Music_Backend/docs` 的
OpenAPI 与 WebSocket JSON Schema。生成的 TypeScript 类型和 Zod 校验器位于
`packages/core/src/api/contracts.ts`。API 查询函数按具体路径返回类型，JSON body 在返回前校验，
校验失败拒绝 Promise；HTTP 200 的历史 `code=404` 分支仍是合法的联合类型。

```bash
python3 scripts/generate-contracts.py
python3 scripts/generate-contracts.py --check
pnpm typecheck
pnpm test
pnpm build
```

修改后端模型后，先导出后端文档，再生成此文件。不要手改生成文件。
脚本使用 Python 3 标准库，无需发起网络请求。

一起听下行消息、时间和续期响应均在运行时校验。操作类型按 action 绑定其数据，
不存在应用层 `ping` 动作。歌曲从 UI 展示类型投影为固定的房间协议类型，
不把计数等页面专用数据发送到房间。

歌曲身份按 `(source, str(id))` 比较；缺省来源为 QQ，有本地路径时按 local 处理。
网易云来源已作为协议身份预留，尚无播放适配器；真实播放会阻止将网易云 ID 误发给 QQ 接口。
现有反馈统计只面向 QQ，本地和网易云曲目不向该统计接口上报。
歌词解析类型使用 AMLL 的 LyricLine/TTMLLyric.metadata，原始歌词响应也有具体类型。

用户输入、网络 JSON 和错误异常在解析前使用 `unknown`，这是校验边界；业务响应不使用 `any`。
后端错误上下文使用 JSON 值联合类型，以容纳校验失败的原始输入，不作为业务扩展字段。

发布顺序：先部署新后端，再发布新 UI。新校验器会拒绝旧后端未建模的原生透传字段。
宿主 HookPayload v2 的运行时结构和函数签名未修改，初始化占位数据只收紧 TypeScript 类型；
UI 与桌面端的宿主契约副本保持一致。
