// ==UserScript==
// @name         超星学习通文本选择解除器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  解除超星学习通的文本选择和复制限制
// @author       Mist Vulnerability Assistant
// @match        *://*.chaoxing.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建覆盖样式
    const style = document.createElement('style');
    style.textContent = `
        /* 覆盖 notAllowCopy.css 的限制 */
        html:not(input):not(textarea):not(select):not(option):not(button) {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            user-select: text !important;
            pointer-events: auto !important;
        }
        
        /* 确保所有元素都可以选择文本 */
        * {
            -webkit-touch-callout: text !important;
            -webkit-user-select: text !important;
            -khtml-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }
    `;
    
    // 等待DOM加载完成后注入样式
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.appendChild(style);
        });
    } else {
        document.documentElement.appendChild(style);
    }
    
    console.log('[Mist] 文本选择限制已解除');
})();