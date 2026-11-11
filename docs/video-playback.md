# 视频壁纸：声音与播放器的固定做法

这份文档记录**不变量**（改动时必须成立的约束）、**回归清单**和**历史故障**。
每次改视频相关代码前后都按这里的清单过一遍，避免"改好又改坏"。

## 一、不变量

1. **声音只有一个权威来源。**
   `<video>` 默认出声；只有当宿主明确返回了转码侧车（`reason: 'transcoded'`）时才静音视频、改播 `<audio>`。
   禁止用"编码白名单"或客户端猜测来决定静音 —— 猜错一次就是"有画面没声音"。

2. **`file://` 永远不是可用的媒体地址。**
   页面是 http 源，`file://` 必然加载失败。任何来自宿主的 `url` 都要过 `usableAudioUrl()`：
   空串或 `file:` 前缀一律视为"没有音轨"。历史记录（localStorage / IndexedDB）在读取时也要清洗。

3. **静音只是会话状态。**
   壁纸插件重启后必须是有声的。不要把 `videoMuted` 持久化后原样恢复 —— 那会让"上次手滑点过静音"
   在每次启动时重现为"没声音"的 bug。

4. **进度条的所有权归用户。**
   拖动期间和 seek 落地后的 ~320ms 内，rAF 不得写 `progress`；否则 `currentTime` 还是旧值，
   滑块会"回弹"。进度条在指针悬停或拖动时不得自动隐藏。

5. **切换媒体源必须保住播放位置。**
   容器不兼容时会热切到转码后的代理文件，`src` 变更会让元素回到 0:00。
   切之前记住 `currentTime`，`loadedmetadata` 后恢复。

6. **每条视频记录必须带真实文件路径。**
   宿主的所有能力（Range 流、ffprobe、ffmpeg 侧车）都建立在路径之上。
   Electron 32+ 删除了 `File.path`，凡是靠 `<input type=file>` 落成 IndexedDB blob 的记录都是
   "没有路径"的记录：画面能播，但只要音频是 E-AC-3 / DTS / TrueHD，就**必然无声**，而且宿主
   连补救的机会都没有。因此：
   - 导入路径优先：原生多选 `/pick-many` > 文件夹 `/pick-folder` > `<input>` 兜底；
   - 已存在的无路径记录要**自愈**：`/relink?name=&size=` 按文件名 + 精确字节数在
     `~/Downloads`、`~/Desktop`、`~/Movies`、`~/Documents`、`~/Pictures`（`-maxdepth 6`）里找回原文件，
     命中后写回 `sourcePath`、删掉 blob、重新准备音轨；
   - 自愈失败时卡片左下角保留"重新关联原文件"按钮（手动选一次）。
   - **兜底导入也必须带路径**：拖拽、`<input multiple>`、`<input webkitdirectory>` 拿到的 `File` 都没有路径，
     所以写库前先用 `file.name + file.size` 调 `/relink`（4 路并发）拿回真实路径；
     拿不到才允许落 blob，并在导入结束后、以及每次页面加载时各补扫一次。
   - 路径找回后不要并发转码：整季 12 集同时 ffmpeg 会把机器拖死。统一走 `prewarmAudio()` 串行队列。

7. **编码与容器不是一回事。**
   同一个文件可能"画面能解、声音不能解"（h264 + E-AC-3 的 MKV 就是典型）。
   判断"有没有声音"只能看宿主对**音频流**的 ffprobe 结果，不能看视频编码，也不能看扩展名。

8. **文件选择器不得按 `public.movie` 过滤。**
   macOS 只把 mp4/mov 认成 `public.movie`，`.mkv`、`.ts`、`.m2ts` 会被对话框置灰 ——
   用户看到的就是「只能一个一个加」。原生对话框一律选「所有文件」，扩展名由 `isVideoName()` 自己筛。

9. **快捷面板与设置页的视频入口必须同能力。**
   两处都支持：多选、整目录导入（`/pick-folder`，递归 + 自然排序）、拖拽文件/文件夹。

