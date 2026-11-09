# 显示模式（纯净 / 正常）

纯净模式要回答一个问题：**把界面藏起来之后，用户还能不能回来。**
下面的状态机与接线约定就是为了保证这件事，改动前先读完。

## 一、状态

```ts
type ModeLock = 'none' | 'pure' | 'normal'
state.modeLock            // 当前锁定的模式，持久化
state.modeKeys.pure       // 例如 'Meta+Shift+P'
state.modeKeys.normal     // 例如 'Meta+Shift+O'
```

`modeLock` 是**单一状态**，不是两个布尔。两个布尔会出现「pure 和 normal 同时锁住」的
死局：那时两个快捷键都进不去、也都出不来。

## 二、转换

| 起点 | 按纯净键 | 按正常键 |
| --- | --- | --- |
| `none` | → `pure` | → `normal` |
| `pure` | → `none`（解除） | 拒绝，提示「纯净模式已锁定」 |
| `normal` | 拒绝，提示「正常模式已锁定」 | → `none`（解除） |

要点：**每个键只管自己那一半**。锁住 `pure` 后，再按纯净键是「解除」而不是「再进一次」；
此时按正常键不生效——这正是「各自锁定、各自解除」的含义。

## 三、纯净模式怎么隐藏界面

```css
html[data-dsh-skin-mode="pure"] body > :not(.dsh-skin-video-layer){display:none !important;}
html[data-dsh-skin-mode="pure"],html[data-dsh-skin-mode="pure"] body{overflow:hidden !important;}
```

三条硬约束：

1. **必须排除 `.dsh-skin-video-layer`**。壁纸层是 portal 到 `<body>` 的直系子节点，
   一起藏掉就只剩黑屏，用户会以为程序崩了。
2. **只能藏 `body` 的直接子节点**。`#root` 被藏掉不影响效果，因为 `<style>` 标签就在
   `#root` 里——CSS 只要进了文档就生效，与元素是否可见无关。
3. **不能对 `#root` 用 `visibility:hidden` 或 `opacity:0`**：那会连点击一起带走，
   播放器热区、双击全屏全部失效。

入口按钮（「进入纯净模式 / 回到正常界面」）只是给不愿意记快捷键的人的备用手段，
真正的日常路径是快捷键。

## 四、应急出口

纯净模式下没有任何可见控件。因此：

- 连按两次 `Esc`（900ms 内）→ 解除锁定，并弹一条 `notice.modeExit`。
- 快捷键失灵、键位被系统占用、外接键盘换布局，都还有这一条路。
- 这条逻辑写在 `ModeController` 的 keydown 里，**先于**快捷键匹配执行，不能被组合键分支挡住。

## 五、打字时不许抢画面

光标停在输入框里时，用户正在写东西，而且会看着上面的对话内容做对照。
这个时候按到纯净快捷键，把整屏藏掉，等于把他正在看的东西抽走。

规则：**只要 `isTextEntryFocused()` 为真，就不允许「进入」纯净模式。**

```js
if (wanted === MODE_PURE && lock !== MODE_PURE && isTextEntryFocused()) {
  store.notify('modeTyping')   // 「光标在输入框里，画面不会隐藏」
  return
}
```

三个细节：

1. **只拦进入**。`lock !== MODE_PURE` 这个条件保证解除锁定永远可达——
   否则用户在输入框里锁住纯模式，就会既看不见也退不出。
2. **判定要认得出真实的 composer**。DSH 的输入区可能是 `contenteditable`、
   也可能是 Lexical（`data-lexical-editor`）或 `role="textbox"` 的容器，
   所以沿着 `parentElement` 往上找，而不是只看 `activeElement` 本身。
3. **非文本 input 不算**。checkbox / radio / range / file 这些拿到焦点时用户并没有在打字，
   不该阻止快捷键。

## 六、接线清单（改这个功能时逐条对照）

- [ ] `normalizeState` 校验 `modeLock` 属于三个合法值，非法回落 `none`
- [ ] `pickPersisted` 保存 `modeLock` 与 `modeKeys`，刷新后锁定状态仍在
- [ ] `ModeSection` 真的出现在 `SettingsPage` 的返回树里
- [ ] `ModeController` 真的出现在 `OverlayEntry` 的返回树里
- [ ] 录制时置 `modeRecording.current = true`，全局热键让位
- [ ] 组合键至少含 `Ctrl` / `Meta` / `Alt` 之一，裸字母不接收
- [ ] 同一组合不能同时分配给两种模式
- [ ] 所有 `mode.*` 文案在 `en` 与 `zh` 里都存在
- [ ] 光标在输入框里时，进入纯净模式的路径被拦住，且**解除**路径不被拦

以上九条已脚本化：`node scripts/check-modes.mjs .`（`npm run check` 与 CI 都会跑）。
脚本是文本级的，没有 DOM、没有打包器、没有依赖——它查的是「有没有接线」，
不是「运行起来对不对」，因此不能替代手点一遍。
