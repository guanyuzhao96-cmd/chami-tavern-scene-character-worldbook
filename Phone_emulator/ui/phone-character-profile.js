'use strict';

import { PhoneWorldbookService } from '../services/phone-worldbook-service.js';
import { CharacterProfileStorage } from '../db/character-profile-storage.js';
import { CharacterProfileAI } from '../api/character-profile-ai.js';
import { CharacterProfileService } from '../services/character-profile-service.js';

const h = CharacterProfileService.escapeHtml;

export class PhoneCharacterProfileUI {
    constructor(context, phoneContainer) {
        this.ctx = context;
        this.phoneContainer = phoneContainer;
        this.phoneScreen = phoneContainer.querySelector('.tsp-phone-screen');
        this.home = phoneContainer.querySelector('#tsp-phone-home-screen');
        this.layer = null;
        this.root = null;
        this.observer = null;
        this.storage = new CharacterProfileStorage(context);
        this.worldbook = new PhoneWorldbookService(context);
        this.ai = new CharacterProfileAI(context);
        this.service = new CharacterProfileService(context, this.worldbook, this.storage, this.ai);
    }

    async init() {
        await this.storage.init();
        this.injectIcon();
        this.observer = new MutationObserver(() => this.injectIcon());
        this.observer.observe(this.home, { childList: true, subtree: true });
    }

