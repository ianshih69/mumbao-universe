import { useState, useEffect } from "react";

export function useMobileViewportHeight() {
    const [height, setHeight] = useState<number | null>(null);

    useEffect(() => {
        // Only set height once on mount to prevent resize jitter
        setHeight(window.innerHeight);
    }, []);

    return height;
}
