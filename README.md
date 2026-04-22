# 超星学习通考试限制破解实战：从 F12 到复制粘贴（V6.3）

## 背景

在进行在线考试时，面对有限的时间压力，系统的前端限制（禁止 F12、禁止复制、禁止粘贴、甚至页面死锁）严重阻碍了正常的作答效率。通过对超星学习通前端安全机制长达数个版本的深度逆向分析与对抗，构建了一条从 DOM 突破到 JS 原型链劫持，再到事件捕获层阻断的完整攻防链路，彻底瓦解了其前端防御体系。

## 第一步：突破 F12 开发者工具（根节点反逃逸 Hook）

点击 F12 打开开发者工具时，页面瞬间卡死，触发了无限 debugger 断点拦截。

### 限制机制与对抗升级

最初，通过重写全局的 `window.Function` 成功拦截了 `new Function('debugger')`。但随后发现，超星的前端混淆代码使用了"原型链构造器逃逸"技术：

```javascript
// 超星绕过 window.Function 的经典手法
(function anonymous() {}).constructor("debugger")();
```

这种写法直接调用了 JavaScript 底层的 `Function.prototype.constructor`，完美避开了在全局对象上设下的陷阱。

### 逆向解除（Root Prototype Hooking）

要彻底粉碎这种逃逸，必须将防线下沉，直接劫持所有函数的"祖宗"节点：

```javascript
const originalFunction = window.Function;
const blockDebugger = function(...args) {
    const fnStr = args[args.length - 1];
    if (typeof fnStr === 'string' && fnStr.includes('debugger')) {
        return function() {}; // 替换为空函数，静默失效
    }
    return originalFunction.apply(this, args);
};

// 1. 拦截全局调用
window.Function = blockDebugger;
// 2. 核心杀招：拦截原型链逃逸调用
Function.prototype.constructor = blockDebugger;
```

## 第二步：解决题干无法复制的问题（事件捕获层阻断）

起初，认为题干无法复制仅仅是因为 `notAllowCopy.css` 中的 `user-select: none`。但在强行覆盖 CSS 后，发现依然无法选中。这说明超星启用了 JavaScript 事件级拦截（如 `onselectstart = return false` 和 `oncopy` 拦截）。

### 攻防推导：降维打击 JS 拦截器

如果在冒泡阶段去解除限制，往往会被超星底层的框架死死卡住。真正的打击是实施"事件捕获层阻断（Event Capture Interception）"。在浏览器事件流的最顶层（捕获阶段），直接把 `copy`、`selectstart` 事件的传播给掐断，让超星的拦截函数变成"瞎子"。

```javascript
// 顶层事件拦截（掐断超星的 JS 拦截器）
const allowEvents = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart'];
allowEvents.forEach(ev => {
    document.documentElement.addEventListener(ev, function(e) {
        e.stopPropagation(); // 阻止事件向下传播到超星的拦截器！
    }, true); // true 代表在捕获阶段执行，拥有最高优先级
});
```

配合定时器高频清除行内属性（应对 Ajax 动态加载的题目），复制与右键菜单被完美解锁。

## 第三步：突破答案输入框的粘贴限制（原型链劫持）

这是整个攻防链路中最核心的一环。超星通过在 UEditor 实例上绑定 `beforepaste` 事件来清空剪贴板。

### 从"事后清理"到"事前拦截"

依赖 DOM 加载完毕后去执行 `removeListener` 会因为执行时机滞后而彻底失效。必须在页面任何脚本执行前（`@run-at document-start`），直接修改 UEditor 的底层图纸，让它先天丧失绑定粘贴拦截器的能力。

```javascript
let _UE;
Object.defineProperty(window, 'UE', {
    get: function() { return _UE; },
    set: function(val) {
        _UE = val;
        if (_UE && _UE.Editor && _UE.Editor.prototype) {
            const originalAddListener = _UE.Editor.prototype.addListener;
            _UE.Editor.prototype.addListener = function(types, listener) {
                // 核心：无论前端传入什么拦截函数，只要是粘贴事件，直接丢弃！
                if (typeof types === 'string' && types.indexOf('paste') !== -1) {
                    return this;
                }
                return originalAddListener.apply(this, arguments);
            };
        }
    },
    configurable: true
});
```

**注**：在早期版本中，曾尝试冻结全局的 `editorPaste` 变量，但这会导致超星后续的代码抛出 SyntaxError，从而引发"下一题"和"提交"按钮失效的级联崩溃。V6.3 版本果断废弃了该做法，仅保留底层劫持，实现了完美的无痕突破。

## 第四步：应对极端情况（紧急救援防死锁模块）

在实战中，由于网络波动或脚本冲突，超星页面有时会出现"点击提交没反应"、"一直显示正在提交"或"被透明遮罩层卡死"的死锁状态。

为此，开发了一个悬浮的"🆘 解除死锁"模块。它精准映射了超星底层的业务锁变量，并能强行恢复 DOM 交互权限：