10. **视频壁纸下界面不上毛玻璃。**
   输入框区域（`[data-composer-seat]` / `[data-composer-dock]`）禁止 `backdrop-filter` 与渐变遮罩，
   否则糊住画面里的字幕。全屏播放用双击顶部空白条（或控制条）切换。
   例外：临时性的问题卡片 / 回答气泡可以用半透明玻璃，它们不常驻在字幕上方。

11. **全屏要能盖住工作界面。**
    全屏请求必须落在 `document.documentElement`，不是 `<video>`：元素全屏会把视频放进浏览器顶层，
    任何应用界面都盖不上去。整页全屏后视频层仍是背景，工作界面按指针意图叠加在画面上：
    连续移动指针 1 秒浮现，停下约 1 秒淡出；窗口模式与全屏共用同一套逻辑，过渡 2.4s 无级缓动。

12. **自动播放被拦要能自愈。**
   有声自动播放需要用户手势，`play()` 会以 `NotAllowedError` 拒绝。
   必须在 `pointerdown` / `keydown` / `focus` / `visibilitychange` 上重试，
   不能让元素停在"UI 显示在播、实际 paused"的状态。

## 二、改动前后的回归清单

| # | 操作 | 期望 |
|---|------|------|
| 1 | 选一个普通 mp4（AAC）播放 | 有声；`__skinStudioDiag().verdict === 'playing'` 且 `video.muted === false` |
| 2 | 点静音按钮再点回来 | 声音跟着切换，图标状态一致 |
| 3 | 完全退出 App 再打开 | 仍然有声（静音不跨会话） |
| 4 | 拖动进度条，松手在轨道外 | 视频跳到目标位置，滑块不回弹 |
| 5 | 鼠标停住约 1 秒 | 工作界面淡出；播放器控制条仍在；输入框有焦点时永不淡出 |
| 6 | 选一个 MKV/HEVC，等转码完成 | 画面切到代理后仍在原时间点，不回到 00:00 |
| 7 | 文件夹导入 5 个视频 | 全部进入列表，`‹ n/5 ›` 可连续切换 |
| 8 | 播放 E-AC-3 的 MKV | 首次 ~40 秒后有声；`__skinStudioDiag()` 显示 sidecar 有 `currentTime` 在走 |
| 9 | 旧版本留下的无路径记录 | 启动后自动找回原文件（设置页出现"已关联原文件"提示），卡片左下角链接按钮消失 |
| 10 | 无路径且找不到原文件 | 卡片左下角出现链接按钮，点击可手动选文件；选完立即有声 |
| 11 | 快捷面板点「＋」右上角文件夹按钮 | 弹出**目录**对话框，选一季目录后整季进入列表并可 `‹ n/N ›` 连播 |
| 12 | 选择器里看 `.mkv` 剧集 | 文件是可选的（不再置灰） |
| 13 | 双击页面顶部空白条 | 整页全屏，背景视频继续播放，工作界面可在画面上淡入；再双击或 Esc 退出 |
| 14 | 播放视频时看输入框区域 | 无毛玻璃、无渐变，能看清画面字幕 |
| 15 | 把一季目录**拖**到磁贴上 | 记录 `sourcePath` 非空（`__skinStudioDiag()`），没有多 GB 的 IndexedDB blob |
| 16 | 整季拖入后连按「下一集」 | 每集都有声（预热队列已把侧车备好），不需要等 40 秒 |

## 三、历史故障（不要再犯）

| 版本 | 现象 | 根因 |
|------|------|------|
| 1.0.0 | 有画面没声音 | 宿主对"原生支持"的音轨返回 `file://` 假侧车，客户端据此把 `<video>` 永久静音 |
| 1.0.0 | 进度条回弹 / 拖不动 | rAF 每帧用旧的 `currentTime` 覆盖 `progress`；播放器 2.6s 自动隐藏会在拖动中途 `pointer-events:none` |
| 1.0.0 | 转码完成后回到 00:00 | 代理文件替换 `src`，元素重新加载 |
| 1.0.1 | 自动播放被拦后一直静音 | `play()` 拒绝后没有手势重试，UI 仍显示"播放中" |
| 1.0.2 | 重启、刷新都"还是没声音" | 记录里 `sourcePath: null`（Electron 32 无 `File.path`，导入即变 blob），宿主拿不到路径就永远做不出 AAC 侧车；而片源恰好是 h264 + **E-AC-3**，Chromium 解不了，于是画面正常、声音为零 |

