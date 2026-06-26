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
import { asArray, asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type RoomItem = {
  id: string;
  name: string;
  title: string;
  image: string;
  description: string;
  alt: string;
};

const fallbackRooms: RoomItem[] = [
  {
    id: "blue-ocean",
    name: "Blue Ocean",
    title: "藍色主題房",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=3000&auto=format&fit=crop",
    description: "留給海風與睡眠的一間房。",
    alt: "藍色主題房",
  },
  {
    id: "acacia",
    name: "Acacia",
    title: "相思主題房",
    image: "https://images.unsplash.com/photo-1591088398332-8a7791972843?q=80&w=3000&auto=format&fit=crop",
    description: "把樹影與日光收進窗邊。",
    alt: "相思主題房",
  },
  {
    id: "moon-pond",
    name: "Moon Pond",
    title: "月池主題房",
    image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?q=80&w=3000&auto=format&fit=crop",
    description: "適合把夜晚放慢的一間房。",
    alt: "月池主題房",
  },
  {
    id: "mist-valley",
    name: "Mist Valley",
    title: "霧谷主題房",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=3000&auto=format&fit=crop",
    description: "山色與清晨霧氣在這裡停留。",
    alt: "霧谷主題房",
  },
  {
    id: "starry-night",
    name: "Starry Night",
    title: "星夜主題房",
    image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=3000&auto=format&fit=crop",
    description: "把星光留給入睡前的片刻。",
    alt: "星夜主題房",
  },
];

export function Rooms() {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [heading, setHeading] = React.useState({
    eyebrow: "The Sanctuaries",
    title: "房型介紹",
    subtitle: "五間主題房，留給一組客人的完整時光。",
  });
  const [rooms, setRooms] = React.useState<RoomItem[]>(fallbackRooms);

  React.useEffect(() => {
    let isCurrent = true;
    fetchSitePageContent("rooms")
      .then((content) => {
        if (!isCurrent) return;
        const hero = content.sections["rooms.hero"]?.content;
        const roomList = content.sections["rooms.room_list"]?.content;
        setHeading({
          eyebrow: asString(hero?.eyebrow, "The Sanctuaries"),
          title: asString(hero?.title, "房型介紹"),
          subtitle: asString(hero?.subtitle, "五間主題房，留給一組客人的完整時光。"),
        });

        const nextRooms = asArray<Record<string, unknown>>(roomList?.rooms)
          .map((room, index) => ({
            id: asString(room.name, `room-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: asString(room.name, `Room ${index + 1}`),
            title: asString(room.title, `主題房 ${index + 1}`),
            image: asString(room.image_url, fallbackRooms[index]?.image || fallbackRooms[0].image),
            description: asString(room.description, fallbackRooms[index]?.description || ""),
            alt: asString(room.alt_text, asString(room.title, `主題房 ${index + 1}`)),
          }))
          .filter((room) => room.title && room.image)
          .slice(0, 5);
        if (nextRooms.length) setRooms(nextRooms);
      })
      .catch(() => {
        if (!isCurrent) return;
        setHeading({
          eyebrow: "The Sanctuaries",
          title: "房型介紹",
          subtitle: "五間主題房，留給一組客人的完整時光。",
        });
        setRooms(fallbackRooms);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  React.useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  return (
    <section className="bg-white py-24" id="rooms">
      <div className="container relative mx-auto px-4 md:px-8">
        <motion.div
          className="mb-16 flex flex-col items-center space-y-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          viewport={{ once: true }}
        >
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-gray-400">
            {heading.eyebrow}
          </span>
          <h2 className="font-serif text-4xl text-gray-900 md:text-5xl">
            {heading.title}
          </h2>
          <p className="mt-2 font-serif text-sm tracking-wide text-gray-500 opacity-80 md:text-base">
            {heading.subtitle}
          </p>
        </motion.div>

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
              {rooms.map((room) => (
                <CarouselItem key={room.id} className="basis-[85%] pl-4 md:basis-1/2 md:pl-8 lg:basis-1/3">
                  <div className="group cursor-pointer">
                    <div className="relative mb-6 aspect-[4/3] overflow-hidden bg-gray-100">
                      <img
                        src={room.image}
                        alt={room.alt}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onError={(event) => {
                          event.currentTarget.src = fallbackRooms[0].image;
                        }}
                      />
                    </div>

                    <div className="space-y-2 px-1 text-left">
                      <h3 className="font-serif text-2xl tracking-wide text-gray-900 transition-colors group-hover:text-gray-600">
                        {room.title}
                      </h3>

                      <p className="font-serif text-sm italic tracking-wide text-gray-500 opacity-80 decoration-gray-300">
                        "{room.description}"
                      </p>

                      <div className="pt-2">
                        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-gray-400 transition-colors group-hover:text-black">
                          View Room <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="hidden md:block">
            <Button
              variant="outline"
              size="icon"
              className="absolute left-0 top-[35%] h-12 w-12 rounded-full border border-gray-200 bg-white/50 backdrop-blur-sm transition-all duration-300 hover:border-black hover:bg-black hover:text-white"
              onClick={() => api?.scrollPrev()}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute right-0 top-[35%] h-12 w-12 rounded-full border border-gray-200 bg-white/50 backdrop-blur-sm transition-all duration-300 hover:border-black hover:bg-black hover:text-white"
              onClick={() => api?.scrollNext()}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-12 flex justify-center gap-2 md:mt-16">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                current === index + 1 ? "w-6 bg-gray-800" : "w-2 bg-gray-300 hover:bg-gray-400",
              )}
              onClick={() => api?.scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <div className="mt-12 text-center md:mt-16">
          <Button
            variant="outline"
            className="rounded-none border-gray-300 px-12 py-6 text-xs uppercase tracking-widest text-gray-600 transition-all duration-500 hover:bg-gray-900 hover:text-white"
          >
            View All Rooms
          </Button>
        </div>
      </div>
    </section>
  );
}
