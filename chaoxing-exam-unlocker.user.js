// ==UserScript==
// @name         超星学习通考试限制解除器（V6.3 ）
// @namespace    http://tampermonkey.net/
// @version      6.3
// @description  底层协议拦截粘贴 + 根节点反逃逸 + 强制解除选中复制 + 悬浮死锁解除
// @author       Mist Vulnerability Assistant
// @match        *://*.chaoxing.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
'use strict';

console.log("[Mist] V6.3 绝对通杀版启动：事件捕获层阻断 + 底层协议拦截...");

// ========================================================================
// 维度一：UEditor 原型链劫持 (保证输入框能粘贴)
// ========================================================================
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
                    return this; // 丢弃粘贴拦截
                }
                return originalAddListener.apply(this, arguments);
            };

            const originalGetEditor = _UE.getEditor;
            _UE.getEditor = function(id, opt) {
                if (opt) {
                    opt.pasteplain = false;
                    opt.disablePasteImage = false;
                }
                return originalGetEditor.call(this, id, opt);
            };
        }
    },
    configurable: true
});

// ========================================================================
// 维度二：无限 Debugger 绕过 (根节点反逃逸 Hook)
// ========================================================================
const originalFunction = window.Function;
const blockDebugger = function(...args) {
    const fnStr = args[args.length - 1];
    if (typeof fnStr === 'string' && fnStr.includes('debugger')) {
        return function() {};
    }
    return originalFunction.apply(this, args);
};

window.Function = blockDebugger;
window.Function.prototype = originalFunction.prototype;
Function.prototype.constructor = blockDebugger; // 封杀构造器逃逸

const originalEval = window.eval;
window.eval = function(string) {
    if (typeof string === 'string' && string.includes('debugger')) return;
    return originalEval.apply(this, arguments);
};

// ========================================================================
// 维度三：终极选中与复制解锁 (事件捕获层阻断 + CSS 暴力覆盖)
// ========================================================================
function injectUnlockCSS() {
    if (document.getElementById('mist-unlock-css')) return;
    const style = document.createElement('style');
    style.id = 'mist-unlock-css';
    style.textContent = `
        html:not(input):not(textarea):not(select):not(option):not(button),
        html, body, *, [class*="notAllowCopy"] {
            -webkit-touch-callout: text !important;
            -webkit-user-select: text !important;
            -khtml-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            pointer-events: auto !important;
        }
        ::selection { background: #3390FF !important; color: #fff !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// 顶层事件拦截（掐断超星的 JS 拦截器）
const allowEvents = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart', 'mousedown', 'mouseup'];
allowEvents.forEach(ev => {
    document.documentElement.addEventListener(ev, function(e) {
        e.stopPropagation();
    }, true);
});

// 高频动态清场（应对 Ajax 动态加载的题目）
function clearInlineHandlers() {
    injectUnlockCSS();
    const elements = [document, window, document.body];
    elements.forEach(el => {
        if (el) {
            el.oncontextmenu = null;
            el.onselectstart = null;
            el.ondragstart = null;
            el.oncopy = null;
            el.oncut = null;
        }
    });
    document.querySelectorAll('[aria-hidden="true"][tabindex]').forEach(el => {
        el.removeAttribute('aria-hidden');
    });
}

clearInlineHandlers();
window.addEventListener('DOMContentLoaded', clearInlineHandlers);
setInterval(clearInlineHandlers, 2000);

// ========================================================================
// 维度四：紧急救援模块（防卡死/强行解锁）
// ========================================================================
window.addEventListener('DOMContentLoaded', () => {
    const rescueBtn = document.createElement('div');
    rescueBtn.innerHTML = '🆘 解除死锁';
    rescueBtn.title = '当点击提交没反应、或者页面被遮罩层卡死时点击此按钮';
    rescueBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        padding: 8px 12px;
        background: #ff4444;
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        user-select: none;
    `;
    
    rescueBtn.onclick = function() {
        console.log("[Mist] 执行紧急救援程序...");
        
        // 1. 暴力释放超星原生业务锁
        if (typeof window.submitLock !== 'undefined') window.submitLock = 0;
        if (typeof window.saveLock !== 'undefined') window.saveLock = false;
        
        // 2. 隐藏超星专属遮罩层与弹窗
        document.querySelectorAll('.maskDiv, .mask-no-bg, #worktoast').forEach(mask => {
            mask.style.display = 'none';
        });
        
        // 3. 恢复页面整体交互权限
        document.body.style.pointerEvents = "auto";
        
        // 4. 强制刷新编辑器状态
        if (window.UE && UE.getAllEditor) {
            UE.getAllEditor().forEach(editor => {
                if (editor && editor.ready) {
                    editor.setDisabled(false);
                    editor.setEnabled();
                }
            });
        }
        
        alert("✅ 死锁已解除！如果问题仍然存在，请刷新页面后重试。");
    };
    
    document.body.appendChild(rescueBtn);
});
})();