## 四、改了却没生效？

Web GUI **每次启动都换端口**（如 `127.0.0.1:18787` → `:61921` → `:65187`），
所以同一进程内刷新页面可能命中磁盘缓存、拿到旧 bundle。
判断方法：设置页版本行显示 `v1.0.2 · build <时间戳>`，或控制台执行 `__skinStudioDiag().build`。

- 只改了 `client.js`：刷新页面即可（必要时硬刷新）。
- 改了 `index.js`（宿主路由）：必须**完全退出 App 再打开**，刷新不重载宿主。

## 五、诊断

```js
__skinStudioDiag()
// { build, version, videoId, video: { src, paused, muted, volume, currentTime,
//   duration, readyState, error }, sidecar: {...} | null, verdict: 'playing' }
```

`verdict` 直接给出结论：`MUTED with no audible sidecar` / `paused (playback blocked or toggled off)` / `playing`。

---

## 六、空的 src 会伪装成「视频坏了」

`HTMLMediaElement.play()` 在元素**没有可用源**时以 `NotSupportedError` 拒绝，并且
**不派发 `error` 事件**。这组症状极具误导性：

- 页面没有报错，`error` 监听器一次都不触发；
- 画面停在第一帧，看起来像解码失败；
- 文件、编码、路径全都正常。

结论：`src` 必须在**首帧渲染**就能算出来。任何「先渲染空 src，等异步结果再补」
的写法，都会在刷新后变成这个 bug。本项目用 `videoRoute(sourcePath)` 同步拼路由，
`fullUrl` 只作为运行期加速缓存，不作为唯一来源。

另外，桌面端 UI 跑在 `dsh-app://app`，该 scheme 能 `fetch` 但媒体元素播不了；
`/ping` 返回真实 HTTP origin，`mediaPath()` 统一拼绝对地址，并清掉旧端口的绝对 URL。

## 七、自动播放与「界面自己消失」

- 带声音的自动播放会被浏览器拒绝，`play()` 抛 `NotAllowedError`。**必须**回落为 `muted` 播放并在第一次手势后恢复音量；让元素停在第一帧等于「视频坏了」。
- 「自动隐藏界面」只在视频播放且设置开关开启时生效，并且在文本输入有焦点时无条件让位。节奏是指针意图驱动的：停下约 1 秒后 `#root` 用 2.4s 缓动淡出；隐藏后要连续移动指针 1 秒才淡入，轻推一下不会整屏闪烁。
- 全屏必须整页全屏（`document.documentElement`），否则视频独占浏览器顶层，工作界面永远盖不上去。整页全屏下 `Esc` 仍然是系统级出口。
- 进入全隐藏模式必须留下可见的出口提示（本插件在 `body` 上挂 3.2 秒的提示条），并保留 `Esc` 连按两次的硬出口。
- `debugLog`（最近 20 条）记录模式切换、拦截、自动退出、视频错误与 `play()` 失败，排查先读它，不要靠截图猜。

## 八、自动检查（防复发）

上面这些不变量不靠记忆，靠 `scripts/guard.mjs` 静态检查，CI 与 `pre-push` 都会跑：

```bash
npm run guard        # 等价于 node scripts/guard.mjs --root . --rules scripts/guard.rules.json
```

它会对本仓库代码里的历史反模式直接报错并给出「为什么 / 怎么改」：

| 规则 | 拦什么 |
| --- | --- |
| R001 | 出现 `file://` 媒体地址 |
| R002 | `data.url \|\| data.file` 这类"备用字段当音源" |
| R003 | `webkitdirectory` / `<input type=file>` 存在但仓库里没有 `relink` 路径找回 |
| R004 | AppleScript 里 `public.movie` 过滤 |
| R005 | `muted = hasSidecar ?` 但没有 `sidecarBroken` 兜底 |
| R006 | composer 区域未清除 `backdrop-filter` |
| R007 | `videoMuted` 被写入非 `false` 的值 |
| R008 | 空的 `catch`，自愈失败静默 |

