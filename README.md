# 皮肤与壁纸（Skin Studio）

[![check](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml/badge.svg)](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.34-informational.svg)](CHANGELOG.md)
[![npm](https://img.shields.io/npm/v/dsh-plugin-skin-studio.svg)](https://www.npmjs.com/package/dsh-plugin-skin-studio)
[![platform](https://img.shields.io/badge/platform-DSH%200.2.2--rc.1-lightgrey.svg)](#兼容性)

**把 DeepSeek Harness 变成一间能放电影的房间。**

铺一张本地视频当壁纸——**有声音**、能拖进度、整季连播、全屏看；不播视频时是渐变或图片。界面材质不是"盖一张图"，而是取 Harness 自己的颜色与毛玻璃参数，所以换了皮肤，侧边栏、面板、输入框光晕一起变。

![皮肤与壁纸面板与视频壁纸](docs/preview.webp)

## 三十秒看懂

- **视频壁纸是有声音的**。E-AC-3、DTS、TrueHD 这些 Chromium 解不了的音轨，插件用 `ffmpeg` 转一条 AAC 侧车轨同步播放，不是静音动画。
- **它是个播放器，不只是背景**。`Billions.S06E01.1080p.WEBRip…` 自动显示成 `Billions.S06E01`；同一目录 ≥2 集折叠成整季文件夹，点一下从第 1 集顺播到最后一集；F7 / F8 / F9 切换与暂停，双击进全屏。
- **右下角有一条透明播放带**：集号 → 透明轨道里的一只小鲸鱼 → `当前 / 总长`。按住鲸鱼左右拖＝调进度，点轨道任意位置＝跳到那一帧；窗口越窄轨道越短，窄到只剩鲸鱼时拖它也能调。
- **拖动真的会跳**。视频走本机回环 HTTP，支持 Range（206），所以浏览器愿意让你 seek；很多实现铺的是没有 Range 的流，`seekable` 是空的，一拖就弹回 0:00。
- **材质与 Harness 同源**。快捷面板直接用侧边栏的填充色 × 40% 不透明度 + 同一套 `blur(40px) saturate(150%)`；指针移到输入框上会亮起一圈跟随皮肤主色的淡蓝漫反射。

## 和市场上的同类不一样在哪

2026-11-11 抓取 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 目录（10446 条，其中「主题与外观」383 条）：带视频壁纸的条目 39 个，**描述里提到声音的只有 3 个**，其余是静音循环片段或图片。

| 插件（目录内 star） | 它做什么 | 差在哪 |
| --- | --- | --- |
| [`elysia395/dsh-wallpaper-engine`](https://github.com/elysia395/dsh-wallpaper-engine) 6210★ | 播 Wallpaper Engine 的 Video / Web 壁纸，Scene 壁纸抽成静帧，带分级筛选与液态玻璃设置窗 | 依赖 Wallpaper Engine 素材与 `dsh-better-sidebar`；面向「放动画」，不提供播放列表、集号、进度拖动 |
| [`Small-tailqwq/dsh-deep-whale--maid-atelier`](https://github.com/Small-tailqwq/dsh-deep-whale--maid-atelier) 3081★ | 鲸鱼少女主题皮肤系列 | 纯皮肤美术，不含壁纸与播放能力 |
| [`d-dev0101/open-sea-skin`](https://github.com/d-dev0101/open-sea-skin) 389★ | WebGPU 实时海面，带波浪/日照/玻璃透明度 | 一种程序化场景；不能放你自己的片源 |
| [`RevolutionLA/dsh-dream-skin`](https://github.com/RevolutionLA/dsh-dream-skin) 301★ | 8 套原创主题 + 半透明图片壁纸 + 主题包导入导出 | 壁纸是图片，不含视频与声音 |
| [`Something11235/dsh-video-skin`](https://github.com/Something11235/dsh-video-skin) 118★ | **静音**循环片段当聊天背景，带开机动画 | 明确是静音片段，没有音轨、没有进度控制 |
| [`LeeRolling/dsh-boot-suite`](https://github.com/LeeRolling/dsh-boot-suite) 111★ | 两幕开机动画 + 静态图 / **muted** 循环视频背景 | 同样静音；播放能力停留在「随机轮播」 |

一句话概括差异：**别人铺的是"背景动画"，这个插件铺的是"一场能停能拖能连播的电影"**，而且外壳和 Harness 原生 UI 是同一套材质。

## 快速开始

前置：DeepSeek Harness `0.2.2-rc.1`（本机实测）。视频要出声需要 `ffmpeg` 与 `ffprobe` 在 `PATH` 里；没有时画面正常、声音缺失。

```bash
# 从 npm 安装（推荐）
dsh plugin --profile web add dsh-plugin-skin-studio

# 或从 GitHub 安装
dsh plugin --profile web add github:ghostmss86-afk/dsh-skin-studio
```

装完重启 DeepSeek Harness。入口两处：**左下角侧栏「皮肤与壁纸」**，或**设置 → 皮肤与壁纸**。

> 想在插件市场里装：DSH 的「精选插件市场」读的是社区目录 <https://awesome-dsh-plugin.com>，本仓库已在目录里（[条目页](https://awesome-dsh-plugin.com/p/ghostmss86-afk/dsh-skin-studio/)），目录对 npm 的映射由站点自动抓取，无需人工提交。

## 看得见的效果

| 效果 | 具体表现 |
| --- | --- |
| 视频壁纸 | 本地视频铺满聊天区，带暂停 / 静音 / 音量 / 循环；播放时聊天卡片、用户气泡、工具卡片统一换成影院色板（深色半透明底 + 白字），日间模式也不会出现白底深字 |
| 右下角播放带 | 贴在与输入框同一栏的正上方、右边缘对齐；集号 + 透明轨道（小鲸鱼）+ `当前 / 总长`；暂停后不消失，换成图片 / 渐变才退出 |
| 进度拖动与跳转 | 按住小鲸鱼拖＝调进度；点轨道＝跳到该处并停住；拖到末尾停在末尾，不会从头重播 |
| 输入框光晕 | 指针靠近或点进输入框，外圈亮起约 50px 的淡蓝漫反射，提示"这里能打字"；颜色跟随所选皮肤主色 |
| 同源毛玻璃 | 快捷面板复用侧边栏的填充色 × 40% + `blur(40px) saturate(150%)`，比侧边栏更透一档，和原生浮层同一套配方 |
| 剧集卡片 | 封面 + 精简剧名 + 集号；同目录 ≥2 集折成文件夹卡片（`S06E01 – S06E12`），从第 1 集顺播，上一集 / 下一集不跑出该文件夹 |
| 全屏播放 | 双击页面顶部空白条（或播放器控制条）进全屏，再双击 / Esc 退出；播放时输入框区域保持透明，不糊字幕 |
| 界面自动隐藏 | 播放视频时停止操作 23 秒淡出界面，只留画面；光标在输入框里时永不触发，可在设置里关闭 |
| 显示模式 | 自录两个快捷键：进「纯净模式」（只留壁纸）与回「正常模式」，各自一键锁定、再按解除，进入时底部给 3.2 秒退出提示 |

## 全部功能

| 功能 | 说明 | 数量 / 前提 |
| --- | --- | --- |
| 预设皮肤 | 直接切换整套配色，同时覆盖浅色与深色 | 8 套 |
| 自定义皮肤 | 自选强调色与背景，保存后出现在「我的皮肤」 | 最多 12 套 |
| 渐变壁纸 | 内置渐变背景，随浅色 / 深色主题变化 | 9 套 |
| 图片壁纸 | 上传本地图片，或粘贴图片链接 | 最多 10000 张 |
| 视频壁纸 | 本地视频铺满聊天区：暂停 / 静音 / 音量 / 循环，F7 / F9 切上一个·下一个 | 最多 10000 个；非 AAC 音轨需要 ffmpeg |
| 视频卡片 | 封面 + 精简剧名 + 集号；默认按季、集升序 | 设置页与左下角快捷面板同一套卡片 |
| 剧集文件夹 | 同一目录 ≥2 集自动折叠成文件夹卡片，显示起止集号与总集数；点一下整季顺播 | 需要导入时拿到真实路径 |
| 视频批量导入 | 一次多选、整目录导入、文件与文件夹拖拽；导入即落真实路径 | 设置页与快捷面板同能力 |
| 全屏播放 | 双击页面顶部空白条或播放器控制条进入全屏，再双击 / Esc 退出 | 触摸屏双击同样有效 |
| 播放自检 | 设置页写出「原文件 / 音轨 / 画面静音 / 声音来源 / 源 / 网络 / 就绪」，一键复制 | 无需打开控制台 |
| 显示模式 | 自录纯净模式与正常模式快捷键，各自锁定 / 解除；密码库入口移到设置里 | 快捷键需含 Ctrl / ⌘ / Alt |
| 界面自动隐藏 | 播放视频时停止操作 23 秒淡出界面 | 设置里可关闭；光标在输入框时不触发 |
| 硬件按键 | F7 上一个 / F8 播放暂停 / F9 下一个（也认系统媒体键） | 光标在输入框时不抢键 |
| 右下角播放带 | 集号 + 透明轨道（小鲸鱼）+ `当前 / 总长`，宽度随窗口伸缩 | 只在视频壁纸下出现 |
| 进度拖动与跳转 | 拖鲸鱼＝调进度；点轨道＝跳转并停住；拖到末尾停在末尾 | 末端留 0.5 秒余量 |
| 输入框光晕 | 指针到输入框时外圈亮起约 50px 淡蓝漫反射 | 跟随皮肤主色，默认 DeepSeek 蓝 |
| 快捷面板材质 | 与侧边栏同源毛玻璃：填充色 × 40% + `blur(40px) saturate(150%)` | 比侧边栏更透一档 |
| 收藏与筛选 | 「全部 / 收藏 / 我的照片 / 渐变」四个筛选，点星标收藏 | — |
| 柔化壁纸 | 在壁纸上叠柔光，保证文字可读 | 0–50%，默认 12% |
| 视频背景对比度 | 视频播放时统一影院色板，避免白底深字 | 仅视频背景 |
| 半透明面板 | 让聊天卡片与侧栏透出壁纸 | 开关 |
| 实时预览 | 设置页显示当前皮肤与壁纸的缩略效果 | — |
| 恢复默认 | 只重置皮肤、壁纸与选项，自定义内容保留 | — |

## 其他安装方式

### 方式一：profile link（跟随仓库更新）

```bash
git clone https://github.com/ghostmss86-afk/dsh-skin-studio.git ~/plugins/skin-studio
```

在该 profile 的 `package.json` 中加入依赖与 bundle：

```json
{
  "dependencies": {
    "dsh-plugin-skin-studio": "link:/Users/you/plugins/skin-studio"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-plugin-skin-studio"]
    }
  }
}
```

在该 profile 目录执行 `pnpm install`，然后重启 DeepSeek Harness。

### 方式二：直接放目录

把仓库内容放到 profile 的 `node_modules/dsh-plugin-skin-studio`，bundle 配置同上。刷新页面即可生效。

> 依赖键、`bundles` 与 `package.json` 的 `name` 必须都是 `dsh-plugin-skin-studio`，三者不一致时 loader 找不到插件。

## 使用

- 皮肤：点选预设，或在「自定义皮肤」里配色后保存，最多 12 套
- 壁纸：选渐变、上传图片或粘贴图片链接；点缩略图左侧星标收藏
- 视频壁纸：添加本地视频，播放器支持暂停、静音、音量与循环；右下角播放带的轨道可点、鲸鱼可拖
- 视频卡片：每张显示封面、精简剧名和集号（如 `Billions.S06E01`），默认按季、集排序；原始文件名保留在悬停提示里
- 剧集文件夹：同一文件夹 ≥2 集收成一张文件夹卡片，显示起止集号与总集数；点卡片从第 1 集开始顺播，F7/F8/F9 只在当前文件夹内切换
- 视频批量上传：一次多选，或点加号磁贴右上角的文件夹按钮导入整个目录，也可以把文件 / 文件夹拖到磁贴
- 视频导入一律落真实文件路径：拖拽 / 普通文件框也会用「文件名 + 字节数」找回磁盘路径，避免退化成无声的 blob 记录
- 视频没有声音时：设置页「自检」直接写出原因（原文件 / 音轨 / 画面静音 / 声音来源 / 源 / 网络 / 就绪）；卡片左下角的链接按钮可手动重新关联原文件
- 排查加载失败：控制台运行 `window.__skinStudioDiag()` 打印当前状态；最近 20 条媒体事件记在 localStorage 的 `debugLog` 里
- 选项：「柔化壁纸」滑块、「半透明面板」开关

## 数据与联网

| 内容 | 位置 |
| --- | --- |
| 当前选择与选项 | localStorage `dsh.skin-studio.v1` |
| 自定义皮肤、图片、视频 | IndexedDB `dsh-skin-studio`（version 2） |

插件不上传数据，也没有远程接口。只有两种操作会用到网络：

- 壁纸填的是图片链接时，浏览器按该链接加载图片
- 视频壁纸通过本机路由 `/api/skin-studio/media`（回环 `127.0.0.1`，带每进程 token）读取本地文件并流式返回，不经过外网

清空站点数据会一并清掉自定义皮肤、壁纸和视频。

## 已知限制

- HEVC / H.265 在 Electron 的 Chromium 里播放不流畅、跳转进度也不可靠；插件检测到后会后台转成 H.264 代理再播，转码完成时自动回到原播放位置
- E-AC-3、DTS、TrueHD 等音轨 Chromium 无法解码，插件用 ffmpeg 生成 AAC 侧车；宿主没能提供侧车时，画面会直接用视频元素自己的音轨，而不是整体静音
- 声音与进度条的约束、回归清单和历史故障见 [docs/video-playback.md](docs/video-playback.md)
- 「选择视频文件 / 选择文件夹」使用 macOS 的 `osascript`；其他系统请用设置面板里的文件选择入口
- 自定义皮肤上限 12 套，自定义壁纸与视频各上限 10000 条

## 目录结构

```
skin-studio/
├── client.js          # 浏览器侧：皮肤、壁纸、设置面板
├── index.js           # host 侧：媒体路由、ffmpeg 兜底
├── cordis.patch.yml   # loader 插入声明
├── locale/
│   ├── en.json
│   └── zh.json
├── docs/
│   ├── preview.webp      # 界面截图
│   ├── market-entry.yml  # 插件市场的收录条目
│   ├── video-playback.md # 视频声音/进度条的不变量与回归清单
│   └── display-modes.md  # 显示模式的状态机与接线说明
├── scripts/
│   ├── guard.mjs         # 媒体不变量静态检查
│   ├── guard.rules.json  # 规则即数据
│   ├── check-modes.mjs   # 显示模式的接线检查
│   ├── check-version.mjs # 版本四处一致性
│   └── bump.mjs          # 一次改完四处版本 + BUILD
├── icon.svg
├── package.json
├── CHANGELOG.md
└── LICENSE
```

## 兼容性

| 项目 | 状态 |
| --- | --- |
| DeepSeek Harness | `0.2.2-rc.1`，已在本机 macOS 验证 |
| 客户端注入点 | `@deepseek-ai/dsh-client-locale`、`-ui-layout`、`-ui-settings`、`-ui-sidebar`、`-ui-theme` |
| host 服务 | 优先用 `connection.fetch` 注册精确路由；旧宿主回退到 `webServer` 前缀注册，两者都不可用时降级为纯皮肤模式 |

## 实现

- `client.js` 由 `window.__ModuleLoader__` 加载，负责全部界面与逻辑，通过 theme 服务注入配色 token，通过 settings 服务注册设置页
- `index.js` 注册 13 条 `/api/skin-studio/media/*` 精确路由：`ping`、`origin.js`、`prepare`（AAC 侧车）、`video`（Range 流）、`audio`（侧车音频）、`poster`（封面）、`pick` / `pick-many` / `pick-folder`、`relink`、`proxy` / `proxy-file`（容器转封装）、`report`；同时启动只监听 `127.0.0.1` 的随机端口媒体服务器，路径带每进程 token
- `cordis.patch.yml` 把插件插入 profile 的 loader 层

## 开发

```bash
npm run verify                  # 提交前必跑：语法 + 接线 + 版本一致性 + 反模式
npm run bump -- 1.0.35          # 改版本只用这个（四处一起改，并刷新 BUILD）
npm run check                   # 语法 + 显示模式接线
npm run version:check           # 版本四处是否一致
npm run guard                   # 媒体不变量静态检查
```

`npm run verify` 是唯一入口，CI、`pre-push`、`prepublishOnly` 跑的都是它。

`npm run bump` 会自动改四处版本号（`package.json`、`client.js` 的 `PLUGIN_VERSION` / `BUILD`、README 徽章），
但**不会**改 CHANGELOG 与这份 README 的正文——功能说明每次发版都得手写补一段。
改动约定写在仓库根的 `AGENTS.md`：版本单一来源、同一能力单一实现、新增组件必须证明被 mount、
隐藏界面的功能必须有出口。

`scripts/guard.mjs` 与规则来自 [engineering-lessons](https://github.com/ghostmss86-afk/engineering-lessons)，
拦的是这个插件历史上真实踩过的坑（`file://` 音源、丢路径的 Blob 导入、`public.movie` 过滤等）。
`docs/video-playback.md` 是这些坑的完整说明与回归清单。

`scripts/check-modes.mjs` 拦的是另一类事故：功能、文案、样式都写了，但组件没被 mount、
或者隐藏规则把壁纸层一起藏掉。纯文本检查，无依赖，`npm run check` 与 CI 都会跑。

## 反馈

- 问题与建议：仓库 [Issues](https://github.com/ghostmss86-afk/dsh-skin-studio/issues)
- 版本变化：[CHANGELOG.md](CHANGELOG.md)

如果这个插件对你有用，点一下仓库右上角的 Star，方便下次找到。

## 许可

MIT，见 [LICENSE](LICENSE)。
