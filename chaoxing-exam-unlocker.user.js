// ==UserScript==
// @name         超星学习通考试限制解除器（V6.4 ）
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  底层协议拦截粘贴 + 根节点反逃逸 + 强制解除选中复制 + 悬浮死锁解除
// @author       Mist Vulnerability Assistant
// @match        *://*.chaoxing.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
 
(function() {
    'use strict';
 
    console.log("[Mist] V6.4 版启动");
 
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
        rescueBtn.innerHTML = ' 解除死锁';
        rescueBtn.title = '当点击提交没反应、或者页面被遮罩层卡死时点击此按钮';
        rescueBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999999;
            background: #ff4d4f; color: white; padding: 8px 12px;
            border-radius: 4px; cursor: pointer; font-size: 14px;
            font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            user-select: none; transition: all 0.3s;
        `;
 
        rescueBtn.onmouseover = () => rescueBtn.style.transform = 'scale(1.05)';
        rescueBtn.onmouseout = () => rescueBtn.style.transform = 'scale(1)';
 
        rescueBtn.onclick = function() {
            if (typeof window.submitLock !== 'undefined') window.submitLock = 0;
            if (typeof window.saveLock !== 'undefined') window.saveLock = false;
 
            document.querySelectorAll('.maskDiv, .mask-no-bg, .popSetupShowHide, #worktoast, #workpop, .maskBox').forEach(mask => {
                if (mask) mask.style.display = 'none';
            });
 
            document.body.style.pointerEvents = "auto";
            document.body.style.overflow = "auto";
 
            document.querySelectorAll('.completeBtn, .jb_btn, a[onclick*="submit"]').forEach(btn => {
                btn.style.pointerEvents = "auto";
                btn.style.opacity = "1";
                btn.removeAttribute('disabled');
            });
 
            if(confirm("UI 限制已解除！是否需要进一步强行终止所有后台定时器？\n\n警告：这会同时停止考试倒计时！\n仅在页面一直显示'正在提交...'且无法恢复时点击【确定】。")) {
                let highestId = window.setTimeout(function() {}, 0);
                for (let i = 0; i < highestId; i++) {
                    window.clearTimeout(i);
                    window.clearInterval(i);
                }
            }
            alert("页面死锁已解除！您可以重新点击保存或提交。");
        };
        document.body.appendChild(rescueBtn);
    });

    // ========================================================================
// 维度五：UEditor iframe 内核级粘贴劫持（真正破解点）
// ========================================================================

function hookIframePaste() {
    document.querySelectorAll('iframe').forEach(frame => {
        try {
            const doc = frame.contentDocument;
            if (!doc || doc._mist_hooked) return;

            doc._mist_hooked = true;

            console.log("[Mist] 已接管 iframe:", frame);

            // 捕获粘贴事件（最关键）
            doc.addEventListener('paste', function(e) {
                e.stopImmediatePropagation();

                const text = (e.clipboardData || window.clipboardData).getData('text');

                // 强制插入内容
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

                console.log("[Mist] iframe 粘贴已注入");
            }, true);

        } catch(err) {
            // 跨域 iframe 忽略
        }
    });
}

// 持续扫描 iframe（应对动态加载）
setInterval(hookIframePaste, 1000);
})();
