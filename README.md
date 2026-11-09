# 皮肤与壁纸 · Skin Studio

给 DeepSeek Harness 的界面换一套配色，再铺一张聊天壁纸。预设皮肤、自定义配色、图片壁纸、视频壁纸、收藏夹和实时预览都在同一处，改动即时生效，并记住在当前浏览器里。

A local-first appearance plugin for DeepSeek Harness: color skins plus image / video chat wallpapers, with live preview and per-browser persistence.

![settings entry](icon.svg)

## 功能

- **预设皮肤**：一组可直接切换的配色方案，浅色 / 深色 / 跟随系统。
- **自定义皮肤**：最多保存 12 套自己的配色，可命名、可删除。
- **壁纸**：渐变、上传本地图片、粘贴图片链接三种来源；带分类与收藏星标。
- **视频壁纸**：本地视频直接铺满聊天背景，自动处理容器里 Chromium 解不了的音轨。
- **可读性选项**：壁纸柔化、聊天卡片与侧栏半透明强度，避免文字压在花哨背景上。
- **实时预览**：设置面板里就是当前界面的缩略效果，改一个值立刻看到结果。
- **一键恢复**：恢复默认只重置皮肤、壁纸和选项，自定义内容仍然保留。

## 安装

本插件以 DSH profile 的本地 link 方式接入，拷到任意路径后：

1. 在 profile 的 `package.json` 里加依赖：

   ```json
   {
     "dependencies": {
       "@local/skin-studio": "link:/absolute/path/to/skin-studio"
     },
     "dsh": {
       "profile": {
         "bundles": ["@local/skin-studio"]
       }
     }
   }
   ```

2. 在 profile 目录执行 `pnpm install`。
3. 重启 DeepSeek Harness，或刷新 Web GUI；入口在 **设置 → 皮肤与壁纸**，侧栏也有一个快捷入口。

视频壁纸的音频兜底需要 `ffprobe` / `ffmpeg` 在 `PATH` 里；缺失时插件只跳过音频侧车，画面仍然正常。

## 使用

- 侧栏「皮肤与壁纸」按钮可快速切换皮肤与壁纸。
- 设置页里：预设皮肤、我的皮肤、壁纸库、收藏、选项。
- 壁纸左侧星标收藏；分类为空时会提示。
- 自定义皮肤上限 12 套，自定义壁纸与视频上限很高（按浏览器存储能力决定）。

## 数据存放

| 内容 | 位置 |
| --- | --- |
| 当前选择与选项 | `localStorage` key `dsh.skin-studio.v1` |
| 自定义皮肤、壁纸、视频 | IndexedDB `dsh-skin-studio`（version 2） |

数据只存在当前浏览器 / 当前设备，不上传、不联网。

## 实现

- `client.js`：浏览器侧全部 UI 与逻辑，通过 `window.__ModuleLoader__` 加载，注入 `@deepseek-ai/dsh-client-locale`、`-ui-layout`、`-ui-settings`、`-ui-sidebar`、`-ui-theme`。
- `index.js`：host 侧只做媒体辅助，注册 `/api/skin-studio/media` 前缀路由：
  - `ping` 健康检查；
  - `prepare` 为无兼容音轨的视频生成 AAC 侧车（缓存在系统临时目录）；
  - `pick-folder` / `video` 选择并流式播放本地视频（支持 Range）；
  - `audio/*` 输出侧车音频；
  - `proxy` / `proxy-file` 把浏览器解不了的封装转成可播放的 MP4。
- `cordis.patch.yml`：把插件插进 profile 的 loader 层。

## 目录

```
skin-studio/
├── client.js          # 浏览器侧：皮肤、壁纸、设置面板
├── index.js           # host 侧：媒体路由与 ffmpeg 兜底
├── cordis.patch.yml   # loader 插入声明
├── locale/
│   ├── en.json
│   └── zh.json
├── icon.svg
└── package.json
```

## 兼容性

- 在 DeepSeek Harness `0.2.2-rc.1`（macOS，Electron）上开发与验证。
- 依赖 DSH 的 client 注入点与 `webServer` 服务；缺少 `webServer` 时自动降级为纯皮肤模式。
- 视频 seek 受 Chromium 解码能力限制：HEVC 可以播放但无法任意跳转，需要进度控制时请换 H.264。

## 许可

MIT，见 [LICENSE](LICENSE)。
