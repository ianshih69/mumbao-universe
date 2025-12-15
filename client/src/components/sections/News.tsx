import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";

const newsItems = [
  {
    id: 1,
    date: "2022.12.26",
    title: "灣臥入選世界當代建築代表作",
    image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=3000&auto=format&fit=crop",
    category: "Award"
  },
  {
    id: 2,
    date: "2022.11.08",
    title: "灣臥．世界百大建築",
    image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?q=80&w=3000&auto=format&fit=crop",
    category: "Press"
  },
  {
    id: 3,
    date: "2025.08.13",
    title: "灣臥生日獻禮",
    image: "https://images.unsplash.com/photo-1493770348161-369560ae357d?q=80&w=3000&auto=format&fit=crop",
    category: "Event"
  },
  {
    id: 4,
    date: "2025.09.15",
    title: "高級宴會廳新落成",
    image: "https://images.unsplash.com/photo-1578500494198-246f612d03b3?q=80https://images.unsplash.com/photo-1517457373614-b7152f800fd1?q=80&w=3000&auto=format&fit=cropw=3000https://images.unsplash.com/photo-1517457373614-b7152f800fd1?q=80&w=3000&auto=format&fit=cropauto=formathttps://images.unsplash.com/photo-1517457373614-b7152f800fd1?q=80&w=3000&auto=format&fit=cropfit=crop",
    category: "Experience"
  },
  {
    id: 5,
    date: "2025.10.20",
    title: "餐飲設計獲國際認可",
    image: "https://images.unsplash.com/photo-1567521464027-f127ff144326?q=80&w=3000&auto=format&fit=crop",
    category: "Design"
  }
];

const SLIDES_PER_VIEW = 3;

// Embla Carousel Physics Configuration (同 Rooms 頁面)
// 這些參數提供高質感的滑動阻尼和慣性效果
const CAROUSEL_PHYSICS = {
  align: "start" as const,
  loop: false,
  // Embla 的默認物理引擎已包含：
  // - 自然的加速減速曲線 (easing)
  // - 平滑的拖曳慣性 (inertia)
  // - 適當的阻尼效果 (damping)
};

export function News() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [dragCurrent, setDragCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const maxIndex = Math.max(0, newsItems.length - SLIDES_PER_VIEW);
  const showLeftArrow = currentIndex > 0;
  const showRightArrow = currentIndex < maxIndex;

  // 高質感動畫配置 (採用 Embla 物理風格)
  const ANIMATION_CONFIG = {
    duration: 0.6,
    ease: "easeInOut" as const,
  };

  const handlePrevious = () => {
    if (!isAnimating && currentIndex > 0) {
      setIsAnimating(true);
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setTimeout(() => setIsAnimating(false), ANIMATION_CONFIG.duration * 1000);
    }
  };

  const handleNext = () => {
    if (!isAnimating && currentIndex < maxIndex) {
      setIsAnimating(true);
      setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
      setTimeout(() => setIsAnimating(false), ANIMATION_CONFIG.duration * 1000);
    }
  };

  // Mouse drag handlers - 使用 Embla 風格的物理感
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAnimating) return;
    setIsDragging(true);
    setDragStart(e.clientX);
    setDragCurrent(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setDragCurrent(e.clientX);
  };

  const handleMouseUp = () => {
    if (!isDragging || isAnimating) return;
    setIsDragging(false);

    const diff = dragStart - dragCurrent;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrevious();
      }
    }
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    setDragStart(e.touches[0].clientX);
    setDragCurrent(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setDragCurrent(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (isAnimating) return;
    const diff = dragStart - dragCurrent;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrevious();
      }
    }
  };

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, isAnimating]);

  const visibleItems = newsItems.slice(currentIndex, currentIndex + SLIDES_PER_VIEW);

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 md:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="space-y-4">
            <span className="text-[#E8A0BF] text-xs tracking-[0.2em] uppercase font-bold block mb-2">
              Latest News
            </span>
            <h2 className="font-serif text-3xl md:text-4xl text-primary relative inline-block">
              最新消息
              <span className="absolute -bottom-2 left-0 w-1/2 h-[2px] bg-[#E8A0BF]" />
            </h2>
          </div>
          
          <Button variant="link" className="text-primary hover:text-[#E8A0BF] p-0 h-auto group">
            View All News <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        {/* Carousel Container */}
        <div
          ref={carouselRef}
          className={`relative mb-12 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* News Grid - 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative">
            {visibleItems.map((item, idx) => (
              <motion.div 
                key={item.id} 
                className="group cursor-pointer select-none"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: ANIMATION_CONFIG.duration, 
                  ease: ANIMATION_CONFIG.ease, 
                  delay: idx * 0.1 
                }}
              >
                {/* Image Container */}
                <div className="relative overflow-hidden aspect-[3/4] mb-6 bg-gray-100 rounded-lg">
                  <motion.img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                    draggable={false}
                    layout
                    transition={{
                      duration: ANIMATION_CONFIG.duration,
                      ease: "easeInOut"
                    }}
                  />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-widest rounded">
                    {item.category}
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-3">
                  <span className="text-xs text-gray-400 tracking-widest font-mono">
                    {item.date}
                  </span>
                  <h3 className="font-serif text-xl text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-snug">
                    {item.title}
                  </h3>
                  <div className="w-0 group-hover:w-12 h-[1px] bg-[#E8A0BF] transition-all duration-500 mt-4" />
                </div>
              </motion.div>
            ))}

            {/* Left Arrow - Inside Image */}
            {showLeftArrow && (
              <motion.button
                onClick={handlePrevious}
                disabled={isAnimating}
                className="absolute left-4 top-1/3 -translate-y-1/2 bg-gray-400/50 hover:bg-gray-400/70 backdrop-blur-sm rounded-lg p-3 transition-all duration-300 text-gray-800 z-10 disabled:opacity-50"
                aria-label="Previous"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                style={{ height: "48px", width: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <ChevronLeft className="w-6 h-6" />
              </motion.button>
            )}

            {/* Right Arrow - Inside Image */}
            {showRightArrow && (
              <motion.button
                onClick={handleNext}
                disabled={isAnimating}
                className="absolute right-4 top-1/3 -translate-y-1/2 bg-gray-400/50 hover:bg-gray-400/70 backdrop-blur-sm rounded-lg p-3 transition-all duration-300 text-gray-800 z-10 disabled:opacity-50"
                aria-label="Next"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                style={{ height: "48px", width: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <ChevronRight className="w-6 h-6" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Carousel Indicators */}
        <motion.div className="flex gap-2 justify-center">
          {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
            <motion.button
              key={idx}
              onClick={() => {
                if (!isAnimating) {
                  setIsAnimating(true);
                  setCurrentIndex(idx);
                  setTimeout(() => setIsAnimating(false), ANIMATION_CONFIG.duration * 1000);
                }
              }}
              className={`h-2 rounded-full transition-all duration-500 ${
                idx === currentIndex ? "bg-primary w-8" : "bg-gray-300 w-2"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
