import { ArrowLeft, ArrowRight, FileText, ImagePlus, Images, Maximize2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Image } from "antd";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";

const displayFont = { fontFamily: '"Songti SC", "STSong", "Noto Serif SC", serif' };

const creativePrinciples = [
    {
        title: "捕捉闪现的灵感",
        description: "一个念头、一段文字或一张参考图，都能成为创作的第一步。",
    },
    {
        title: "推动漫长的思考",
        description: "把不同方向留在同一张画布上，对比、连接，再从任意节点继续。",
    },
    {
        title: "让想法变成作品",
        description: "图片、文字与视频彼此衔接，让零散尝试逐渐形成完整表达。",
    },
];

const promptIdeas = ["雨夜霓虹中的未来城市", "为新品设计一组视觉海报", "把参考图延展成新的画面", "一间漂浮在云端的创作工作室"];

const heroModes = [
    { label: "画布", path: "/canvas", icon: Maximize2 },
    { label: "图片", path: "/image", icon: ImagePlus },
    { label: "视频", path: "/video", icon: Video },
    { label: "提示词", path: "/prompts", icon: FileText },
    { label: "素材", path: "/assets", icon: Images },
] as const;

const fallbackHeroWorks = [
    { title: "复古视觉海报", tone: "#e9e1d5" },
    { title: "品牌创意构图", tone: "#d9e5ea" },
    { title: "叙事插画实验", tone: "#ead8d2" },
    { title: "单色版式研究", tone: "#deddd8" },
    { title: "视觉概念探索", tone: "#d8e1d5" },
];

