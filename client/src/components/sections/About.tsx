import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

export function About() {
  const [, setLocation] = useLocation();

  return (
    <section className="py-24 md:py-32 bg-[#F9F9F9] overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

          {/* Image Side */}
          <motion.div
            className="w-full lg:w-1/2 relative group"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="relative overflow-hidden aspect-square md:aspect-[4/5] shadow-xl hover:shadow-2xl transition-shadow duration-500 rounded-lg">
              <img
                src="/images/aboutMe_1.webp"
                alt="Mumbao's Cloud Base"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 border border-white/20 m-4 pointer-events-none rounded-lg" />
            </div>
          </motion.div>

          {/* Text Side - Teaser Content */}
          <motion.div
            className="w-full lg:w-1/2 space-y-10"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="space-y-4">
              <span className="text-gray-400 text-xs tracking-[0.3em] uppercase font-bold">
                About Us
              </span>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl leading-tight text-gray-800">
                降落在員山的<br />
                <span className="italic text-gray-500">白雲基地</span>
              </h2>
            </div>

            <div className="space-y-6 text-gray-600 leading-loose font-serif text-justify">
              <p>
                宜蘭員山，是水的故鄉，也是雲霧繚繞的起點。
                來自第七維度的星際旅人——慢寶 (Mumbao)，在這裡打造了一座「白雲基地」。
              </p>
              <p className="italic opacity-80">
                "我們在這裡撐開了一道防護罩，過濾掉世界的焦慮與雜訊。
                在這裡，雲是停下來的，時間也是。"
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => setLocation("/about")}
              className="group border-primary/20 hover:bg-primary hover:text-white transition-all duration-500 rounded-none px-8 py-6 uppercase tracking-widest text-xs"
            >
              Read More / 遇見慢寶
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
