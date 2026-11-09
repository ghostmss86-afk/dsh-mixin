# 皮肤与壁纸（Skin Studio）

[![check](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml/badge.svg)](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.6-informational.svg)](CHANGELOG.md)
[![platform](https://img.shields.io/badge/platform-DSH%200.2.2--rc.1-lightgrey.svg)](#兼容性)

皮肤与壁纸是 DeepSeek Harness 的界面插件。它给界面换一套配色，并给聊天区铺上渐变、图片或视频壁纸；改动立即生效，选择保存在当前浏览器里。

![皮肤与壁纸面板与视频壁纸](docs/preview.webp)

## 功能

| 功能 | 说明 | 数量 / 前提 |
| --- | --- | --- |
| 预设皮肤 | 直接切换整套配色，同时覆盖浅色与深色 | 8 套 |
| 自定义皮肤 | 自选强调色与背景，保存后出现在「我的皮肤」 | 最多 12 套 |
| 渐变壁纸 | 内置渐变背景，随浅色 / 深色主题变化 | 9 套 |
| 图片壁纸 | 上传本地图片，或粘贴图片链接 | 最多 10000 张 |
| 视频壁纸 | 本地视频铺满聊天区：暂停 / 静音 / 音量 / 循环，进度条下方 `‹ n / N ›` 切上一个·下一个 | 最多 10000 个；非 AAC 音轨需要 ffmpeg |
| 视频批量导入 | 一次多选、整目录导入、文件与文件夹拖拽；导入即落真实路径 | 设置页与左下角快捷面板同能力 |
| 全屏播放 | 双击页面顶部空白条或播放器控制条进入全屏，再双击 / Esc 退出 | 触摸屏双击同样有效 |
| 播放自检 | 设置页直接写出「原文件 / 音轨 / 画面静音 / 声音来源」，一键复制 | 无需打开控制台 |
| 显示模式 | 自录两个快捷键：一个进纯净模式（隐藏整个界面，只留壁纸），一个回正常界面；各自一键锁定、再按解除 | 快捷键需含 Ctrl / ⌘ / Alt |
| 收藏与筛选 | 「全部 / 收藏 / 我的照片 / 渐变」四个筛选，点星标收藏 | — |
| 柔化壁纸 | 在壁纸上叠一层柔光，保证文字可读 | 0–50%，默认 12% |
| 半透明面板 | 让聊天卡片与侧栏透出壁纸 | 开关 |
| 实时预览 | 设置页显示当前皮肤与壁纸的缩略效果 | — |
| 恢复默认 | 只重置皮肤、壁纸与选项，自定义内容保留 | — |

## 安装

前置条件：DeepSeek Harness `0.2.2-rc.1`（本机验证版本）。视频壁纸的音频兜底需要 `ffmpeg` 与 `ffprobe` 在 `PATH` 里；没有时视频无声，画面正常。

### 方式零：插件市场（收录审核中）

已按官方目录规范提交收录，条目见 [`docs/market-entry.yml`](docs/market-entry.yml)。上架前请用下面任一方式安装。

### 方式一：从 GitHub 安装

```bash
dsh plugin --profile web add github:ghostmss86-afk/dsh-skin-studio
```

装完重启 DeepSeek Harness。之后升级用同一条命令加 `@<commit>` 或重装。

### 方式二：从 npm 安装（发布后可用）

```bash
dsh plugin --profile web add dsh-plugin-skin-studio
```

### 方式三：profile link（跟随仓库更新）

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

### 方式四：直接放目录

把仓库内容放到 profile 的 `node_modules/dsh-plugin-skin-studio`，bundle 配置同上。刷新页面即可生效。

> 依赖键、`bundles` 与 `package.json` 的 `name` 必须都是 `dsh-plugin-skin-studio`，三者不一致时 loader 找不到插件。

## 使用

- 入口一：左下角侧栏的「皮肤与壁纸」
- 入口二：设置 → 皮肤与壁纸
- 皮肤：点选预设，或在「自定义皮肤」里配色后保存，最多 12 套
- 壁纸：选渐变、上传图片或粘贴图片链接；点缩略图左侧星标收藏
- 视频壁纸：添加本地视频，播放器支持暂停、静音、音量与循环，进度条下方 `‹ n / N ›` 直接切上一个 / 下一个
- 视频批量上传：和图片一样一次多选，或点加号磁贴右上角的文件夹按钮直接导入整个目录（设置页和左下角快捷面板都有），也可以把文件 / 文件夹拖到磁贴
- 视频导入一律落真实文件路径：拖拽 / 普通文件框也会用「文件名 + 字节数」自动找回磁盘路径，避免退化成无声的 blob 记录
- 视频全屏：双击页面顶部空白条（或播放器控制条）进入全屏，再双击 / Esc 退出；播放时输入框区域保持透明，不糊字幕
- 视频没有声音时：设置页的「自检」行会直接写出原因（原文件 / 音轨 / 画面静音 / 声音来源）；卡片左下角的链接按钮可以手动重新关联原文件，插件启动时也会按「文件名 + 字节数」自动找回
- 显示模式：设置里的「显示模式」段，点一下录制框再按组合键，分别给「纯净模式」和「正常模式」各录一个。第一次按锁定该模式，再按一次解除；某一个锁定期间，另一个快捷键不生效（面板里会写出当前状态）。纯净模式连按两次 `Esc` 可应急退出
- 选项：「柔化壁纸」滑块与「半透明面板」开关

## 数据与联网

| 内容 | 位置 |
| --- | --- |
| 当前选择与选项 | localStorage `dsh.skin-studio.v1` |
| 自定义皮肤、图片、视频 | IndexedDB `dsh-skin-studio`（version 2） |

插件不上传数据，也没有远程接口。只有两种操作会用到网络：

- 壁纸填的是图片链接时，浏览器按该链接加载图片
- 视频壁纸通过本机路由 `/api/skin-studio/media` 读取本地文件并流式返回，不经过外网

清空站点数据会一并清掉自定义皮肤、壁纸和视频。

## 已知限制

- HEVC / H.265 在 Electron 的 Chromium 里播放不流畅、跳转进度也不可靠；插件检测到后会后台转成 H.264 代理再播，转码完成时会自动回到原来的播放位置
- E-AC-3、DTS、TrueHD 等音轨 Chromium 无法解码，插件会用 ffmpeg 生成 AAC 侧车；宿主没能提供侧车时，画面会直接用视频元素自己的音轨，而不是整体静音
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
| host 服务 | 需要 `webServer`；不可用时自动降级为纯皮肤模式 |

## 实现

- `client.js` 由 `window.__ModuleLoader__` 加载，负责全部界面与逻辑，通过 theme 服务注入配色 token，通过 settings 服务注册设置页
- `index.js` 注册 `/api/skin-studio/media` 前缀路由：`ping`、`prepare`（AAC 侧车）、`video`（Range 流）、`audio/*`、`proxy` / `proxy-file`（容器转封装）、`pick-folder`
- `cordis.patch.yml` 把插件插入 profile 的 loader 层

## 开发

```bash
npm run verify                  # 提交前必跑：语法 + 接线 + 版本一致性 + 反模式
npm run bump -- 1.0.7           # 改版本只用这个（四处一起改，并刷新 BUILD）
npm run check                   # 语法 + 显示模式接线
npm run version:check           # 版本四处是否一致
npm run guard                   # 媒体不变量静态检查
```

`npm run verify` 是唯一入口，CI、`pre-push`、`prepublishOnly` 跑的都是它。
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