export default function IndexPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const heroWorksRef = useRef<HTMLDivElement>(null);
    const [heroPrompt, setHeroPrompt] = useState("");
    const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
    const [ideaIndex, setIdeaIndex] = useState(0);
    const [deletingIdea, setDeletingIdea] = useState(false);
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    useEffect(() => {
        if (heroPrompt) return;
        const idea = promptIdeas[ideaIndex];
        if (reduceMotion) {
            if (animatedPlaceholder !== idea) setAnimatedPlaceholder(idea);
            return;
        }

        const atEnd = !deletingIdea && animatedPlaceholder === idea;
        const atStart = deletingIdea && !animatedPlaceholder;
        const delay = atEnd ? 1500 : atStart ? 300 : deletingIdea ? 38 : 72;
        const timer = window.setTimeout(() => {
            if (atEnd) {
                setDeletingIdea(true);
                return;
            }
            if (atStart) {
                setDeletingIdea(false);
                setIdeaIndex((current) => (current + 1) % promptIdeas.length);
                return;
            }
            setAnimatedPlaceholder(idea.slice(0, animatedPlaceholder.length + (deletingIdea ? -1 : 1)));
        }, delay);

        return () => window.clearTimeout(timer);
    }, [animatedPlaceholder, deletingIdea, heroPrompt, ideaIndex, reduceMotion]);

    const principleImages = [
        promptShowcase[0]?.coverUrl || "/landing/canvas-editor.png",
        promptShowcase[1]?.coverUrl || "/landing/canvas-branches.png",
        promptShowcase[2]?.coverUrl || "/landing/canvas-editor.png",
    ];
    const heroWorks = fallbackHeroWorks.map((fallback, index) => ({
        ...fallback,
        image: promptShowcase[index]?.coverUrl,
        title: promptShowcase[index]?.title || fallback.title,
    }));
    const reveal = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 22 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, amount: 0.16 },
              transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
          };

    const startFromHero = () => {
        const prompt = heroPrompt.trim();
        if (prompt) useWorkbenchAgentStore.getState().dispatchImage({ prompt, run: false });
        navigate("/image");
    };

    const scrollHeroWorks = (direction: -1 | 1) => heroWorksRef.current?.scrollBy({ left: direction * 340, behavior: reduceMotion ? "auto" : "smooth" });

    return (
        <main className="h-full overflow-y-auto bg-[#f3f2f0] text-[#1d1d1b] dark:bg-[#141412] dark:text-[#f1f0eb]">
            <section className="relative h-[calc(100svh-6rem)] min-h-[530px] max-h-[840px] overflow-hidden bg-[#b9d7e9] text-white shadow-[inset_0_0_90px_36px_rgba(243,242,240,.9)] sm:shadow-[inset_0_0_180px_72px_rgba(243,242,240,.92)] dark:bg-[#2d4858] dark:shadow-[inset_0_0_150px_60px_rgba(20,20,18,.72)]">
                <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                    className="relative z-10 mx-auto flex h-full max-w-6xl flex-col items-center px-5 pt-6 text-center sm:px-6 sm:pt-8"
                >
                    <h1 className="text-5xl font-semibold leading-none tracking-normal sm:text-7xl lg:text-8xl" style={displayFont}>
                        大胆创作
                    </h1>
                    <p className="mt-4 text-sm font-medium text-white/65 sm:text-lg">心有所想，皆可呈现。</p>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            startFromHero();
                        }}
                        className="mt-6 flex min-h-20 w-full max-w-3xl flex-col gap-2 rounded-[8px] bg-white/48 p-3 text-left text-[#171817] shadow-[0_14px_40px_rgba(52,87,108,.12)] backdrop-blur-md sm:min-h-24 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                    >
                        <label htmlFor="hero-prompt" className="shrink-0 text-sm font-semibold sm:text-base">
                            你想创作什么？
                        </label>
                        <div className="relative min-h-10 min-w-0 flex-1">
                            <input
                                id="hero-prompt"
                                value={heroPrompt}
                                onChange={(event) => setHeroPrompt(event.target.value)}
                                className="h-10 w-full bg-transparent text-sm text-[#252522] outline-none placeholder:text-transparent"
                                autoComplete="off"
                            />
                            {!heroPrompt ? (
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center truncate text-sm text-black/35">
                                    输入一个想法，比如：{animatedPlaceholder}
                                    <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-black/40" />
                                </span>
                            ) : null}
                        </div>
                        <button type="submit" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1c1c1a] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60">
                            开始
                            <ArrowRight className="size-4" />
                        </button>
                    </form>

                    <div className="hide-scrollbar mt-3 flex max-w-full items-center gap-1 overflow-x-auto px-1 py-1 text-[#35434b] sm:mt-4 sm:justify-center">
                        {heroModes.map((mode) => {
                            const Icon = mode.icon;
                            const active = mode.path === "/image";
                            return (
                                <button
                                    key={mode.path}
                                    type="button"
                                    onClick={() => navigate(mode.path)}
                                    className={cn(
                                        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition hover:bg-white/35",
                                        active && "bg-white/75 shadow-[0_6px_18px_rgba(74,102,118,.1)]",
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="relative mt-3 w-full max-w-5xl sm:mt-4">
                        <button type="button" onClick={() => scrollHeroWorks(-1)} className="absolute left-0 top-[62px] z-10 hidden size-9 -translate-x-1/2 items-center justify-center rounded-full bg-white/35 text-[#35434b] backdrop-blur transition hover:bg-white/65 sm:flex" aria-label="向左浏览作品" title="向左浏览作品">
                            <ArrowLeft className="size-4" />
                        </button>
                        <div ref={heroWorksRef} className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:justify-center">
                            {heroWorks.map((work, index) => (
                                <button
                                    key={`${work.title}-${index}`}
                                    type="button"
                                    onClick={() => {
                                        if (!promptShowcase[index]) return navigate("/prompts");
                                        setPreviewIndex(index);
                                        setPreviewOpen(true);
                                    }}
                                    className="group w-[112px] shrink-0 snap-start text-left text-[#35434b] sm:w-[138px]"
                                >
                                    <span className="block h-[128px] overflow-hidden rounded-[8px] shadow-[0_8px_24px_rgba(50,81,98,.12)] sm:h-[156px]" style={{ backgroundColor: work.tone }}>
                                        {work.image ? <img src={work.image} alt={work.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" /> : <span className="flex h-full items-end p-3 text-lg font-semibold leading-tight" style={displayFont}>{work.title}</span>}
                                    </span>
                                    <span className="mt-2 block truncate text-center text-xs font-medium">{work.title}</span>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => scrollHeroWorks(1)} className="absolute right-0 top-[62px] z-10 hidden size-9 translate-x-1/2 items-center justify-center rounded-full bg-white/35 text-[#35434b] backdrop-blur transition hover:bg-white/65 sm:flex" aria-label="向右浏览作品" title="向右浏览作品">
                            <ArrowRight className="size-4" />
                        </button>
                    </div>

                    <div className="mt-auto hidden w-full max-w-4xl grid-cols-4 gap-6 pb-5 text-[#35434b] sm:grid">
                        <div><strong className="block text-sm">浏览器</strong><span className="mt-1 block text-xs opacity-55">即开即用</span></div>
                        <div><strong className="block text-sm">本地存储</strong><span className="mt-1 block text-xs opacity-55">数据在自己手中</span></div>
                        <div><strong className="block text-sm">多模态</strong><span className="mt-1 block text-xs opacity-55">图片、视频与音频</span></div>
                        <div><strong className="block text-sm">智能体</strong><span className="mt-1 block text-xs opacity-55">连接本地创作工具</span></div>
                    </div>
                </motion.div>
            </section>

            <motion.section {...reveal} className="bg-[#f3f2f0] dark:bg-[#141412]">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-28">
                    <h2 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl" style={displayFont}>
                        每个想法都值得变成作品，<br />无限画布让这一切成为可能。
                    </h2>

                    <div className="mt-12 grid gap-8 md:grid-cols-3">
                        {creativePrinciples.map((item, index) => (
                            <article key={item.title}>
                                <div className="aspect-[4/5] overflow-hidden rounded-[8px] bg-[#dcdbd7] dark:bg-[#242420]">
                                    <img src={principleImages[index]} alt={item.title} className="h-full w-full object-cover transition duration-500 hover:scale-[1.02]" />
                                </div>
                                <h3 className="mt-5 text-2xl font-semibold" style={displayFont}>
                                    {item.title}
                                </h3>
                                <p className="mt-3 text-sm leading-7 text-black/55 dark:text-white/55">{item.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </motion.section>

            <motion.section {...reveal} className="bg-[#f3f2f0] dark:bg-[#141412]">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-28">
                    <div className="text-center">
                        <p className="text-xs text-black/45 dark:text-white/45">连接生成、编辑与沉淀</p>
                        <h2 className="mt-4 text-4xl font-semibold sm:text-6xl" style={displayFont}>
                            你的人工智能创作工作室
                        </h2>
                    </div>

                    <button type="button" onClick={() => navigate("/canvas")} className="group relative mt-12 block aspect-[16/8] w-full overflow-hidden rounded-[8px] bg-[#171715] text-left sm:aspect-[16/7]">
                        <img src="/landing/canvas-branches.png" alt="无限画布多分支创作界面" className="h-full w-full object-contain transition duration-700 group-hover:scale-[1.015]" />
                        <span className="absolute bottom-4 left-4 inline-flex h-9 items-center gap-2 rounded-full bg-black/65 px-4 text-xs font-semibold text-white backdrop-blur sm:bottom-6 sm:left-6">
                            查看画布
                            <ArrowRight className="size-3.5" />
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate("/image")}
                        className="mt-8 flex min-h-16 w-full items-center gap-4 rounded-[8px] bg-white px-5 text-left shadow-[0_8px_28px_rgba(30,30,28,.045)] transition hover:shadow-[0_10px_30px_rgba(30,30,28,.08)] dark:bg-[#20201d]"
                    >
                        <span className="shrink-0 text-base font-semibold">你想创作什么？</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-black/35 dark:text-white/35">输入一个想法，或者从一张图片出发...</span>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1c1c1a] text-white dark:bg-[#f3f2ed] dark:text-[#1c1c1a]">
                            <ArrowRight className="size-4" />
                        </span>
                    </button>
                </div>
            </motion.section>

            {promptShowcase.length ? (
                <motion.section {...reveal} className="bg-[#f3f2f0] dark:bg-[#141412]">
                    <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-28">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-4xl font-semibold sm:text-5xl" style={displayFont}>
                                    用无限画布创作
                                </h2>
                                <p className="mt-3 text-sm text-black/45 dark:text-white/45">来自提示词库的真实创作片段</p>
                            </div>
                            <button type="button" onClick={() => navigate("/prompts")} className="inline-flex h-10 w-fit items-center gap-2 text-sm font-semibold transition hover:gap-3">
                                查看更多
                                <ArrowRight className="size-4" />
                            </button>
                        </div>

                        <div className="mt-10 grid auto-rows-[240px] gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                            {promptShowcase.slice(0, 6).map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        setPreviewIndex(index);
                                        setPreviewOpen(true);
                                    }}
                                    className="group min-w-0 text-left"
                                >
                                    <span className="block h-[180px] overflow-hidden rounded-[8px] bg-[#dbdad6] dark:bg-[#242420]">
                                        <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
                                    </span>
                                    <span className="mt-3 flex items-start justify-between gap-3">
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">{item.title}</span>
                                            <span className="mt-1 block truncate text-xs text-black/40 dark:text-white/40">{item.tags.slice(0, 3).join(" · ")}</span>
                                        </span>
                                        <ArrowRight className="mt-0.5 size-4 shrink-0 transition group-hover:translate-x-1" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.section>
            ) : null}

            <section className="relative h-[360px] overflow-hidden bg-[#111] sm:h-[480px]">
                <img src="/landing/canvas-branches.png" alt="无限画布创作空间" className="absolute inset-0 h-full w-full object-cover object-center opacity-55" />
                <div className="absolute inset-0 bg-black/35" />
                <div className="relative z-10 flex h-full items-center justify-center px-6 text-center text-white">
                    <h2 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl" style={displayFont}>
                        想创作的念头，<br />在心里转了多久？
                    </h2>
                </div>
            </section>

            <motion.section {...reveal} className="bg-[#f3f2f0] dark:bg-[#141412]">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-28">
                    <div className="text-center">
                        <h2 className="text-5xl font-semibold sm:text-7xl" style={displayFont}>
                            大胆创作
                        </h2>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-black/45 dark:text-white/45">无限画布是每一位视觉创作者，都值得拥有的好工具。</p>
                        <button type="button" onClick={() => navigate("/canvas")} className="mt-8 inline-flex h-12 items-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-[#171817] shadow-[0_10px_30px_rgba(30,30,28,.08)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(30,30,28,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 dark:bg-[#f3f2ed]">
                            开始创作
                            <ArrowRight className="size-5" />
                        </button>
                    </div>

                    <div className="mt-20 grid gap-12 sm:grid-cols-3 sm:gap-16">
                        <div>
                            <div className="text-6xl font-semibold">∞</div>
                            <h3 className="mt-5 text-lg font-semibold">自由画布</h3>
                            <p className="mt-2 text-sm leading-6 text-black/45 dark:text-white/45">让节点、连接和分支自然展开。</p>
                        </div>
                        <div>
                            <div className="text-5xl font-semibold">本地</div>
                            <h3 className="mt-6 text-lg font-semibold">数据优先</h3>
                            <p className="mt-2 text-sm leading-6 text-black/45 dark:text-white/45">画布、素材和配置保存在浏览器本地。</p>
                        </div>
                        <div>
                            <div className="text-5xl font-semibold">连续</div>
                            <h3 className="mt-6 text-lg font-semibold">创作脉络</h3>
                            <p className="mt-2 text-sm leading-6 text-black/45 dark:text-white/45">每个结果都能成为下一次探索的起点。</p>
                        </div>
                    </div>
                </div>
            </motion.section>

            <footer className="bg-[#f3f2f0] text-[#24211f] dark:bg-[#141412] dark:text-[#f4eee9]">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="size-5 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                        无限画布
                    </span>
                    <button type="button" onClick={() => navigate("/image")} className="inline-flex h-10 w-fit items-center gap-2 text-sm font-semibold transition hover:gap-3">
                        从一个想法开始
                        <ImagePlus className="size-4" />
                    </button>
                </div>
            </footer>

            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {promptShowcase.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
