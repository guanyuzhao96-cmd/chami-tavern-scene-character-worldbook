'use strict';

const DYNAMIC_FIELDS = Object.freeze([
    'currentStatus',
    'currentLocation',
    'currentMood',
    'relationshipWithUser',
    'attitudeTowardUser',
    'currentGoal',
    'currentConflict',
    'recentEvents',
    'importantPromises',
    'secretsRevealed',
    'currentAppearance',
    'currentRelationships',
    'plotProgress',
]);

function emptyDynamicProfile() {
    return {
        currentStatus: '',
        currentLocation: '',
        currentMood: '',
        relationshipWithUser: '',
        attitudeTowardUser: '',
        currentGoal: '',
        currentConflict: '',
        recentEvents: [],
        importantPromises: [],
        secretsRevealed: [],
        currentAppearance: '',
        currentRelationships: [],
        plotProgress: '',
    };
}

function normalizeArray(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(/\n|；|;/)
            .map(item => item.replace(/^[-*•]\s*/, '').trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeDynamicProfile(value) {
    const source = value && typeof value === 'object' ? value : {};
    const normalized = emptyDynamicProfile();

    for (const field of DYNAMIC_FIELDS) {
        if (Array.isArray(normalized[field])) {
            normalized[field] = normalizeArray(source[field]);
        } else {
            normalized[field] = typeof source[field] === 'string'
                ? source[field].trim()
                : '';
        }
    }

    return normalized;
}

function extractTaggedPayload(text) {
    const raw = String(text || '').trim();
    const tagMatch = raw.match(/<profile_data>([\s\S]*?)<\/profile_data>/i);
    let payload = tagMatch ? tagMatch[1].trim() : raw;

    payload = payload
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        return JSON.parse(payload);
    } catch {
        const first = payload.indexOf('{');
        const last = payload.lastIndexOf('}');
        if (first >= 0 && last > first) {
            return JSON.parse(payload.slice(first, last + 1));
        }
        throw new Error('模型没有返回可解析的动态资料JSON。');
    }
}

function formatMessages(messages) {
    return messages.map((message, index) => {
        const speaker = message.is_user
            ? (window.SillyTavern?.getContext?.()?.name1 || '用户')
            : (message.name || window.SillyTavern?.getContext?.()?.name2 || '角色');
        const content = String(message.mes ?? message.message ?? '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, '')
            .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '')
            .trim();
        return content ? `【第${index + 1}条·${speaker}】\n${content}` : '';
    }).filter(Boolean).join('\n\n');
}

export class CharacterProfileAI {
    constructor(context) {
        this.ctx = context;
    }

    ensureAvailable() {
        const helper = window.TavernHelper;
        if (!helper || typeof helper.generateRaw !== 'function') {
            throw new Error('未检测到酒馆助手 generateRaw 接口，无法生成动态资料。');
        }
        return helper;
    }

    async generateDynamicProfile({
        characterName,
        fixedContent,
        oldDynamic,
        messages,
    }) {
        const helper = this.ensureAvailable();
        const historyText = formatMessages(messages);

        const systemPrompt = `你是角色动态资料维护器。请严格遵守：
1. “固定资料”来自世界书，是不可修改、不可推翻的事实，只能作为约束。
2. 你只能生成“动态资料”，不得复述或改写固定资料。
3. 结合旧动态资料与新增聊天，输出角色此刻的状态。
4. 没有明确变化依据的字段保留旧值；不要凭空制造事件、关系或秘密。
5. 只输出一个 <profile_data> 标签，标签内部必须是合法JSON，不得输出Markdown或解释。
6. JSON字段必须完整包含：
currentStatus, currentLocation, currentMood, relationshipWithUser,
attitudeTowardUser, currentGoal, currentConflict, recentEvents,
importantPromises, secretsRevealed, currentAppearance,
currentRelationships, plotProgress。
其中 recentEvents、importantPromises、secretsRevealed、currentRelationships 必须是字符串数组。`;

        const prompts = [
            { role: 'system', content: systemPrompt },
            {
                role: 'system',
                content: `【目标角色】\n${characterName}\n\n【固定资料·只读】\n${fixedContent || '(未绑定固定世界书条目)'}`,
            },
            {
                role: 'assistant',
                content: `【旧动态资料】\n${JSON.stringify(oldDynamic || emptyDynamicProfile(), null, 2)}`,
            },
            {
                role: 'assistant',
                content: `【本次聊天上下文】\n${historyText || '(没有可用聊天内容)'}`,
            },
            {
                role: 'user',
                content: '现在更新动态资料，只输出 <profile_data>JSON</profile_data>。',
            },
        ];

        const response = await helper.generateRaw({
            user_input: '执行角色动态资料更新任务。',
            max_chat_history: 0,
            should_stream: false,
            should_silence: false,
            ordered_prompts: prompts,
        });

        const responseText = typeof response === 'string'
            ? response
            : response?.content || response?.data || response?.text || '';

        if (!responseText) {
            throw new Error('模型返回内容为空。');
        }

        return normalizeDynamicProfile(extractTaggedPayload(responseText));
    }
}

export { emptyDynamicProfile, normalizeDynamicProfile };
