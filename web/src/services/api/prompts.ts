export type PromptListItem = {
    id: string;
    title: string;
    coverUrl: string;
    tags: string[];
    category: string;
    createdAt: string;
    updatedAt: string;
    author?: string;
};

export type Prompt = PromptListItem & {
    prompt: string;
    githubUrl: string;
    preview: string;
    license?: string;
    sourceUrl?: string;
    images?: string[];
};

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: PromptListItem[];
    tags: string[];
    categories: string[];
    total: number;
};

type PromptPayload = {
    items?: Prompt[];
};

type PromptDetailPayload = {
    item?: Prompt;
};

const promptDataBaseUrl = "/prompt-data";
const promptApiBaseUrl = "/prompt-api";
let promptShowcase: Promise<Prompt[]> | null = null;
const promptDetails = new Map<string, Promise<Prompt>>();

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page = 1, pageSize = 20 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (isActiveOption(category)) params.set("category", category);
    tag.forEach((value) => params.append("tag", value));
    return requestJSON<PromptListResponse>(`${promptApiBaseUrl}/prompts?${params.toString()}`);
}

export async function fetchPrompt(id: string) {
    const cached = promptDetails.get(id);
    if (cached) return cached;

    const request = requestJSON<PromptDetailPayload>(`${promptApiBaseUrl}/prompts/${encodeURIComponent(id)}`)
        .then((payload) => {
            if (!payload.item) throw new Error("提示词不存在");
            return payload.item;
        })
        .catch((error) => {
            promptDetails.delete(id);
            throw error;
        });
    promptDetails.set(id, request);
    return request;
}

export async function fetchPromptShowcase(pageSize = 12) {
    promptShowcase ||= loadPromptShowcase();
    const items = await promptShowcase;
    return {
        items: items.slice(0, Math.max(1, pageSize)),
        tags: collectTags(items),
        categories: Array.from(new Set(items.map((item) => item.category).filter(Boolean))),
        total: items.length,
    };
}

async function loadPromptShowcase() {
    const payload = await requestJSON<PromptPayload>(`${promptDataBaseUrl}/showcase.json`, { cache: "no-cache" });
    return Array.isArray(payload.items) ? payload.items : [];
}

async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (response.ok) return response.json() as Promise<T>;

    let message = response.status === 429 ? "操作过于频繁，请稍后再试" : "提示词数据加载失败";
    try {
        const payload = (await response.json()) as { message?: string };
        if (payload.message) message = payload.message;
    } catch {
        // 非标准错误响应沿用统一提示。
    }
    throw new Error(message);
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== ALL_PROMPTS_OPTION && value !== "all";
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
