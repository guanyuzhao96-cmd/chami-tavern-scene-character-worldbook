'use strict';

import { pluginContext as legacyContext } from './core/plugin-context.js';
import { initPhoneEmulator } from './Phone_emulator/index.js';

const PLUGIN_ID = 'chami-phone-emulator';
const VERSION = '1.0.0';
const MODULE_NAME = 'phoneEmulator';

let initialized = false;
let phoneInstance = null;

function getSTContext() {
    return window.SillyTavern?.getContext?.() || null;
}

function showToast(message, type = 'info') {
    if (window.toastr?.[type]) {
        window.toastr[type](message);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](`[${PLUGIN_ID}] ${message}`);
}

function createPhoneContext() {
    const modules = new Map();

    return {
        PLUGIN_NAME: PLUGIN_ID,
        VERSION,
        version: VERSION,

        // 复用原手机模块一直使用的设置适配器，以兼容已有手机配置和数据。
        // 不调用 legacyContext.init()，因此不会加载或覆盖酒馆场景插件的全局上下文。
        api: legacyContext.api,
        events: legacyContext.events,
        db: legacyContext.db,

        helpers: {
            ...legacyContext.helpers,
            showToast,
        },

        getSTContext,
        getContext: getSTContext,

        registerModule(name, module) {
            modules.set(name, module);
        },

        getModule(name) {
            return modules.get(name) || null;
        },

        log(scope, ...args) {
            console.log(`[ChamiPhone/${scope}]`, ...args);
        },

        error(scope, ...args) {
            console.error(`[ChamiPhone/${scope}]`, ...args);
        },

        async cleanup() {
            for (const module of modules.values()) {
                try {
                    await module?.cleanup?.();
                } catch (error) {
                    console.error('[ChamiPhone/cleanup]', error);
                }
            }
            modules.clear();
        },
    };
}

async function waitForSillyTavern(timeoutMs = 30000) {
    const start = Date.now();
    while (!window.SillyTavern?.getContext) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('等待 SillyTavern 初始化超时。');
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
}

async function initializeStandalonePhone() {
    if (initialized || window.__CHAMI_STANDALONE_PHONE_LOADED__) return;

    await waitForSillyTavern();

    // 原酒馆场景插件默认也可能启用手机模块。为了避免双悬浮球，检测到旧实例时停止初始化。
    if (document.querySelector('.tsp-phone-fab')) {
        showToast('检测到另一个模拟手机实例。请在原酒馆场景插件中关闭“手机模拟器”，然后刷新页面。', 'warning');
        return;
    }

    const phoneContext = createPhoneContext();
    await initPhoneEmulator(phoneContext);
    phoneInstance = phoneContext.getModule(MODULE_NAME);

    // 手机主体完成后再加载角色资料，确保它绑定到独立手机实例。
    await import('./Phone_emulator/js/character-profile-bootstrap.js');

    initialized = true;
    window.__CHAMI_STANDALONE_PHONE_LOADED__ = true;
    window.ChamiPhoneEmulator = {
        id: PLUGIN_ID,
        version: VERSION,
        context: phoneContext,
        instance: phoneInstance,
        open: () => phoneInstance?.openModal?.(),
        close: () => phoneInstance?.closeModal?.(),
    };

    showToast('独立模拟手机已加载', 'success');
}

initializeStandalonePhone().catch(error => {
    console.error('[ChamiPhone/bootstrap]', error);
    showToast(`独立模拟手机初始化失败：${error.message}`, 'error');
});

window.addEventListener('beforeunload', () => {
    try {
        phoneInstance?.cleanup?.();
    } catch {
        // 页面卸载阶段忽略清理异常。
    }
});
