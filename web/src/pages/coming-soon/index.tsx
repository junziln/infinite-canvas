import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

type ComingSoonPageProps = {
    title: string;
    icon: LucideIcon;
};

export default function ComingSoonPage({ title, icon: Icon }: ComingSoonPageProps) {
    return (
        <main className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden bg-[#f3f2f0] px-6 text-[#1d1d1b] dark:bg-[#141412] dark:text-[#f1f0eb]">
            <div
                className="pointer-events-none absolute inset-0 opacity-35 dark:opacity-20"
                style={{ backgroundImage: "radial-gradient(currentColor 0.7px, transparent 0.7px)", backgroundSize: "22px 22px" }}
            />
            <span className="pointer-events-none absolute bottom-[-7rem] right-[-2rem] font-serif text-[25rem] font-semibold leading-none text-black/[0.025] dark:text-white/[0.025]" aria-hidden="true">
                ∞
            </span>

            <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
                <span className="inline-flex size-12 items-center justify-center border border-black/10 bg-white text-[#1d1d1b] shadow-[0_12px_32px_rgba(28,28,26,.06)] dark:border-white/10 dark:bg-[#20201d] dark:text-white">
                    <Icon className="size-5" />
                </span>
                <p className="mt-7 text-xs font-medium text-black/40 dark:text-white/40">TokenShen</p>
                <h1 className="mt-3 text-4xl font-semibold sm:text-6xl">{title}</h1>
                <p className="mt-5 text-base text-black/45 dark:text-white/45">敬请期待</p>
                <Link to="/" className="mt-9 inline-flex h-10 items-center gap-2 text-sm font-semibold text-black/65 transition hover:gap-3 hover:text-black dark:text-white/65 dark:hover:text-white">
                    <ArrowLeft className="size-4" />
                    返回首页
                </Link>
            </div>
        </main>
    );
}
