// ==UserScript==
// @name         超星学习通考试限制解除器（底层协议拦截版）
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  在网页渲染前劫持 UEditor 原型链与 Window 对象，免疫一切粘贴限制，底层绕过无限debugger
// @author       Mist Vulnerability Assistant
// @match        *://*.chaoxing.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
'use strict';

console.log("[Mist] 考试限制解除模块启动（底层协议拦截）...");

// ========================================================================
// 一：冻结全局拦截函数
// 原理：在页面定义 editorPaste 前，抢先抢占该变量名，并将其设为不可写。
// ========================================================================
try {
    Object.defineProperty(window, 'editorPaste', {
        value: function(o, html) {
            console.log("[Mist] 触发底层粘贴放行");
            return true; // 永远放行
        },
        writable: false,     // 绝对禁止目标网页修改
        configurable: false  // 绝对禁止重新配置
    });
} catch (e) {}

// ========================================================================
// 二：UEditor 原型链劫持
// 原理：拦截 UEditor 的核心加载，直接阉割掉它绑定粘贴事件的能力。
// ========================================================================
let _UE;
Object.defineProperty(window, 'UE', {
    get: function() { return _UE; },
    set: function(val) {
        _UE = val;
        if (_UE && _UE.Editor && _UE.Editor.prototype) {
            console.log("[Mist] 捕获到 UEditor 核心加载，开始注入原型链...");

            // 1. 劫持事件绑定器 addListener
            const originalAddListener = _UE.Editor.prototype.addListener;
            _UE.Editor.prototype.addListener = function(types, listener) {
                // 如果目标页面试图绑定 'beforepaste' 或 'paste'，直接丢弃，不予执行！
                if (typeof types === 'string' && types.indexOf('paste') !== -1) {
                    console.log("[Mist] 成功拦截并销毁 UEditor 粘贴事件绑定: " + types);
                    return this;
                }
                // 其他正常事件（如字数统计）正常放行
                return originalAddListener.apply(this, arguments);
            };

            // 2. 劫持编辑器初始化配置，强制开启富文本粘贴
            const originalGetEditor = _UE.getEditor;
            _UE.getEditor = function(id, opt) {
                if (opt) {
                    opt.pasteplain = false;        // 关闭纯文本模式
                    opt.disablePasteImage = false; // 允许粘贴图片
                }
                return originalGetEditor.call(this, id, opt);
            };
        }
    },
    configurable: true
});

// ========================================================================
// 三：无限 Debugger 绕过 (底层 Hook)
// ========================================================================
const originalFunction = window.Function;
window.Function = function(...args) {
    const fnStr = args[args.length - 1];
    if (typeof fnStr === 'string' && fnStr.includes('debugger')) {
        return function() {};
    }
    return originalFunction.apply(this, args);
};
window.Function.prototype = originalFunction.prototype;

// ========================================================================
// 维度四：解除题干文本选中与复制限制 (DOM 层面)
// ========================================================================
window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        html, body, *, [class*="notAllowCopy"] {
            -webkit-touch-callout: text !important;
            -webkit-user-select: text !important;
            -khtml-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            pointer-events: auto !important;
        }
    `;
    document.documentElement.appendChild(style);

    // 顺手修复超星原生的 aria-hidden 冲突报错（清理控制台警告）
    document.querySelectorAll('[aria-hidden="true"][tabindex]').forEach(el => {
        el.removeAttribute('aria-hidden');
    });

    console.log("[Mist] 文本选中与复制限制已解除");
});
})();