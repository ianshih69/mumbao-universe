import * as React from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const rooms = [
  {
    id: 1,
    name: "Blue Ocean",
    zhName: "藍海 · 雙人房",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=3000&auto=format&fit=crop",
    desc: "Private pool with ocean view",
    poetry: "與海浪共眠的溫柔時刻",
    tags: ["22 Ping", "Sea View", "King Bed"]
  },
  {
    id: 2,
    name: "Acacia",
    zhName: "相思 · 雙人房",
    image: "https://images.unsplash.com/photo-1591088398332-8a7791972843?q=80&w=3000&auto=format&fit=crop",
    desc: "Surrounded by acacia trees",
    poetry: "微風吹拂，樹影搖曳的午後",
    tags: ["18 Ping", "Forest View", "Bathtub"]
  },
  {
    id: 3,
    name: "Moon Pond",
    zhName: "月池 · 雙人房",
    image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?q=80&w=3000&auto=format&fit=crop",
    desc: "Reflecting the moonlight",
    poetry: "月光灑落，倒映心靈的寧靜",
    tags: ["20 Ping", "Garden View", "Tatami"]
  },
  {
    id: 4,
    name: "Mist Valley",
    zhName: "霧谷 · 雙人房",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=3000&auto=format&fit=crop",
    desc: "Embrace the mountain mist",
    poetry: "山嵐繚繞，如詩如畫的仙境",
    tags: ["24 Ping", "Mountain View", "Balcony"]
  },
  {
    id: 5,
    name: "Starry Night",
    zhName: "星空 · 四人房",
    image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=3000&auto=format&fit=crop",
    desc: "Watch the stars from your bed",
    poetry: "仰望星空，許下最美的願望",
    tags: ["30 Ping", "Sky View", "Family"]
  }
];

export function Rooms() {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 md:px-8 relative">

        {/* Header */}
        <motion.div
          className="flex flex-col items-center text-center mb-16 space-y-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          viewport={{ once: true }}
        >
          <span className="text-gray-400 text-xs tracking-[0.3em] uppercase font-medium">
            The Sanctuaries
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-gray-900">
            空間 · 棲息
          </h2>
          <p className="text-gray-500 font-serif text-sm md:text-base tracking-wide mt-2 opacity-80">
            在流動的時間裡，找到一個安放靈魂的角落。
          </p>
        </motion.div>

        {/* Carousel */}
        <div className="relative md:px-14">
          <Carousel
            setApi={setApi}
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4 md:-ml-8">
              {/* 
                  CHANGE LOG: 
                  - Removed Tags loop.
                  - Adjusted h3 tracking-wide.
                  - Cleaned up layout for minimalist textual look.
                  - Added "View Room" link.
               */}
              {rooms.map((room) => (
                <CarouselItem key={room.id} className="pl-4 md:pl-8 basis-[85%] md:basis-1/2 lg:basis-1/3">
                  <div className="group cursor-pointer">
                    {/* Image Container */}
                    <div className="aspect-[4/3] overflow-hidden mb-6 bg-gray-100 rounded-none relative">
                      <img
                        src={room.image}
                        alt={room.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>

                    {/* Content Container (Below Image) */}
                    <div className="text-left space-y-2 px-1">
                      <h3 className="font-serif text-2xl text-gray-900 group-hover:text-gray-600 transition-colors tracking-wide">
                        {room.zhName}
                      </h3>

                      <p className="text-gray-500 text-sm font-serif tracking-in-widest italic opacity-80 decoration-gray-300">
                        "{room.poetry}"
                      </p>

                      <div className="pt-2">
                        <span className="text-[10px] tracking-[0.2em] uppercase text-gray-400 group-hover:text-black transition-colors flex items-center gap-2">
                          View Room <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* Navigation Buttons (Desktop Only) */}
          <div className="hidden md:block">
            <Button
              variant="outline"
              size="icon"
              className="absolute top-[35%] left-0 rounded-full w-12 h-12 border border-gray-200 bg-white/50 backdrop-blur-sm hover:bg-black hover:text-white hover:border-black transition-all duration-300"
              onClick={() => api?.scrollPrev()}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-[35%] right-0 rounded-full w-12 h-12 border border-gray-200 bg-white/50 backdrop-blur-sm hover:bg-black hover:text-white hover:border-black transition-all duration-300"
              onClick={() => api?.scrollNext()}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-12 md:mt-16">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                current === index + 1
                  ? "bg-gray-800 w-6"
                  : "bg-gray-300 hover:bg-gray-400"
              )}
              onClick={() => api?.scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Bottom Action */}
        <div className="text-center mt-12 md:mt-16">
          <Button variant="outline" className="rounded-none px-12 py-6 uppercase tracking-widest text-xs border-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white transition-all duration-500">
            View All Rooms
          </Button>
        </div>
      </div>
    </section>
  );
}
