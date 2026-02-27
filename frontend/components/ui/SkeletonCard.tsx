export default function SkeletonCard() {
    return (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden animate-pulse">
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-white/[0.08]" />
                    <div className="h-4 w-12 rounded bg-white/[0.06]" />
                    <div className="h-4 w-16 rounded bg-white/[0.06]" />
                </div>
                <div className="h-6 w-28 rounded bg-white/[0.06] mb-1" />
                <div className="h-4 w-40 rounded bg-white/[0.06] mb-1" />
                <div className="h-3 w-24 rounded bg-white/[0.06] mb-4" />
                <div className="flex gap-4">
                    <div>
                        <div className="h-3 w-12 rounded bg-white/[0.06] mb-1" />
                        <div className="h-5 w-20 rounded bg-white/[0.06]" />
                    </div>
                    <div>
                        <div className="h-3 w-12 rounded bg-white/[0.06] mb-1" />
                        <div className="h-5 w-20 rounded bg-white/[0.06]" />
                    </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-2">
                    <div className="h-2 rounded-full bg-white/[0.06]" />
                    <div className="h-2 rounded-full bg-white/[0.06]" />
                </div>
            </div>
            <div className="px-4 py-3 border-t border-white/[0.06] flex justify-between">
                <div className="h-3 w-16 rounded bg-white/[0.06]" />
                <div className="flex gap-2">
                    <div className="h-6 w-16 rounded bg-white/[0.06]" />
                    <div className="h-6 w-12 rounded bg-white/[0.06]" />
                </div>
            </div>
        </div>
    );
}
