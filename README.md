# 超星学习通考试限制破解实战：从F12到复制粘贴（底层协议拦截版）

## 背景

在进行在线考试时，面对有限的时间压力，系统的前端限制（禁止F12、禁止复制、禁止粘贴）严重阻碍了正常的作答效率。通过对超星学习通前端安全机制的深度逆向分析，构建了一条从 DOM 突破到 JS 原型链劫持的完整攻防链路，彻底瓦解了其前端防御体系。

## 第一步：突破F12开发者工具限制（无限Debugger绕过）

点击F12打开开发者工具时，页面瞬间卡死，触发了无限debugger断点拦截。

### 限制机制分析

防御方通常通过`setInterval`或动态构造函数`new Function('debugger')()`来不断生成断点。

### 逆向解除限制

常规的"禁用断点"治标不治本。需要从 JS 引擎底层进行 Hook（劫持），拦截所有包含`debugger`关键字的动态函数执行：

```javascript
// 底层 Hook Function 构造器
const originalFunction = window.Function;
window.Function = function(...args) {
    const fnStr = args[args.length - 1];
    if (typeof fnStr === 'string' && fnStr.includes('debugger')) {
        return function() {}; // 替换为空函数，使其失效
    }
    return originalFunction.apply(this, args);
};
```

## 第二步：解决题干无法复制的问题（CSS层突破）

题干文字无法直接选中复制。查看浏览器源码，发现了具体的限制代码`notAllowCopy.css`：

```css
html:not(input):not(textarea):not(select):not(option):not(button){
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
}
```

### 逆向解除限制

直接向页面注入更高权重的 CSS 样式，强行覆盖其不可选中的属性：

```javascript
const style = document.createElement('style');
style.textContent = `html, body, *, [class*="notAllowCopy"] { user-select: text !important; pointer-events: auto !important; }`;
document.documentElement.appendChild(style);
```

## 第三步：突破答案输入框的粘贴限制（原型链劫持）

这是整个攻防链路中最核心、对抗最激烈的一环。

### 漏洞成因分析

查阅页面源码，发现了关键的粘贴拦截逻辑：

```javascript
// 1. 拦截函数定义
function editorPaste(o, html) {
    html.html = ""; // 强行清空剪贴板传入的内容
    $.toast({type: 'notice', content: "只能录入不能粘贴！"});
    return false;   // 阻断默认粘贴事件
}
// 2. UEditor 实例绑定
var editor1 = UE.getEditor("answerEditor4050216731");
editor1.addListener("beforepaste", editorPaste);
```

### 攻防推导：从"事后清理"到"事前拦截"

最初的尝试是在页面加载完成后，通过 DOM 遍历找到编辑器实例并执行`removeListener`。但这种方法彻底失效，原因在于：

1. **上下文隔离**：插件脚本与页面原生脚本存在沙盒隔离，无法直接操作页面内存中的实例。
2. **执行时机滞后**：当脚本运行寻找 DOM 时，UEditor 已经完成了初始化并将拦截函数深埋入其底层的事件队列中。

**终极策略**：底层原型链劫持（Prototype Hooking）与对象冻结（Object Freezing）。必须在页面任何脚本执行前（document-start），直接修改 UEditor 的底层图纸，让它先天丧失绑定粘贴拦截器的能力。

## 第四步：自动化实现（注入脚本）

结合上述所有原理，构建最终的自动化用户脚本。该脚本利用`@run-at document-start`

## 总结

通过这次实战，揭示了前端安全对抗的核心法则：**执行时机即是最高权限（Timing is Everything）**。

1. **滞后清理的局限性**：依赖 DOM 加载完毕后去寻找元素并解绑事件，极易因为闭包引用逃逸或框架内部状态固化而失效。
2. **底层协议拦截的降维打击**：利用`Object.defineProperty`与原型链 Hook，在目标代码执行前"篡改规则"，使目标系统的防御机制在初始化阶段就直接瘫痪。

所有纯客户端的安全限制（防复制、防粘贴、防调试）在掌握了底层执行流的攻击者面前，都是透明的。真正的业务安全，必须建立在服务端严格的数据校验之上。