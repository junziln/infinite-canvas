import type { CSSProperties } from "react";
import { Keyboard, Moon, Settings2, Sun } from "lucide-react";
// import { BookOpen } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
// import { GitHubLink } from "@/components/layout/github-link";
// import { VersionReleaseModal } from "@/components/layout/version-release-modal";
// import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    // const versionStyle = iconStyle;
    // const gitHubClassName = "size-7 text-base";
    // const gitHubStyle = iconStyle;

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {/* 二开阶段暂时隐藏文档与 GitHub 入口。 */}
            {/* <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a> */}
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler
                theme={theme}
                onThemeChange={setTheme}
                duration={260}
                className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-stone-300 bg-stone-200/80 p-0.5 transition-colors hover:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-stone-700 dark:bg-stone-800"
                style={iconStyle}
                aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                aria-pressed={theme === "dark"}
                title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
            >
                <span className={cn("inline-flex size-5 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm transition-transform duration-200 dark:bg-stone-950 dark:text-sky-300", theme === "dark" ? "translate-x-5" : "translate-x-0")}>
                    {theme === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />}
                </span>
            </AnimatedThemeToggler>
            {/* <VersionReleaseModal style={versionStyle} /> */}
            {/* <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} /> */}
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
