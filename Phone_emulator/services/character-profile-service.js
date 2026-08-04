'use strict';

import { emptyDynamicProfile } from '../api/character-profile-ai.js';

function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function dateString(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export class CharacterProfileService {
    constructor(context, worldbookService, storage, ai) {
        this.ctx = context;
        this.worldbook = worldbookService;
        this.storage = storage;
        this.ai = ai;
    }

    getContextInfo() {
        const st = window.SillyTavern?.getContext?.();
        if (!st) throw new Error('无法获取SillyTavern上下文。');

        const cardName = String(st.name2 || st.characters?.[st.characterId]?.name || '').trim();
        const chatId = String(
            st.chatId
            || window.SillyTavern?.getCurrentChatId?.()
            || '',
        ).trim();

        if (!cardName || !chatId) {
            throw new Error('请先打开一张角色卡，并进入一个已保存的聊天。');
        }

        return {
            context: st,
            cardName,
            chatId,
            scopeKey: `${encodeURIComponent(cardName)}::${encodeURIComponent(chatId)}`,
        };
    }

    getProfiles() {
        return this.storage.list(this.getContextInfo().scopeKey);
    }

    getProfile(profileId) {
        const profile = this.storage.get(profileId);
        if (!profile) throw new Error('角色资料不存在或已被删除。');
        return profile;
    }

    getSettings() {
        return this.storage.getSettings();
    }

    async getWorldbookCandidates(searchText = '') {
        const query = String(searchText || '').trim().toLowerCase();
        const entries = await this.worldbook.getAllCurrentEntries();

        return entries
            .filter(item => item.content.trim() && !item.content.includes('<!-- TSP_PROFILE_ID:'))
            .map(item => {
                const haystack = `${item.name}\n${item.content}`.toLowerCase();
                let score = 0;
                if (query) {
                    if (item.name.toLowerCase() === query) score += 100;
                    if (item.name.toLowerCase().includes(query)) score += 50;
                    if (haystack.includes(query)) score += 10;
                }
                if (item.enabled) score += 1;
                return { ...item, score };
            })
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'));
    }

    getMessages() {
        const { context } = this.getContextInfo();
        return Array.isArray(context.chat)
            ? context.chat.filter(message => (
                message
                && !message.is_system
                && String(message.mes ?? message.message ?? '').trim()
            ))
            : [];
    }

    buildEntryName(profile, settings = this.getSettings()) {
        const variables = {
            prefix: settings.prefix || '',
            character: profile.characterName,
            card: profile.cardName,
            chatId: profile.chatId,
            profileId: profile.profileId,
            type: '动态',
            date: dateString(profile.createdAt),
        };

        let result = String(settings.namingTemplate || '{prefix}{character}·{chatId}');
        result = result.replace(/\{(prefix|character|card|chatId|profileId|type|date)\}/g, (_, key) => (
            variables[key] ?? ''
        ));

        result = result
            .replace(/[\u0000-\u001f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return result || `【角色资料·动态】${profile.characterName}`;
    }

    async createProfile({ characterName, aliases = [], fixedSourceRefs = [] }) {
        const info = this.getContextInfo();
        const cleanName = String(characterName || '').trim();
        if (!cleanName) throw new Error('请输入角色姓名。');

        const normalizedAliases = [...new Set(
            (Array.isArray(aliases) ? aliases : String(aliases || '').split(/[,，]/))
                .map(item => String(item || '').trim())
                .filter(Boolean),
        )];

        const profileId = `tsp_${hashString(`${info.cardName}|${info.chatId}|${cleanName}`)}`;
        const existing = this.storage.get(profileId);
        if (existing) throw new Error('当前聊天中已经存在同名角色资料。');

        const fixedSources = await this.worldbook.resolveFixedSources(fixedSourceRefs);
        const fixedContent = this.combineFixedSources(fixedSources);
        const messages = this.getMessages();
        const settings = this.getSettings();
        const initialMessages = messages.slice(-Math.max(1, Number(settings.maxInitialMessages) || 60));

        const profile = {
            profileId,
            scopeKey: info.scopeKey,
            cardName: info.cardName,
            chatId: info.chatId,
            characterName: cleanName,
            aliases: normalizedAliases,
            fixedSources,
            dynamic: emptyDynamicProfile(),
            dynamicEntry: null,
            alwaysInject: false,
            lastProcessedMessageId: -1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            history: [],
        };

        profile.dynamic = await this.ai.generateDynamicProfile({
            characterName: profile.characterName,
            fixedContent,
            oldDynamic: profile.dynamic,
            messages: initialMessages,
        });
        profile.lastProcessedMessageId = messages.length - 1;
        profile.updatedAt = Date.now();

        const entryName = this.buildEntryName(profile, settings);
        const content = this.formatDynamicEntry(profile);
        profile.dynamicEntry = await this.worldbook.upsertManagedEntry(
            profile,
            entryName,
            content,
            settings,
        );

        await this.storage.upsert(profile);
        return profile;
    }

    async refreshFixedSources(profile) {
        profile.fixedSources = await this.worldbook.resolveFixedSources(profile.fixedSources);
        return profile;
    }

    combineFixedSources(fixedSources) {
        const valid = (fixedSources || []).filter(source => !source.missing && source.content.trim());
        if (!valid.length) return '';

        return valid.map(source => (
            `【世界书：${source.bookName}｜条目：${source.entryName}】\n${source.content.trim()}`
        )).join('\n\n');
    }

    async updateProfile(profileId) {
        const profile = this.getProfile(profileId);
        await this.refreshFixedSources(profile);

        const settings = this.getSettings();
        const messages = this.getMessages();
        const overlap = Math.max(0, Number(settings.overlapMessages) || 5);
        const start = Math.max(0, (profile.lastProcessedMessageId ?? -1) + 1 - overlap);
        const newMessages = messages.slice(start);

        if (!newMessages.length) {
            throw new Error('没有新的聊天内容可用于更新。');
        }

        profile.history = Array.isArray(profile.history) ? profile.history : [];
        profile.history.unshift({
            dynamic: profile.dynamic,
            updatedAt: profile.updatedAt,
            lastProcessedMessageId: profile.lastProcessedMessageId,
        });
        profile.history = profile.history.slice(0, 3);

        profile.dynamic = await this.ai.generateDynamicProfile({
            characterName: profile.characterName,
            fixedContent: this.combineFixedSources(profile.fixedSources),
            oldDynamic: profile.dynamic,
            messages: newMessages,
        });
        profile.lastProcessedMessageId = messages.length - 1;
        profile.updatedAt = Date.now();

        const entryName = this.buildEntryName(profile, settings);
        const content = this.formatDynamicEntry(profile);
        profile.dynamicEntry = await this.worldbook.upsertManagedEntry(
            profile,
            entryName,
            content,
            settings,
        );

        await this.storage.upsert(profile);
        return profile;
    }

    async deleteProfile(profileId) {
        const profile = this.getProfile(profileId);
        await this.worldbook.deleteManagedEntry(profileId, profile.dynamicEntry?.bookName);
        await this.storage.remove(profileId);
    }

    async updateSettings(nextSettings) {
        const settings = await this.storage.saveSettings(nextSettings);

        if (settings.autoRenameExisting) {
            const profiles = this.getProfiles();
            for (const profile of profiles) {
                const newName = this.buildEntryName(profile, settings);
                const renamed = await this.worldbook.renameManagedEntry(
                    profile.profileId,
                    newName,
                    profile.dynamicEntry?.bookName,
                );
                if (renamed) {
                    profile.dynamicEntry = {
                        ...(profile.dynamicEntry || {}),
                        entryName: newName,
                    };
                    await this.storage.upsert(profile);
                }
            }
        }

        return settings;
    }

    formatDynamicEntry(profile) {
        const data = profile.dynamic || emptyDynamicProfile();
        const lines = [
            '【角色动态资料】',
            '',
            `角色：${profile.characterName}`,
            `更新时间：${new Date(profile.updatedAt).toLocaleString()}`,
            '',
            `当前状态：\n${data.currentStatus || '暂无明确变化'}`,
            '',
            `当前位置：\n${data.currentLocation || '未知'}`,
            '',
            `当前情绪：\n${data.currentMood || '暂无明确变化'}`,
            '',
            `与用户关系：\n${data.relationshipWithUser || '暂无明确变化'}`,
            '',
            `对用户态度：\n${data.attitudeTowardUser || '暂无明确变化'}`,
            '',
            `当前目标：\n${data.currentGoal || '暂无明确变化'}`,
            '',
            `当前冲突：\n${data.currentConflict || '暂无明确变化'}`,
            '',
            `近期重要事件：\n${this.formatList(data.recentEvents)}`,
            '',
            `重要承诺：\n${this.formatList(data.importantPromises)}`,
            '',
            `已揭露秘密：\n${this.formatList(data.secretsRevealed)}`,
            '',
            `当前外观与着装：\n${data.currentAppearance || '暂无明确变化'}`,
            '',
            `当前关系网络：\n${this.formatList(data.currentRelationships)}`,
            '',
            `剧情进度：\n${data.plotProgress || '暂无明确变化'}`,
            '',
            `<!-- TSP_PROFILE_ID: ${profile.profileId} -->`,
            `<!-- TSP_CHARACTER: ${profile.characterName} -->`,
            `<!-- TSP_CARD: ${profile.cardName} -->`,
            `<!-- TSP_CHAT_ID: ${profile.chatId} -->`,
            `<!-- TSP_LAST_MESSAGE_ID: ${profile.lastProcessedMessageId} -->`,
            '<!-- TSP_SCHEMA_VERSION: 1 -->',
        ];

        return lines.join('\n');
    }

    formatList(value) {
        const list = Array.isArray(value) ? value.filter(Boolean) : [];
        return list.length ? list.map(item => `- ${item}`).join('\n') : '- 暂无';
    }

    static escapeHtml(value) {
        return escapeHtml(value);
    }
}