    injectIcon() {
        const grid = this.home?.querySelector('.tsp-phone-app-grid');
        if (!grid || grid.querySelector('[data-character-profile-app]')) return;
        const icon = document.createElement('div');
        icon.className = 'tsp-phone-app-icon';
        icon.dataset.characterProfileApp = '1';
        icon.innerHTML = '<div class="tsp-phone-app-icon-box character-profile"><i class="fas fa-id-card"></i></div><span>角色资料</span>';
        icon.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.renderList();
        });
        grid.appendChild(icon);
    }

    openLayer() {
        if (this.layer?.isConnected) return;
        if (!this.phoneScreen) throw new Error('未找到模拟手机屏幕。');
        this.layer = document.createElement('div');
        this.layer.className = 'tsp-character-profile-layer';
        this.layer.innerHTML = '<div class="tsp-character-profile-root"></div>';
        this.phoneScreen.appendChild(this.layer);
        this.root = this.layer.firstElementChild;
    }

    close() {
        this.layer?.remove();
        this.layer = null;
        this.root = null;
        this.injectIcon();
    }

    nav(title, actions = '') {
        return `<div class="tsp-character-profile-nav"><button class="tsp-character-profile-nav-btn" data-back><i class="fas fa-chevron-left"></i></button><div class="tsp-character-profile-nav-title">${h(title)}</div><div class="tsp-character-profile-nav-actions">${actions}</div></div>`;
    }

    bindBack(callback = () => this.close()) {
        this.root.querySelector('[data-back]')?.addEventListener('click', callback);
    }

    toast(message, type = 'info') {
        this.ctx?.helpers?.showToast?.(message, type);
    }

    async busy(button, label, task) {
        if (!button || button.disabled) return;
        const old = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${h(label)}`;
        try {
            return await task();
        } catch (error) {
            this.toast(error.message || '操作失败', 'error');
            throw error;
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                button.innerHTML = old;
            }
        }
    }

    error(error, back = () => this.close()) {
        this.openLayer();
        this.root.innerHTML = `<div class="tsp-character-profile-view">${this.nav('角色资料')}<div class="tsp-character-profile-error"><i class="fas fa-triangle-exclamation"></i><strong>无法打开角色资料</strong><div>${h(error?.message || '未知错误')}</div></div></div>`;
        this.bindBack(back);
        this.ctx?.error?.('character-profile', error);
    }

    async renderList() {
        this.openLayer();
        try {
            const profiles = this.service.getProfiles();
            this.root.innerHTML = `<div class="tsp-character-profile-view">${this.nav('角色资料', '<button class="tsp-character-profile-nav-btn" data-settings><i class="fas fa-sliders-h"></i></button>')}<div class="tsp-character-profile-content"><div class="tsp-character-profile-intro"><strong>固定资料</strong>来自世界书且只读；<strong>动态资料</strong>来自聊天并写入独立世界书条目。</div><div class="tsp-character-profile-list">${profiles.length ? profiles.map(profile => this.profileCard(profile)).join('') : this.empty()}</div></div><button class="tsp-character-profile-fab" data-create><i class="fas fa-plus"></i></button></div>`;
            this.bindBack();
            this.root.querySelector('[data-create]')?.addEventListener('click', () => this.renderCreate());
            this.root.querySelector('[data-settings]')?.addEventListener('click', () => this.renderSettings());
            this.root.querySelectorAll('[data-profile]').forEach(node => node.addEventListener('click', () => this.renderDetail(node.dataset.profile)));
        } catch (error) {
            this.error(error);
        }
    }

    profileCard(profile) {
        const text = profile.dynamic?.relationshipWithUser || profile.dynamic?.currentStatus || '动态资料已建立';
        return `<button class="tsp-character-profile-card" data-profile="${h(profile.profileId)}"><div class="tsp-character-profile-avatar">${h(profile.characterName.slice(0, 1))}</div><div class="tsp-character-profile-card-main"><div class="tsp-character-profile-card-title">${h(profile.characterName)}</div><div class="tsp-character-profile-card-subtitle">${h(text)}</div><div class="tsp-character-profile-card-meta">更新至第 ${Number(profile.lastProcessedMessageId) + 1} 条消息</div></div><i class="fas fa-chevron-right"></i></button>`;
    }

    empty() {
        return '<div class="tsp-character-profile-empty"><i class="fas fa-address-book"></i><div class="tsp-character-profile-empty-title">尚未创建角色资料</div><div>点击右下角“＋”，从世界书和当前聊天建立第一份资料。</div></div>';
    }

    candidateRows(entries) {
        if (!entries.length) return '<div class="tsp-character-profile-empty-small">当前角色卡没有可用世界书条目。</div>';
        return entries.map(item => `<label class="tsp-character-profile-entry-row"><input type="checkbox" class="tsp-character-profile-entry-check" data-book="${h(item.bookName)}" data-uid="${h(item.uid ?? '')}" data-name="${h(item.name)}"><div><div class="tsp-character-profile-entry-name">${h(item.name)}</div><div class="tsp-character-profile-entry-book">${h(item.bookName)}</div><div class="tsp-character-profile-entry-preview">${h(item.content.replace(/\s+/g, ' ').slice(0, 90))}</div></div></label>`).join('');
    }

    async renderCreate() {
        this.openLayer();
        try {
            const entries = await this.service.getWorldbookCandidates();
            this.root.innerHTML = `<div class="tsp-character-profile-view">${this.nav('创建角色资料')}<div class="tsp-character-profile-content"><label class="tsp-character-profile-label">角色姓名</label><input class="tsp-character-profile-input" id="cp-name" placeholder="例如：林星冉"><label class="tsp-character-profile-label">别名</label><input class="tsp-character-profile-input" id="cp-alias" placeholder="多个别名用逗号分隔"><label class="tsp-character-profile-label">固定资料来源</label><div class="tsp-character-profile-hint">选中的世界书条目只作为不可修改的事实来源。</div><input class="tsp-character-profile-input" id="cp-search" placeholder="搜索世界书条目"><div class="tsp-character-profile-entry-list" id="cp-entries">${this.candidateRows(entries)}</div><button class="tsp-character-profile-primary-btn" data-submit><i class="fas fa-wand-magic-sparkles"></i> 创建并生成动态资料</button></div></div>`;
            this.bindBack(() => this.renderList());
            const search = this.root.querySelector('#cp-search');
            search.addEventListener('input', async () => {
                this.root.querySelector('#cp-entries').innerHTML = this.candidateRows(await this.service.getWorldbookCandidates(search.value));
            });
            this.root.querySelector('[data-submit]').addEventListener('click', event => this.busy(event.currentTarget, '正在创建…', async () => {
                const refs = [...this.root.querySelectorAll('.tsp-character-profile-entry-check:checked')].map(input => ({
                    bookName: input.dataset.book,
                    uid: input.dataset.uid === '' ? null : (Number.isNaN(Number(input.dataset.uid)) ? input.dataset.uid : Number(input.dataset.uid)),
                    entryName: input.dataset.name,
                }));
                const profile = await this.service.createProfile({
                    characterName: this.root.querySelector('#cp-name').value,
                    aliases: this.root.querySelector('#cp-alias').value,
                    fixedSourceRefs: refs,
                });
                this.toast(`已创建 ${profile.characterName} 的角色资料`, 'success');
                await this.renderDetail(profile.profileId);
            }));
        } catch (error) {
            this.error(error, () => this.renderList());
        }
    }

    dynamicRows(dynamic) {
        const rows = [
            ['当前状态', dynamic.currentStatus], ['当前位置', dynamic.currentLocation], ['当前情绪', dynamic.currentMood],
            ['与用户关系', dynamic.relationshipWithUser], ['对用户态度', dynamic.attitudeTowardUser], ['当前目标', dynamic.currentGoal],
            ['当前冲突', dynamic.currentConflict], ['当前外观', dynamic.currentAppearance], ['剧情进度', dynamic.plotProgress],
            ['近期事件', dynamic.recentEvents], ['重要承诺', dynamic.importantPromises], ['已揭露秘密', dynamic.secretsRevealed], ['关系网络', dynamic.currentRelationships],
        ];
        return rows.map(([label, value]) => `<div class="tsp-character-profile-field"><div class="tsp-character-profile-field-label">${label}</div><div class="tsp-character-profile-field-value">${Array.isArray(value) ? (value.length ? value.map(item => `• ${h(item)}`).join('<br>') : '暂无') : h(value || '暂无')}</div></div>`).join('');
    }

    async renderDetail(profileId) {
        this.openLayer();
        try {
            const profile = this.service.getProfile(profileId);
            await this.service.refreshFixedSources(profile);
            const fixed = this.service.combineFixedSources(profile.fixedSources);
            const sources = profile.fixedSources?.length ? profile.fixedSources.map(source => `<span class="${source.missing ? 'missing' : ''}">${h(source.bookName)}／${h(source.entryName)}</span>`).join('') : '<span>未绑定固定资料条目</span>';
            this.root.innerHTML = `<div class="tsp-character-profile-view">${this.nav(profile.characterName, '<button class="tsp-character-profile-nav-btn danger" data-delete><i class="fas fa-trash"></i></button>')}<div class="tsp-character-profile-content"><section class="tsp-character-profile-section locked"><div class="tsp-character-profile-section-title"><i class="fas fa-lock"></i> 固定资料</div><div class="tsp-character-profile-source-summary">${sources}</div><pre class="tsp-character-profile-fixed-content">${h(fixed || '未绑定固定资料条目。')}</pre></section><section class="tsp-character-profile-section"><div class="tsp-character-profile-section-title"><i class="fas fa-rotate"></i> 动态资料</div>${this.dynamicRows(profile.dynamic || {})}</section><div class="tsp-character-profile-entry-info">世界书条目：${h(profile.dynamicEntry?.entryName || '尚未写入')}</div><button class="tsp-character-profile-primary-btn" data-update><i class="fas fa-arrows-rotate"></i> 根据新聊天更新资料</button></div></div>`;
            this.bindBack(() => this.renderList());
            this.root.querySelector('[data-update]').addEventListener('click', event => this.busy(event.currentTarget, '正在更新…', async () => {
                await this.service.updateProfile(profileId);
                this.toast('动态资料已更新并写入世界书', 'success');
                await this.renderDetail(profileId);
            }));
            this.root.querySelector('[data-delete]').addEventListener('click', async () => {
                if (!window.confirm(`确定删除“${profile.characterName}”的动态资料和独立世界书条目吗？固定来源不会删除。`)) return;
                await this.service.deleteProfile(profileId);
                this.toast('角色资料已删除', 'success');
                await this.renderList();
            });
        } catch (error) {
            this.error(error, () => this.renderList());
        }
    }

    async renderSettings() {
        this.openLayer();
        try {
            const settings = this.service.getSettings();
            this.root.innerHTML = `<div class="tsp-character-profile-view">${this.nav('角色资料设置')}<div class="tsp-character-profile-content"><label class="tsp-character-profile-label">条目前缀</label><input class="tsp-character-profile-input" id="cp-prefix" value="${h(settings.prefix)}"><label class="tsp-character-profile-label">世界书条目命名模板</label><input class="tsp-character-profile-input" id="cp-template" value="${h(settings.namingTemplate)}"><div class="tsp-character-profile-hint">支持：{prefix} {character} {card} {chatId} {profileId} {type} {date}</div><div class="tsp-character-profile-template-preview" id="cp-preview"></div><label class="tsp-character-profile-switch-row"><input type="checkbox" id="cp-rename" ${settings.autoRenameExisting ? 'checked' : ''}><span>保存后自动重命名当前聊天已有动态条目</span></label><label class="tsp-character-profile-label">首次读取最大消息数</label><input type="number" min="1" max="300" class="tsp-character-profile-input" id="cp-max" value="${Number(settings.maxInitialMessages) || 60}"><label class="tsp-character-profile-label">更新重叠消息数</label><input type="number" min="0" max="50" class="tsp-character-profile-input" id="cp-overlap" value="${Number(settings.overlapMessages) || 5}"><button class="tsp-character-profile-primary-btn" data-save><i class="fas fa-save"></i> 保存设置</button></div></div>`;
            this.bindBack(() => this.renderList());
            const preview = () => {
                const text = this.root.querySelector('#cp-template').value
                    .replaceAll('{prefix}', this.root.querySelector('#cp-prefix').value)
                    .replaceAll('{character}', '林星冉').replaceAll('{card}', '示例角色卡')
                    .replaceAll('{chatId}', 'chat-001').replaceAll('{profileId}', 'tsp_12345678')
                    .replaceAll('{type}', '动态').replaceAll('{date}', '2026-08-04');
                this.root.querySelector('#cp-preview').textContent = `预览：${text}`;
            };
            this.root.querySelector('#cp-prefix').addEventListener('input', preview);
            this.root.querySelector('#cp-template').addEventListener('input', preview);
            preview();
            this.root.querySelector('[data-save]').addEventListener('click', event => this.busy(event.currentTarget, '正在保存…', async () => {
                await this.service.updateSettings({
                    ...settings,
                    prefix: this.root.querySelector('#cp-prefix').value,
                    namingTemplate: this.root.querySelector('#cp-template').value,
                    autoRenameExisting: this.root.querySelector('#cp-rename').checked,
                    maxInitialMessages: Number(this.root.querySelector('#cp-max').value) || 60,
                    overlapMessages: Number(this.root.querySelector('#cp-overlap').value) || 5,
                });
                this.toast('角色资料设置已保存', 'success');
                await this.renderList();
            }));
        } catch (error) {
            this.error(error, () => this.renderList());
        }
    }

    cleanup() {
        this.close();
        this.observer?.disconnect();
    }
}
