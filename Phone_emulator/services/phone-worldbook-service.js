'use strict';

const DEFAULT_RENDER_MODE = 'debounced';

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PhoneWorldbookService {
    constructor(context) {
        this.ctx = context;
        this.writeQueue = Promise.resolve();
    }

    get helper() {
        return window.TavernHelper;
    }

    ensureAvailable() {
        const helper = this.helper;
        if (!helper
            || typeof helper.getCharWorldbookNames !== 'function'
            || typeof helper.getWorldbook !== 'function'
            || typeof helper.updateWorldbookWith !== 'function') {
            throw new Error('未检测到可用的酒馆助手世界书接口。请安装酒馆助手并启用“酒馆助手宏”。');
        }
        return helper;
    }

    getCurrentWorldbookNames() {
        const helper = this.ensureAvailable();
        const result = helper.getCharWorldbookNames('current') || {};
        const primary = result.primary || null;
        const additional = Array.isArray(result.additional) ? result.additional.filter(Boolean) : [];
        return { primary, additional };
    }

    getDefaultWorldbookName() {
        const names = this.getCurrentWorldbookNames();
        return names.primary || names.additional[0] || null;
    }

    async getEntries(bookName) {
        this.ensureAvailable();
        if (!bookName) throw new Error('没有指定世界书。');
        const entries = await this.helper.getWorldbook(bookName);
        return Array.isArray(entries) ? entries : [];
    }

    async getAllCurrentEntries() {
        const names = this.getCurrentWorldbookNames();
        const bookNames = [names.primary, ...names.additional].filter(Boolean);
        const result = [];

        for (const bookName of [...new Set(bookNames)]) {
            const entries = await this.getEntries(bookName);
            for (const entry of entries) {
                result.push({
                    bookName,
                    uid: entry.uid ?? null,
                    name: entry.name || entry.comment || '未命名条目',
                    content: typeof entry.content === 'string' ? entry.content : '',
                    enabled: entry.enabled !== false,
                    raw: entry,
                });
            }
        }

        return result;
    }

    async updateEntries(bookName, updater, renderMode = DEFAULT_RENDER_MODE) {
        this.ensureAvailable();
        if (!bookName) throw new Error('当前角色卡没有绑定世界书。');

        const run = async () => this.helper.updateWorldbookWith(
            bookName,
            entries => {
                const safeEntries = Array.isArray(entries) ? entries : [];
                const updated = updater(safeEntries);
                return Array.isArray(updated) ? updated : safeEntries;
            },
            { render: renderMode },
        );

        this.writeQueue = this.writeQueue.then(run, run);
        return this.writeQueue;
    }

    async resolveFixedSources(sourceRefs) {
        const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
        const grouped = new Map();

        for (const ref of refs) {
            if (!ref?.bookName) continue;
            if (!grouped.has(ref.bookName)) {
                grouped.set(ref.bookName, await this.getEntries(ref.bookName));
            }
        }

        const resolved = [];
        for (const ref of refs) {
            const entries = grouped.get(ref.bookName) || [];
            const entry = entries.find(item => (
                ref.uid !== null
                && ref.uid !== undefined
                && item.uid === ref.uid
            )) || entries.find(item => (
                (item.name || item.comment || '') === ref.entryName
            ));

            if (!entry) {
                resolved.push({
                    ...ref,
                    missing: true,
                    content: '',
                });
                continue;
            }

            resolved.push({
                bookName: ref.bookName,
                uid: entry.uid ?? ref.uid ?? null,
                entryName: entry.name || entry.comment || ref.entryName,
                content: typeof entry.content === 'string' ? entry.content : '',
                missing: false,
            });
        }

        return resolved;
    }

    async findManagedEntry(profileId, preferredBookName = null) {
        const marker = `<!-- TSP_PROFILE_ID: ${profileId} -->`;
        const names = this.getCurrentWorldbookNames();
        const candidates = [
            preferredBookName,
            names.primary,
            ...names.additional,
        ].filter(Boolean);

        for (const bookName of [...new Set(candidates)]) {
            const entries = await this.getEntries(bookName);
            const entry = entries.find(item => (
                typeof item.content === 'string'
                && item.content.includes(marker)
            ));
            if (entry) return { bookName, entry };
        }

        return null;
    }

    async upsertManagedEntry(profile, entryName, content, settings) {
        const existing = await this.findManagedEntry(
            profile.profileId,
            profile.dynamicEntry?.bookName,
        );
        const bookName = existing?.bookName || this.getDefaultWorldbookName();
        if (!bookName) throw new Error('当前角色卡没有绑定世界书，无法写入动态资料。');

        const aliases = Array.isArray(profile.aliases) ? profile.aliases : [];
        const keys = [...new Set([profile.characterName, ...aliases].map(v => String(v || '').trim()).filter(Boolean))];
        const alwaysInject = Boolean(profile.alwaysInject);
        let savedEntry = null;

        await this.updateEntries(bookName, entries => {
            const marker = `<!-- TSP_PROFILE_ID: ${profile.profileId} -->`;
            const index = entries.findIndex(item => (
                (typeof item.content === 'string' && item.content.includes(marker))
                || (profile.dynamicEntry?.uid !== null
                    && profile.dynamicEntry?.uid !== undefined
                    && item.uid === profile.dynamicEntry.uid)
            ));

            const entryData = {
                name: entryName,
                comment: entryName,
                content,
                enabled: true,
                probability: 100,
                position: {
                    type: settings.insertionPosition || 'after_character_definition',
                    order: Number(settings.insertionOrder) || 100,
                },
                strategy: alwaysInject
                    ? {
                        type: 'constant',
                        keys: [],
                        keys_secondary: { logic: 'and_any', keys: [] },
                        scan_depth: 'same_as_global',
                    }
                    : {
                        type: 'selective',
                        keys,
                        keys_secondary: { logic: 'and_any', keys: [] },
                        scan_depth: 'same_as_global',
                    },
            };

            if (index >= 0) {
                const current = entries[index];
                entries[index] = {
                    ...current,
                    ...entryData,
                    uid: current.uid,
                };
                savedEntry = entries[index];
            } else {
                entries.push(entryData);
                savedEntry = entryData;
            }

            return entries;
        });

        if (savedEntry?.uid === null || savedEntry?.uid === undefined) {
            const refreshed = await this.getEntries(bookName);
            savedEntry = refreshed.find(item => (
                typeof item.content === 'string'
                && item.content.includes(`<!-- TSP_PROFILE_ID: ${profile.profileId} -->`)
            )) || savedEntry;
        }

        return {
            bookName,
            uid: savedEntry?.uid ?? null,
            entryName,
        };
    }

    async renameManagedEntry(profileId, newName, preferredBookName = null) {
        const found = await this.findManagedEntry(profileId, preferredBookName);
        if (!found) return false;

        await this.updateEntries(found.bookName, entries => {
            const marker = `<!-- TSP_PROFILE_ID: ${profileId} -->`;
            const target = entries.find(item => (
                typeof item.content === 'string'
                && item.content.includes(marker)
            ));
            if (target) {
                target.name = newName;
                target.comment = newName;
            }
            return entries;
        });

        return true;
    }

    async deleteManagedEntry(profileId, preferredBookName = null) {
        const found = await this.findManagedEntry(profileId, preferredBookName);
        if (!found) return false;

        const markerPattern = new RegExp(
            `<!--\\s*TSP_PROFILE_ID:\\s*${escapeRegExp(profileId)}\\s*-->`,
        );

        await this.updateEntries(
            found.bookName,
            entries => entries.filter(item => (
                !markerPattern.test(typeof item.content === 'string' ? item.content : '')
            )),
        );

        return true;
    }
}