```javascript
// 1. 暴力释放超星原生业务锁
if (typeof window.submitLock !== 'undefined') window.submitLock = 0;
if (typeof window.saveLock !== 'undefined') window.saveLock = false;

// 2. 隐藏超星专属遮罩层与弹窗（不破坏DOM结构，防止后续报错）
document.querySelectorAll('.maskDiv, .mask-no-bg, #worktoast').forEach(mask => mask.style.display = 'none');

// 3. 恢复页面整体交互权限
document.body.style.pointerEvents = "auto";
```

## 第五步：终极突破——iframe 内核级粘贴劫持

在完成了原型链劫持之后，理论上所有 beforepaste 拦截已经失效。然而在实际测试中，仍然存在“无法粘贴”的情况。经过进一步分析，问题的根源逐渐显现：

UEditor 的实际输入环境并不在主页面，而是在独立的 iframe 内部。

这意味着之前对 DOM 或 UEditor 实例的拦截，只能覆盖主文档层面的事件，而 iframe 内部仍然保持原始粘贴拦截逻辑。

iframe 内核阻止的分析

在 V6.3 版本中，超星平台通过以下方式阻止粘贴：

iframe 内部绑定 paste、beforepaste 事件，捕获剪贴板数据。
对剪贴板内容进行清洗或直接阻止插入。
即便外层 DOM 或 UEditor 原型被劫持，iframe 内的事件依然生效。

这也是为什么之前单纯修改 _listeners 或阻止外层事件仍无法解决问题的根本原因。

攻防策略：直接接管 iframe 内核

解决思路非常直接：进入 iframe 内部，接管其事件流。核心做法包括：

遍历页面所有 iframe，找到所有 UEditor 编辑器对应的内容框。
注入捕获阶段事件监听，阻止 iframe 内部原有粘贴拦截逻辑。
手动写入剪贴板内容，确保粘贴操作在 iframe 内部成功执行。
持续扫描动态生成的 iframe，保证新加载题目也被保护。

实现代码示例：
```javascript
function hookIframePaste() {
    document.querySelectorAll('iframe').forEach(frame => {
        try {
            const doc = frame.contentDocument;
            if (!doc || doc._mist_hooked) return;
            doc._mist_hooked = true;

            // 捕获 paste 事件
            doc.addEventListener('paste', function(e) {
                e.stopImmediatePropagation();

                const text = (e.clipboardData || window.clipboardData).getData('text');

                try {
                    doc.execCommand('insertText', false, text);
                } catch(err) {
                    // fallback
                    const sel = doc.getSelection();
                    if (sel && sel.rangeCount) {
                        sel.deleteFromDocument();
                        sel.getRangeAt(0).insertNode(doc.createTextNode(text));
                    }
                }
            }, true);

        } catch(err) {
            // 跨域 iframe 自动忽略
        }
    });
}
```

// 持续扫描 iframe（动态加载题目）
setInterval(hookIframePaste, 1000);
关键洞察

这一层劫持，实际上才是粘贴链路的真正执行点。前四步：

DOM 层面解锁复制/选中
原型链劫持阻止 addListener
捕获阶段阻断事件

只能完成外围突破，而 iframe 内核级粘贴事件 才是最终的瓶颈。

通过这一步：

Ctrl+V 与右键粘贴完全生效
动态生成题目、翻页后的编辑器也被保护
剪贴板内容不会被清空

## 🚀 终极自动化实现（V6.3）

结合上述所有原理，构建最终的自动化用户脚本。将以下代码放入 Tampermonkey 中即可实现全自动降维打击。

## V6.3 新特性

- **根节点反逃逸 Hook**：彻底封杀 `(function(){}).constructor("debugger")()` 绕过手法
- **事件捕获层阻断**：在事件流最顶层拦截，确保复制/右键菜单完全解锁
- **高频动态清场**：每2秒自动清理新加载题目的限制，应对Ajax动态内容
- **紧急救援模块**：悬浮按钮一键解除死锁状态，解决提交无响应问题
- **无痕突破**：废弃可能导致级联崩溃的全局变量冻结，采用更稳定的底层劫持

## 安装使用

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 浏览器扩展
2. 导入 [`chaoxing-exam-unlocker.user.js`](chaoxing-exam-unlocker.user.js) 文件
3. 访问超星学习通网站自动生效

## 兼容性

- **支持网站**：`*.chaoxing.com`
- **测试浏览器**：Chrome、Firefox、Edge
- **所需扩展**：Tampermonkey 或 Violentmonkey

## 总结

通过这次实战，揭示了前端安全对抗的核心法则：**执行时机即是最高权限（Timing is Everything）**。

1. **滞后清理的局限性**：依赖 DOM 加载完毕后去寻找元素并解绑事件，极易因为闭包引用逃逸或框架内部状态固化而失效。
2. **底层协议拦截的降维打击**：利用 `Object.defineProperty` 与原型链 Hook，在目标代码执行前"篡改规则"，使目标系统的防御机制在初始化阶段就直接瘫痪。

所有纯客户端的安全限制（防复制、防粘贴、防调试）在掌握了底层执行流的攻击者面前，都是透明的。真正的业务安全，必须建立在服务端严格的数据校验之上。
