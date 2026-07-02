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
import { Link } from "wouter";
import { rooms } from "@/data/rooms";

function getVisibleRoomCount() {
  if (typeof window === "undefined") return 1;
  if (window.matchMedia("(min-width: 1024px)").matches) return 3;
  if (window.matchMedia("(min-width: 768px)").matches) return 2;
  return 1;
}

export function Rooms() {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(getVisibleRoomCount);
  const maxStartIndex = Math.max(rooms.length - visibleCount, 0);
  const pageCount = maxStartIndex + 1;
  const canScrollPrev = current > 0;
  const canScrollNext = current < maxStartIndex;

  React.useEffect(() => {
    const updateVisibleCount = () => {
      setVisibleCount(getVisibleRoomCount());
    };

    updateVisibleCount();
    window.addEventListener("resize", updateVisibleCount);

    return () => {
      window.removeEventListener("resize", updateVisibleCount);
    };
  }, []);

  React.useEffect(() => {
    setCurrent((index) => {
      const nextIndex = Math.min(index, maxStartIndex);
      if (api && nextIndex !== index) {
        api.scrollTo(nextIndex);
      }
      return nextIndex;
    });
  }, [api, maxStartIndex]);

  React.useEffect(() => {
    if (!api) return;

    const syncCurrent = () => {
      const selectedIndex = api.selectedScrollSnap();
      const nextIndex = Math.min(selectedIndex, maxStartIndex);
      setCurrent(nextIndex);
      if (selectedIndex > maxStartIndex) {
        api.scrollTo(maxStartIndex);
      }
    };

    syncCurrent();
    api.on("select", syncCurrent);
    api.on("reInit", syncCurrent);

    return () => {
      api.off("select", syncCurrent);
      api.off("reInit", syncCurrent);
    };
  }, [api, maxStartIndex]);

  const scrollToRoom = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, maxStartIndex));
    setCurrent(nextIndex);
    api?.scrollTo(nextIndex);
  };

  return (
    <section className="scroll-mt-28 bg-white py-24 md:scroll-mt-32" id="rooms">
      <div className="container relative mx-auto px-4 md:px-8">
        <motion.div
          className="mb-16 flex flex-col items-center space-y-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          viewport={{ once: true }}
        >
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-gray-400">
            The Sanctuaries
          </span>
          <h2 className="font-serif text-4xl text-gray-900 md:text-5xl">
            房型介紹
          </h2>
          <p className="mt-2 font-serif text-sm tracking-wide text-gray-500 opacity-80 md:text-base">
            五間公開主題房，一間留給宇宙的隱藏星房。
          </p>
        </motion.div>

        <div className="relative md:px-14">
          <Carousel
            setApi={setApi}
            opts={{
              align: "start",
              loop: false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4 md:-ml-8">
              {rooms.map((room) => (
                <CarouselItem key={room.id} className="basis-[85%] pl-4 md:basis-1/2 md:pl-8 lg:basis-1/3">
                  <Link href={`/rooms/${room.slug}`} className="group block cursor-pointer">
                    <div className="relative mb-6 aspect-[4/3] overflow-hidden bg-gray-100">
                      <img
                        src={room.image}
                        alt={room.alt}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>

                    <div className="space-y-2 px-1 text-left">
                      <span className="block text-[10px] uppercase tracking-[0.24em] text-gray-400">
                        ROOM {room.roomNumber}
                      </span>
                      <h3 className="font-serif text-[26px] leading-tight tracking-wide text-gray-900 transition-colors group-hover:text-gray-600 md:text-[28px]">
                        {room.name}主題房
                      </h3>
                      <p className="text-sm tracking-[0.12em] text-gray-500">
                        守護星座｜{room.stars}
                      </p>

                      <p className="font-serif text-sm leading-relaxed tracking-wide text-gray-600 decoration-gray-300">
                        {room.tagline}
                      </p>

                      <div className="pt-2">
                        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gray-400 transition-colors group-hover:text-black">
                          View Room <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="hidden md:block">
            {canScrollPrev && (
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-[35%] h-12 w-12 rounded-full border border-gray-200 bg-white/50 backdrop-blur-sm transition-all duration-300 hover:border-black hover:bg-black hover:text-white"
                onClick={() => scrollToRoom(current - 1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {canScrollNext && (
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-[35%] h-12 w-12 rounded-full border border-gray-200 bg-white/50 backdrop-blur-sm transition-all duration-300 hover:border-black hover:bg-black hover:text-white"
                onClick={() => scrollToRoom(current + 1)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-12 flex justify-center gap-2 md:mt-16">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                current === index ? "w-6 bg-gray-800" : "w-2 bg-gray-300 hover:bg-gray-400",
              )}
              onClick={() => scrollToRoom(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <div className="mt-12 text-center md:mt-16">
          <Button
            asChild
            variant="outline"
            className="rounded-none border-gray-300 px-12 py-6 text-xs uppercase tracking-widest text-gray-600 transition-all duration-500 hover:bg-gray-900 hover:text-white"
          >
            <Link href="/rooms">View All Rooms</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
