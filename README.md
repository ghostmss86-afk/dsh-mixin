# dsh-mixin · 皮肤与壁纸插件

**把 DeepSeek Harness 变成一间能放电影的房间。** 8 套预设皮肤、12 套自定义配色、9 套渐变，再加上真正能用的本地视频壁纸：播放列表、上下集、进度拖动、全屏、声音，全都在这一个插件里。

[![npm version](https://img.shields.io/npm/v/dsh-mixin?color=4d6bfe)](https://www.npmjs.com/package/dsh-mixin) [![npm downloads](https://img.shields.io/npm/dm/dsh-mixin?color=4d6bfe)](https://www.npmjs.com/package/dsh-mixin) [![GitHub stars](https://img.shields.io/github/stars/ghostmss86-afk/dsh-mixin?style=flat&color=4d6bfe)](https://github.com/ghostmss86-afk/dsh-mixin/stargazers)
[![version](https://img.shields.io/badge/version-1.0.38-informational.svg)](CHANGELOG.md) [![license](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]() [![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.1-111827)]()

> **新名字：`dsh-mixin`。** 仓库、npm 包与插件入口已从 `dsh-skin-studio` / `dsh-plugin-skin-studio` 统一改为 `dsh-mixin`。旧 npm 包仍可安装，但已标记弃用并指向这里；用户已保存的皮肤、壁纸和视频不受影响。

![dsh-mixin 预览](docs/preview.webp)

## 安装

**方式一：应用内安装（推荐）**

在 DeepSeek Harness 的精选插件市场里搜索 **dsh-mixin** 或 **视频壁纸**，点安装。装完**完全退出并重启 DSH**（不是刷新页面）。

**方式二：命令行安装**

```bash
dsh plugin --profile web add dsh-mixin
```

**方式三：从 GitHub 安装（跟随仓库最新代码）**

```bash
dsh plugin --profile web add github:ghostmss86-afk/dsh-mixin
```

> 三种方式都需要 **DeepSeek Harness 0.2.2-rc.1** 或更高版本。升级或重装后请完全重启 DSH；只刷新页面可能仍加载旧 bundle。市场里暂时搜不到时，用方式二。

## 30 秒看懂

- **换皮肤**：8 套预设、12 套自定义配色、9 套渐变，实时预览，一键恢复默认。
- **放视频**：本地视频当壁纸，支持多选、整目录、拖拽导入；播放列表、上一集/下一集、进度拖动、全屏、声音。
- **不添乱**：F7 上一个、F8 播放暂停、F9 下一个；播放带停止操作 23 秒自动淡出；双击进入整页全屏，工作界面可以浮在画面上；`Esc` 退出；面板半透明但不挡字。
- **不出本机**：视频走 `127.0.0.1` 回环流式播放，自定义内容存在 IndexedDB，插件不上传任何数据。

## 和同类不一样在哪

大多数主题插件解决“配色”，大多数壁纸插件解决“铺一张图/一段静音循环”。**dsh-mixin 把视频壁纸当成播放器来做**：

| 能力 | 主题配色类 | 壁纸引擎类 | **dsh-mixin** |
| --- | --- | --- | --- |
| 视频壁纸 | — | 部分 | **支持** |
| 壁纸可开声 | — | 多数静音 | **支持** |
| 播放列表 / 连播 | — | — | **支持** |
| 进度拖动 seek | — | — | **支持** |
| 全屏播放 | — | — | **支持** |
| 图片 / 渐变壁纸 | 部分 | 支持 | 支持 |
| 多套预设 + 自定义 | 支持 | 部分 | 支持 |
| 数据不出本机 | 不一定 | 不一定 | **是** |

具体差异：视频通过本机路由流式读取，支持 `Range` 请求（HTTP 206），所以拖动进度不用等整段加载；浏览器解不了的音轨（E-AC-3 / DTS / TrueHD）用 ffmpeg 生成 AAC 侧车；HEVC 卡顿时后台转 H.264 代理，转完自动回到原位置。

## 看得见的效果

| 场景 | 你会看到 |
| --- | --- |
| 打开 DSH | 上次选的皮肤与壁纸直接恢复 |
| 换壁纸 | 设置页实时预览缩略效果，应用后立即生效 |
| 看视频壁纸 | 右下角透明播放带：集号、进度轨道、`当前 / 总长`；`F7/F8/F9` 切换与暂停，双击进整页全屏 |
| 想安静 | 播放带停止操作 23 秒自动淡出；全屏 `Esc` 退出；纯净模式只留内容 |
| 想换一批 | 整个文件夹拖进来，自动成为播放列表 |

## 全部功能

| 分组 | 功能 |
| --- | --- |
| 皮肤 | 8 套预设；12 套自定义配色；9 套渐变；收藏与筛选 |
| 壁纸 | 图片壁纸；本地视频壁纸；图片/视频各上限 10,000 条 |
| 视频播放 | 多选 / 整目录 / 拖拽导入；播放列表；上一集/下一集；进度拖动；整页全屏；声音开关 |
| 快捷键 | `F7` 上一个、`F8` 播放/暂停、`F9` 下一个（也认系统媒体键；光标在输入框时不抢键） |
| 界面 | 半透明面板；问题卡片与回答气泡玻璃化；柔化壁纸（0–50%）；影院色板；毛玻璃快捷面板；实时预览 |
| 收纳 | 收藏与筛选（全部/收藏/我的照片/渐变）；最近使用 |
| 兜底 | 播放自检；文件丢失后重新关联；HEVC 代理；AAC 侧车 |
| 恢复 | 只重置皮肤、壁纸与选项，自定义内容保留 |

## 设计取舍

- **为什么用 `127.0.0.1` 路由，而不是 `file://`**：Electron 的 `file://` 不支持可靠的 Range/seek，也无法带每进程 token 做来源校验。回环路由能同时解决拖动、流式和大文件内存。
- **为什么用 IndexedDB 存视频**：localStorage 只有几 MB，放不下视频；IndexedDB 能存 Blob，也能在重启后恢复播放列表。
- **为什么需要 ffmpeg**：Chromium 不解码 E-AC-3 / DTS / TrueHD。没有 ffmpeg 时插件不会静音整段视频，而是回退到视频元素自己的音轨。
- **为什么有“纯净模式”**：壁纸是背景，不是主角。进入与退出都是独立快捷键，不依赖输入框焦点；全屏随时可用 `Esc` 退出。

## 兼容性

| 项 | 要求 |
| --- | --- |
| DeepSeek Harness | **0.2.2-rc.1** 或更高 |
| 系统 | macOS / Windows / Linux |
| 可选依赖 | `ffmpeg` / `ffprobe`（仅部分音轨与 HEVC 代理需要） |
| 浏览器内核 | Electron 自带 Chromium；不支持 Safari/Firefox 直接打开 |
| 文件选择 | macOS 走 `osascript`；其他系统用设置面板里的文件选择入口 |

## 常见问题

**Q：视频壁纸会拖慢 DSH 吗？**
A：只有当前视频在解码，其余列表项不预加载；通过 `Range` 流式读取，不会把整个文件读进内存。10 分钟以上的 4K 视频建议用 H.264/AAC。

**Q：为什么有的视频没有声音？**
A：Chromium 不解码 E-AC-3、DTS、TrueHD。装好 `ffmpeg` 后插件会自动生成 AAC 侧车；没有 ffmpeg 时会回退到视频自带的音轨。

**Q：必须装 ffmpeg 吗？**
A：不必须。只有上面那几种音轨、以及 HEVC 转代理时需要。普通 H.264/AAC 视频零依赖直接播。

**Q：会上传我的图片和视频吗？**
A：不会。插件没有远程接口；图片链接是你自己填的 URL，视频只通过 `127.0.0.1` 回环读取。

**Q：怎么彻底重置？**
A：设置页“恢复默认”只重置皮肤、壁纸与选项；要连自定义内容一起清空，清除该站点的 IndexedDB / 站点数据（会一并清掉自定义皮肤、壁纸和视频）。

**Q：安装后没生效？**
A：完全退出 DSH 再启动。设置页底部会显示 `BUILD` 时间，时间早于你刚装的版本，说明跑的还是旧 bundle。

## 数据与联网

| 内容 | 位置 |
| --- | --- |
| 当前选择与选项 | localStorage `dsh.skin-studio.v1` |
| 自定义皮肤、图片、视频 | IndexedDB `dsh-skin-studio`（version 2） |

插件不上传数据，也没有远程接口。只有两种操作会用到网络：壁纸填的是图片链接时，浏览器按该链接加载；视频通过本机路由 `/api/skin-studio/media`（回环 `127.0.0.1`，带每进程 token）流式返回。

## 已知限制

- HEVC / H.265 在 Electron 的 Chromium 里播放不流畅、跳转不可靠；插件检测到后会后台转 H.264 代理。
- E-AC-3、DTS、TrueHD 等音轨 Chromium 无法解码，需要 ffmpeg 生成 AAC 侧车。
- macOS 的“选择视频文件 / 选择文件夹”使用 `osascript`；其他系统请用设置面板里的文件选择入口。
- 自定义皮肤上限 12 套；自定义壁纸与视频各上限 10,000 条。
- 更多播放约束、回归清单与历史故障见 [docs/video-playback.md](docs/video-playback.md)。

## 其他安装方式

**profile link（跟随仓库更新）**

```bash
git clone https://github.com/ghostmss86-afk/dsh-mixin.git ~/plugins/dsh-mixin
```

在该 profile 的 `package.json` 中加入依赖与 bundle：

```json
{
  "dependencies": {
    "dsh-mixin": "link:/Users/you/plugins/dsh-mixin"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-mixin"]
    }
  }
}
```

在该 profile 目录执行 `pnpm install`，然后重启 DeepSeek Harness。

> 依赖键、`bundles` 与 `package.json` 的 `name` 必须都是 `dsh-mixin`，三者不一致时 loader 找不到插件。

## 开发

```bash
npm run verify        # 语法 + 接线 + 版本一致性 + 反模式，全部必过
npm run bump -- 1.0.7 # 同步 package.json / client.js / CHANGELOG（README 徽章由 shields.io 动态读取）
npm run check         # 模式与接线断言
npm run version:check # 只检查版本一致性
```

版本只有一个来源：`npm run bump` 会同时更新 `package.json`、`client.js` 的 `PLUGIN_VERSION` 与 `CHANGELOG.md`；README 顶部徽章由 shields.io 动态读取，不手写版本号。

## 反馈

- Bug / 功能请求：[GitHub Issues](https://github.com/ghostmss86-afk/dsh-mixin/issues)
- 更新记录：[CHANGELOG.md](CHANGELOG.md)
- 许可：[MIT](LICENSE)

---

## English

**dsh-mixin turns DeepSeek Harness into a room that can play a movie.** Eight preset skins, twelve custom palettes, nine gradients, and a real local-video wallpaper player: playlists, previous/next, seek, fullscreen, and sound.

**Install**

```bash
dsh plugin --profile web add dsh-mixin
```

Or install from the in-app plugin market by searching **dsh-mixin**. Requires DeepSeek Harness **0.2.2-rc.1+**. Fully quit and restart DSH after installing — a page refresh may keep the old bundle.

**Why it is different**

Most theme plugins change colors; most wallpaper plugins loop a silent clip. dsh-mixin treats the video wallpaper as a player: it streams through a loopback route with HTTP Range support (so seeking is instant), keeps a playlist, plays with sound, and goes fullscreen. Audio codecs Chromium cannot decode (E-AC-3 / DTS / TrueHD) are converted to an AAC sidecar with `ffmpeg` when available.

**Privacy**

No uploads, no remote API. Settings live in localStorage, media in IndexedDB; video is served only from `127.0.0.1` with a per-process token.

**Known limits**

HEVC may stutter and is transcoded to an H.264 proxy in the background; some surround codecs need `ffmpeg`; macOS file picking uses `osascript`; caps are 12 custom skins and 10,000 wallpapers/videos each.

**License** MIT.

