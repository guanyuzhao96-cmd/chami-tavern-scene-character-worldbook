'use strict';

const STATE_KEY = 'phone_character_profile_state_v1';
const SETTINGS_KEY = 'phone_character_profile_settings_v1';

const DEFAULT_SETTINGS = Object.freeze({
    prefix: '【角色资料·动态】',
    namingTemplate: '{prefix}{character}·{chatId}',
    autoRenameExisting: true,
    insertionPosition: 'after_character_definition',
    insertionOrder: 100,
    maxInitialMessages: 60,
    overlapMessages: 5,
});

export class CharacterProfileStorage {
    constructor(context) {
        this.ctx = context;
        this.state = { profiles: {} };
        this.settings = { ...DEFAULT_SETTINGS };
    }

    async init() {
        this.state = await this._read(STATE_KEY, { profiles: {} });
        if (!this.state || typeof this.state !== 'object') {
            this.state = { profiles: {} };
        }
        if (!this.state.profiles || typeof this.state.profiles !== 'object') {
            this.state.profiles = {};
        }

        const savedSettings = await this._read(SETTINGS_KEY, {});
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(savedSettings && typeof savedSettings === 'object' ? savedSettings : {}),
        };
    }

    async _read(key, fallback) {
        try {
            if (this.ctx?.api?.getValue) {
                return await this.ctx.api.getValue(key, fallback);
            }
        } catch (error) {
            this.ctx?.error?.('character-profile-storage', `读取 ${key} 失败`, error);
        }

        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    async _write(key, value) {
        if (this.ctx?.api?.setValue) {
            await this.ctx.api.setValue(key, value);
            return;
        }
        localStorage.setItem(key, JSON.stringify(value));
    }

    async saveState() {
        await this._write(STATE_KEY, this.state);
    }

    async saveSettings(settings) {
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(settings || {}),
        };
        await this._write(SETTINGS_KEY, this.settings);
        return this.settings;
    }

    getSettings() {
        return { ...this.settings };
    }

    list(scopeKey) {
        return Object.values(this.state.profiles)
            .filter(profile => profile.scopeKey === scopeKey)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    get(profileId) {
        return this.state.profiles[profileId] || null;
    }

    async upsert(profile) {
        this.state.profiles[profile.profileId] = profile;
        await this.saveState();
        return profile;
    }

    async remove(profileId) {
        delete this.state.profiles[profileId];
        await this.saveState();
    }
}

export { DEFAULT_SETTINGS };
