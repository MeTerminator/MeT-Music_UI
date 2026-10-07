# MeT-Music UI

> 仅供个人学习研究使用，禁止用于商业及非法用途

## 本地开发

需要 [Node.js](https://nodejs.org/) LTS 和 [pnpm](https://pnpm.io/)。

```bash
git clone https://github.com/MeTerminator/MeT-Music_UI.git
cd MeT-Music_UI
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
```

## ⚠️ 使用须知

本项目所使用的 API 均有跨越限制，且含有防护机制，如需在别处使用请联系作者获得开放 API 接口。

## 😘 鸣谢

本项目基于 [SPlayer](https://github.com/imsyy/SPlayer/) 项目改造


## 📜 开源许可

- **本项目仅供个人学习研究使用，禁止用于商业及非法用途**
- 本项目基于 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 许可进行开源
  1. **修改和分发：** 任何对本项目的修改和分发都必须基于 AGPL-3.0 进行，源代码必须一并提供
  2. **派生作品：** 任何派生作品必须同样采用 AGPL-3.0，并在适当的地方注明原始项目的许可证
  3. **注明原作者：** 在任何修改、派生作品或其他分发中，必须在适当的位置明确注明原作者及其贡献
  4. **免责声明：** 根据 AGPL-3.0，本项目不提供任何明示或暗示的担保。请详细阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 以了解完整的免责声明内容
  5. **社区参与：** 欢迎社区的参与和贡献，我们鼓励开发者一同改进和维护本项目
  6. **许可证链接：** 请阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 了解更多详情


### QQ / 网易云双平台

资源页面使用 `platform=qq|netease` 查询参数，旧链接默认 QQ。
搜索建议同时展示两个平台，搜索结果页可切换平台；账号资料和歌单分别保存，可同时使用两个账号。
播放器、最近播放、共享播放列表和页面导航均保留歌曲来源。

本地后端使用 SQLite 并禁止凭据刷新时，UI 可连接到它：

```sh
VITE_API_PROXY_TARGET=http://127.0.0.1:7102/api pnpm dev
```

网易云系统账号的扫码登录脚本和部署配置见后端 README，系统 Cookie 不会保存到浏览器。
