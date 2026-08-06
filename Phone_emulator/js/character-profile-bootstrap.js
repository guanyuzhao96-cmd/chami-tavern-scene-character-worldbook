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
        warn(scope, ...args) {
            console.warn(`[${scope}]`, ...args);
        },
        error(scope, ...args) {
            console.error(`[${scope}]`, ...args);
        },
        helpers: { showToast },
    };
}

function ensureFallbackLauncher(phoneContainer, ui) {
    if (!phoneContainer || phoneContainer.querySelector('[data-character-profile-app]')) return;

    const phoneScreen = phoneContainer.querySelector('.tsp-phone-screen') || phoneContainer;
    if (!phoneScreen || phoneScreen.querySelector('[data-character-profile-fallback]')) return;

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.dataset.characterProfileApp = '1';
    launcher.dataset.characterProfileFallback = '1';
    launcher.setAttribute('aria-label', '打开角色资料');
    launcher.title = '角色资料';
    launcher.innerHTML = '<i class="fas fa-id-card"></i><span>角色资料</span>';
    Object.assign(launcher.style, {
        position: 'absolute',
        right: '12px',
        bottom: '72px',
        zIndex: '80',
        width: '64px',
        minHeight: '58px',
        border: '0',
        borderRadius: '16px',
        padding: '8px 6px',
        background: 'rgba(255,255,255,.92)',
        color: '#222',
        boxShadow: '0 4px 14px rgba(0,0,0,.18)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        fontSize: '12px',
        cursor: 'pointer',
    });
    launcher.querySelector('i').style.fontSize = '20px';
    launcher.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ui.renderList();
    });
    phoneScreen.appendChild(launcher);
}

async function attachToPhone(phoneContainer) {
    if (!phoneContainer || instances.has(phoneContainer)) return;

    const ui = new PhoneCharacterProfileUI(createContext(), phoneContainer);
    instances.set(phoneContainer, ui);

    try {
        await ui.init();
        ensureFallbackLauncher(phoneContainer, ui);
        const observer = new MutationObserver(() => ensureFallbackLauncher(phoneContainer, ui));
        observer.observe(phoneContainer, { childList: true, subtree: true });
        ui.__launcherObserver = observer;
        console.log('[角色资料] 已挂载到模拟手机');
    } catch (error) {
        instances.delete(phoneContainer);
        console.error('[角色资料] 初始化失败', error);
        showToast(`角色资料模块初始化失败：${error.message || error}`, 'error');
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