规则来源与事故复盘在另一个仓库：`ghostmss86-afk/engineering-lessons`（`lessons/2026-11-silent-video-wallpaper.md`）。
改规则请改那边再同步过来，不要在本地偷偷放宽。

## 九、两条传输通道：为什么自定义 scheme 不行

桌面端界面跑在 `dsh-app://app`。这个 scheme 是宿主注册的协议处理器，转发小文件没问题，
但**大文件的 Range 请求会被丢掉**：`<video>` 拿不到 206，最终以 `NotSupportedError`
拒绝 `play()`，页面只剩第一帧。

所以媒体必须走两条腿里正确的那条：

| 通道 | 用途 | 限制 |
| --- | --- | --- |
| 应用同源（`dsh-app://app/api/...`） | API：`prepare` / `proxy` / `relink` / `pick*` / `report` | 带会话 cookie；**不能流式播放大文件** |
| 回环 HTTP（`http://127.0.0.1:<随机端口>/<令牌>/api/...`） | 媒体：`video` / `audio` / `proxy-file` | 只服务这三类，令牌无效即 403 |

`mediaPath()` 只在匹配 `MEDIA_ASSET` 时改写为回环地址，API 永远留在应用源——否则
`prepare` 会被打到只服务媒体的端口上，直接 404。

客户端启动时 `GET /api/skin-studio/media/ping` 拿到 `mediaServer`，写进
`window.__skinMediaOrigin`，然后 **`store.touch()` 触发重渲染**。少了这一步，首帧
还是相对地址，元素永远起不来——这是「改完看起来没生效」的常见来源。

## 十、先验证传输，再怀疑解码

本次故障排查中，`ffprobe` 显示 h264+aac（完全可播）、文件也在，但播放仍然失败。
真正的方法是**分别验证三层**：

1. 文件层：`ffprobe` 有没有音视频流、编码是什么；
2. 传输层：对同一个 URL 发 `Range: bytes=0-1023`，看是否 206、`content-type` 对不对、
   文件头是否是 `ftyp`；
3. 元素层：`play()` 的 rejection `name` 是 `NotSupportedError`（没有源）还是
   `NotAllowedError`（自动播放策略）。

三层里任何一层不验，就会在另外两层里瞎猜。`scripts/check-media.mjs` 把第 2 层的
关键约束（回环服务存在、令牌校验、资产才改写）变成了可执行的断言。

## 十一、宿主半身没挂载时，界面看起来完全正常

1.0.16 之前，`apply()` 的第一件事是：

```js
const webServer = ctx.get('webServer');
if (!webServer) return;            // ← 静默返回，什么都不会注册
```

宿主早就换成了 `ctx.connection.fetch.register({ path, methods, requestBody, fetch })`，
所以这段代码每次都直接 `return`。后果是**所有**宿主能力同时消失：回环媒体服务没起、
`/ping` `/pick` `/poster` `/video` `/report` 全是 404。而设置页仍然渲染（客户端 bundle
独立加载），卡片、鲸鱼、按钮都在——用户看到的就是「聊了半天，一个功能都没实现」。

这条最贵，因为它没有任何报错：没有异常、没有日志、没有红色。判断它只看一件事：

```bash
PID=$(pgrep -f dsh-desktop-host | head -1)
lsof -nP -iTCP -sTCP:LISTEN -a -p $PID
```

正常的插件应当**多出一个**监听在 `127.0.0.1:<随机端口>` 的回环服务（带 24 位 hex 令牌前缀）。
只剩 Web GUI 那一个端口，就说明 `apply()` 在半路返回了。

防复发：`scripts/check-host.mjs` 在桩上下文里跑 `apply()`，断言 13 条路由真的注册、
`/report` 声明了 `requestBody: 'buffered'`、回环服务真的在监听、错误令牌回 403、
`apply()` 至少产生一个 effect。它进 `npm run check`，所以「注册数为 0」是 CI 红，而不是
一句「没实现」。

教训：**注册类代码必须能被断言「注册了几个」**。返回值是 `void` 的装配函数，等于把
失败伪装成成功。
