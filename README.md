# 皮肤与壁纸（Skin Studio）

[![check](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml/badge.svg)](https://github.com/ghostmss86-afk/dsh-skin-studio/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.1-informational.svg)](CHANGELOG.md)
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
| 视频壁纸 | 本地视频铺满聊天区，可暂停、静音、调音量、循环播放 | 最多 10000 个；非 AAC 音轨需要 ffmpeg |
| 收藏与筛选 | 「全部 / 收藏 / 我的照片 / 渐变」四个筛选，点星标收藏 | — |
| 柔化壁纸 | 在壁纸上叠一层柔光，保证文字可读 | 0–50%，默认 12% |
| 半透明面板 | 让聊天卡片与侧栏透出壁纸 | 开关 |
| 实时预览 | 设置页显示当前皮肤与壁纸的缩略效果 | — |
| 恢复默认 | 只重置皮肤、壁纸与选项，自定义内容保留 | — |

## 安装

前置条件：DeepSeek Harness `0.2.2-rc.1`（本机验证版本）。视频壁纸的音频兜底需要 `ffmpeg` 与 `ffprobe` 在 `PATH` 里；没有时视频无声，画面正常。

### 方式一：profile link（跟随仓库更新）

```bash
git clone https://github.com/ghostmss86-afk/dsh-skin-studio.git ~/plugins/skin-studio
```

在该 profile 的 `package.json` 中加入依赖与 bundle：

```json
{
  "dependencies": {
    "@local/skin-studio": "link:/Users/you/plugins/skin-studio"
  },
  "dsh": {
    "profile": {
      "bundles": ["@local/skin-studio"]
    }
  }
}
```

在该 profile 目录执行 `pnpm install`，然后重启 DeepSeek Harness。

### 方式二：直接放目录

把仓库内容放到 profile 的 `node_modules/@local/skin-studio`，bundle 配置同上。刷新页面即可生效。

> 包名固定为 `@local/skin-studio`，与 profile 的依赖键一一对应；改名后 loader 找不到插件。

## 使用

- 入口一：左下角侧栏的「皮肤与壁纸」
- 入口二：设置 → 皮肤与壁纸
- 皮肤：点选预设，或在「自定义皮肤」里配色后保存，最多 12 套
- 壁纸：选渐变、上传图片或粘贴图片链接；点缩略图左侧星标收藏
- 视频壁纸：添加本地视频，播放器支持暂停、静音、音量与循环
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

- HEVC / H.265 在 Electron 的 Chromium 里能播放，但不能任意跳转进度；需要拖动进度条时请换 H.264
- E-AC-3、DTS、TrueHD 等音轨 Chromium 无法解码，插件会用 ffmpeg 生成 AAC 侧车；缺少 ffmpeg 时视频无声
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
├── docs/preview.webp  # 界面截图
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

## 反馈

- 问题与建议：仓库 [Issues](https://github.com/ghostmss86-afk/dsh-skin-studio/issues)
- 版本变化：[CHANGELOG.md](CHANGELOG.md)

如果这个插件对你有用，点一下仓库右上角的 Star，方便下次找到。

## 许可

MIT，见 [LICENSE](LICENSE)。
