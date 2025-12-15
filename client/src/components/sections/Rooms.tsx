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
    zhName: "藍海雙人房",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=3000&auto=format&fit=crop",
    desc: "Private pool with ocean view"
  },
  {
    id: 2,
    name: "Acacia",
    zhName: "相思雙人房",
    image: "https://images.unsplash.com/photo-1591088398332-8a7791972843?q=80&w=3000&auto=format&fit=crop",
    desc: "Surrounded by acacia trees"
  },
  {
    id: 3,
    name: "Moon Pond",
    zhName: "月池雙人房",
    image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?q=80&w=3000&auto=format&fit=crop",
    desc: "Reflecting the moonlight"
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
          <span className="text-[#E8A0BF] text-xs tracking-[0.2em] uppercase font-bold">
            Accommodation
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-primary">
            房型介紹
          </h2>
          <div className="w-12 h-[1px] bg-primary/20" />
        </motion.div>

        {/* Carousel */}
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-4 md:-ml-8">
            {rooms.map((room) => (
              <CarouselItem key={room.id} className="pl-4 md:pl-8 md:basis-1/2 lg:basis-2/3">
                <div className="group relative aspect-[16/9] overflow-hidden cursor-pointer">
                  <img
                    src={room.image}
                    alt={room.name}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                  
                  <div className="absolute bottom-0 left-0 p-8 md:p-12 text-white w-full">
                    <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                      <h3 className="font-serif text-3xl md:text-4xl mb-2">
                        {room.zhName} <span className="text-lg opacity-70 ml-2 font-sans tracking-wider">{room.name}</span>
                      </h3>
                      <p className="text-sm opacity-0 group-hover:opacity-80 transition-opacity duration-500 delay-100 mb-6">
                        {room.desc}
                      </p>
                      <div className="flex items-center gap-2 text-xs tracking-widest uppercase border-b border-white/30 pb-1 inline-flex opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-200">
                        View Details <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          <div className="flex justify-end gap-4 mt-8 pr-4">
            <CarouselPrevious className="static translate-y-0 rounded-none border-primary/20 hover:bg-primary hover:text-white" />
            <CarouselNext className="static translate-y-0 rounded-none border-primary/20 hover:bg-primary hover:text-white" />
          </div>
        </Carousel>

        <div className="text-center mt-12">
          <Button variant="outline" className="rounded-none px-12 py-6 uppercase tracking-widest text-xs border-primary/20 hover:bg-primary hover:text-white transition-colors">
            View All Rooms
          </Button>
        </div>
      </div>
    </section>
  );
}
