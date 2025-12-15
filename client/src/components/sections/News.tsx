import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

const newsItems = [
  {
    id: 1,
    date: "2022.12.26",
    title: "慢寶入選世界當代建築代表作",
    image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=3000&auto=format&fit=crop",
    category: "Award"
  },
  {
    id: 2,
    date: "2022.11.08",
    title: "慢寶．世界百大建築",
    image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?q=80&w=3000&auto=format&fit=crop",
    category: "Press"
  },
  {
    id: 3,
    date: "2025.08.13",
    title: "慢寶生日獻禮",
    image: "https://images.unsplash.com/photo-1493770348161-369560ae357d?q=80&w=3000&auto=format&fit=crop",
    category: "Event"
  },
  {
    id: 4,
    date: "2025.09.15",
    title: "高級宴會廳新落成",
    image: "https://images.unsplash.com/photo-1578500494198-246f612d03b3?q=80&w=3000&auto=format&fit=crop",
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

export function News() {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  const ANIMATION_CONFIG = { duration: 0.6, ease: "easeInOut" as const };

  useEffect(() => {
    if (!api) return;
    setSnapCount(api.scrollSnapList().length);
    setSelectedIndex(api.selectedScrollSnap());
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    const onReInit = () => setSnapCount(api.scrollSnapList().length);
    api.on("select", onSelect);
    api.on("reInit", onReInit);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onReInit);
    };
  }, [api]);

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

        <Carousel opts={{ align: "start", loop: false }} setApi={setApi} className="w-full mb-12">
          <CarouselContent className="-ml-4 md:-ml-8">
            {newsItems.map((item, idx) => (
              <CarouselItem key={item.id} className="pl-4 md:pl-8 md:basis-1/3 lg:basis-1/3">
                <motion.div
                  className="group cursor-pointer select-none"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: ANIMATION_CONFIG.duration, ease: ANIMATION_CONFIG.ease, delay: idx * 0.1 }}
                >
                  <div className="relative overflow-hidden aspect-[3/4] mb-6 bg-gray-100 rounded-lg">
                    <motion.img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                      draggable={false}
                      layout
                      transition={{ duration: ANIMATION_CONFIG.duration, ease: "easeInOut" }}
                    />
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-widest rounded">
                      {item.category}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs text-gray-400 tracking-widest font-mono">{item.date}</span>
                    <h3 className="font-serif text-xl text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-snug">
                      {item.title}
                    </h3>
                    <div className="w-0 group-hover:w-12 h-[1px] bg-[#E8A0BF] transition-all duration-500 mt-4" />
                  </div>
                </motion.div>
              </CarouselItem>
            ))}
          </CarouselContent>

          {selectedIndex > 0 && (
            <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 rounded-none border-primary/20 bg-gray-400/50 hover:bg-gray-400/70 text-gray-800 backdrop-blur-sm" />
          )}
          {selectedIndex < Math.max(0, snapCount - 1) && (
            <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 rounded-none border-primary/20 bg-gray-400/50 hover:bg-gray-400/70 text-gray-800 backdrop-blur-sm" />
          )}
        </Carousel>

        <motion.div className="flex gap-2 justify-center">
          {Array.from({ length: snapCount }).map((_, idx) => (
            <motion.button
              key={idx}
              onClick={() => api?.scrollTo(idx)}
              className={`h-2 rounded-full transition-all duration-500 ${idx === selectedIndex ? "bg-primary w-8" : "bg-gray-300 w-2"}`}
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
