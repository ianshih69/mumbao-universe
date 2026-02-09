import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

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
  }
];

export function Rooms() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">

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

        {/* Desktop Grid Layout */}
        <div className="hidden md:grid grid-cols-3 gap-8">
          {rooms.map((room, idx) => (
            <motion.div
              key={room.id}
              className="group cursor-pointer"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: idx * 0.1 }}
              viewport={{ once: true }}
            >
              {/* Image Container */}
              <div className="aspect-[4/3] overflow-hidden mb-6 bg-gray-100 rounded-none relative">
                <img
                  src={room.image}
                  alt={room.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>

              {/* Content Container (Below Image) */}
              <div className="text-left space-y-3">
                <h3 className="font-serif text-2xl text-gray-900 group-hover:text-gray-600 transition-colors">
                  {room.zhName}
                </h3>

                {/* Tags */}
                <div className="flex gap-3 text-[10px] text-gray-400 uppercase tracking-wider font-sans">
                  {room.tags.map((tag, i) => (
                    <span key={i} className="border border-gray-200 px-2 py-1 rounded-sm">
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="text-gray-500 text-sm font-serif tracking-in-widest italic pt-2 opacity-80 decoration-gray-300">
                  "{room.poetry}"
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile Swiper Layout */}
        <div className="md:hidden">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {rooms.map((room) => (
                <CarouselItem key={room.id} className="pl-4 basis-[85%]">
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
                    <div className="text-left space-y-3 px-1">
                      <h3 className="font-serif text-2xl text-gray-900">
                        {room.zhName}
                      </h3>

                      {/* Tags */}
                      <div className="flex gap-2 text-[10px] text-gray-400 uppercase tracking-wider font-sans flex-wrap">
                        {room.tags.map((tag, i) => (
                          <span key={i} className="border border-gray-200 px-2 py-1 rounded-sm">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-gray-500 text-sm font-serif tracking-in-widest italic pt-2 opacity-80">
                        "{room.poetry}"
                      </p>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        {/* Bottom Action */}
        <div className="text-center mt-20">
          <Button variant="outline" className="rounded-none px-12 py-6 uppercase tracking-widest text-xs border-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white transition-all duration-500">
            View All Rooms
          </Button>
        </div>
      </div>
    </section>
  );
}
