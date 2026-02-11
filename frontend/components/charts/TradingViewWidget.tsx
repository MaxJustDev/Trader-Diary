"use client";

import { useEffect, useRef, memo } from "react";

interface TradingViewWidgetProps {
    symbol: string;
}

function TradingViewWidget({ symbol }: TradingViewWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous widget
        containerRef.current.innerHTML = "";

        const script = document.createElement("script");
        script.src =
            "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol: `FX:${symbol}`,
            interval: "15",
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "en",
            allow_symbol_change: true,
            support_host: "https://www.tradingview.com",
            hide_top_toolbar: false,
            hide_side_toolbar: false,
            hide_legend: false,
            save_image: true,
            calendar: false,
            hide_volume: true,
            withdateranges: true,
            details: true,
            hotlist: false,
            show_popup_button: true,
            popup_width: "1000",
            popup_height: "650",
            studies: [],
            enable_publishing: false,
        });

        containerRef.current.appendChild(script);
    }, [symbol]);

    return (
        <div className="tradingview-widget-container h-full w-full">
            <div
                ref={containerRef}
                className="tradingview-widget-container__widget h-full w-full"
            />
        </div>
    );
}

export default memo(TradingViewWidget);
