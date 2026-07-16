import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Plus, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const breakfastDesktopImage = "/images/Main/breakfaset.JPG";
const breakfastMobileImage = "/images/Main/breakfast.jpg";

export function Experience() {
  const [, navigate] = useLocation();
  const openBreakfast = () => navigate("/experience/breakfast");
  const openSlowGuide = () => navigate("/experience/slow-guide");

  return (
    <section id="experience" className="scroll-mt-[120px] py-24 bg-[#F5F5F5]">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

          {/* Card 1: Breakfast Service */}
          <motion.div
            className="group relative overflow-hidden w-full aspect-[4/3] md:aspect-auto md:h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500 cursor-pointer"
            role="link"
            tabIndex={0}
            onClick={openBreakfast}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openBreakfast();
              }
            }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <picture className="block h-full w-full">
                <source media="(min-width: 768px)" srcSet={breakfastDesktopImage} />
                <img
                  src={breakfastMobileImage}
                  alt="早餐代訂"
                  className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                />
              </picture>
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors duration-500" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <h3 className="font-serif text-3xl md:text-4xl mb-3 md:mb-5 tracking-wide">
                Curated Flavors <br /> <span className="text-2xl md:text-3xl mt-3 block">慢食・嚴選</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-6 md:mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 leading-relaxed px-4 md:px-0">
                宜蘭在地名店早餐，
                <br />
                為白雲基地的清晨先留一份溫度。
                <br />
                醒來後，不急著出門，也能好好開始。
              </p>

              <Button
                asChild
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-primary rounded-none px-8 py-6 uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-200"
              >
                <Link href="/experience/breakfast">
                  View Details <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Card 2: Slow Guide (慢遊・私選) */}
          <motion.div
            className="group relative overflow-hidden w-full aspect-[4/3] md:aspect-auto md:h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500 cursor-pointer"
            role="link"
            tabIndex={0}
            onClick={openSlowGuide}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSlowGuide();
              }
            }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=3000&auto=format&fit=crop"
                alt="SLOW GUIDE"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors duration-500" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <span className="text-xs tracking-[0.3em] uppercase mb-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                Local Depth
              </span>
              <h3 className="font-serif text-3xl md:text-5xl mb-3 md:mb-6">
                SLOW GUIDE <br /> <span className="text-2xl md:text-3xl mt-3 block">慢遊・私選</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-6 md:mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100 leading-relaxed px-4 md:px-0">
                屋主走過也喜歡的宜蘭日常。
                <br />
                從散步風景、在地小吃到午後小食，
                <br />
                留給想慢慢走的旅人。
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
