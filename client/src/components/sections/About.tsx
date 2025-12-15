import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function About() {
  return (
    <section className="py-24 md:py-32 bg-[#F9F9F9] overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          
          {/* Image Side - Parallax Effect */}
          <motion.div 
            className="w-full lg:w-1/2 relative group"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="relative overflow-hidden aspect-square md:aspect-[4/5] shadow-xl hover:shadow-2xl transition-shadow duration-500">
              <img
                src="https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=3000&auto=format&fit=crop"
                alt="Interior View"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              {/* Decorative Border */}
              <div className="absolute inset-0 border border-white/20 m-4 pointer-events-none" />
            </div>
            
            {/* Floating Element */}
            <div className="absolute -bottom-8 -right-8 w-48 h-48 bg-[#E5E5E5] -z-10 hidden md:block" />
            <div className="absolute -top-8 -left-8 w-full h-full border border-[#E8A0BF]/30 -z-10 hidden md:block" />
          </motion.div>

          {/* Text Side */}
          <motion.div 
            className="w-full lg:w-1/2 space-y-10"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="space-y-2">
              <span className="text-[#E8A0BF] text-xs tracking-[0.2em] uppercase font-bold">
                Philosophy
              </span>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl leading-tight text-primary">
                Architecture as a <br/>
                <span className="italic text-gray-500">Silent Poem</span>
              </h2>
            </div>

            <div className="space-y-6 text-gray-600 leading-loose font-serif text-justify">
              <p>
                有些建築，像一封未寄名的情書。不為誰設計，也不急於說明自己。
                只是靜靜地站著，讓風穿過身體，讓光在表面跳舞。
              </p>
              <p>
                這裡沒有語言，卻萬物有聲。風成為弧線，光是語氣，水是呼吸。
                一彎牆、一抹光、一方水景，都是時間寫下的句子。
              </p>
              <p className="italic opacity-80">
                "Some architectures are like an unsigned love letter. 
                Standing silently, letting the wind pass through, letting the light dance."
              </p>
            </div>

            <Button 
              variant="outline" 
              className="group border-primary/20 hover:bg-primary hover:text-white transition-all duration-500 rounded-none px-8 py-6 uppercase tracking-widest text-xs"
            >
              Read More
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
