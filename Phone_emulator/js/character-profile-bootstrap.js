'use strict';

import { PhoneCharacterProfileUI } from '../ui/phone-character-profile.js';

const instances = new WeakMap();

function showToast(message, type = 'info') {
    const toastr = window.toastr;
    if (toastr && typeof toastr[type] === 'function') {
        toastr[type](message);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](`[角色资料] ${message}`);
}

function createContext() {
    return {
        log(scope, ...args) {
            console.log(`[${scope}]`, ...args);
        },
        error(scope, ...args) {
            console.error(`[${scope}]`, ...args);
        },
        helpers: { showToast },
    };
}

async function attachToPhone(phoneContainer) {
    if (!phoneContainer || instances.has(phoneContainer)) return;

    const ui = new PhoneCharacterProfileUI(createContext(), phoneContainer);
    instances.set(phoneContainer, ui);

    try {
        await ui.init();
        console.log('[角色资料] 已挂载到模拟手机');
    } catch (error) {
        instances.delete(phoneContainer);
        console.error('[角色资料] 初始化失败', error);
    }
}

function scan() {
    document.querySelectorAll('.tsp-phone-container').forEach(attachToPhone);
}

function start() {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__TSP_CHARACTER_PROFILE_OBSERVER__ = observer;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
