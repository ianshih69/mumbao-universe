import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function Experience() {
  return (
    <section className="py-24 bg-[#F5F5F5]">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

          {/* Card 1: Curated Flavors (慢食 · 嚴選) */}
          <motion.div
            className="group relative overflow-hidden w-full aspect-[4/3] md:aspect-auto md:h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?q=80&w=3000&auto=format&fit=crop"
                alt="Curated Flavors"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors duration-500" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <span className="text-xs tracking-[0.3em] uppercase mb-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                Service & Convenience
              </span>
              <h3 className="font-serif text-3xl md:text-5xl mb-3 md:mb-6">
                Curated Flavors <br /> <span className="text-2xl md:text-3xl mt-3 block">慢食 · 嚴選</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-6 md:mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 leading-relaxed px-4 md:px-0">
                從宜蘭在地名店早餐，到星空下的豪華烤肉派對。
                <br />
                慢寶為您打點好一切食材與設備，讓美味不再需要忙碌。
              </p>

              <Button
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-primary rounded-none px-8 py-6 uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-200"
              >
                View Menu & Services <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>

          {/* Card 2: Slow Living (慢遊 · 提案) */}
          <motion.div
            className="group relative overflow-hidden w-full aspect-[4/3] md:aspect-auto md:h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=3000&auto=format&fit=crop"
                alt="Slow Living"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors duration-500" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <span className="text-xs tracking-[0.3em] uppercase mb-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                Local Depth
              </span>
              <h3 className="font-serif text-3xl md:text-5xl mb-3 md:mb-6">
                Slow Living <br /> <span className="text-2xl md:text-3xl mt-3 block">慢遊 · 提案</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-6 md:mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 leading-relaxed px-4 md:px-0">
                避開人潮，走進在地人的私房路徑。
                <br />
                無論是田間散步或是職人手作，讓我們帶你找回生活的節奏。
              </p>

              <Button
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-primary rounded-none px-8 py-6 uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-200"
              >
                Explore <Plus className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
