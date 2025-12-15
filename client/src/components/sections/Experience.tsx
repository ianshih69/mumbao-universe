import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";

export function Experience() {
  return (
    <section className="py-24 bg-[#F5F5F5]">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          
          {/* Feast Card */}
          <motion.div 
            className="group relative overflow-hidden h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=3000&auto=format&fit=crop"
                alt="Feast"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-500" />
            </div>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <span className="text-xs tracking-[0.3em] uppercase mb-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                Dining
              </span>
              <h3 className="font-serif text-4xl md:text-5xl mb-6">
                Feast <br/> <span className="text-2xl md:text-3xl mt-2 block">灣臥．饗宴</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100">
                High quality · Simply · From farm to table
                <br/>
                高品質．簡單料理．從農場到餐桌
              </p>
              
              <Button 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-primary rounded-none px-8 py-6 uppercase tracking-widest text-xs opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-200"
              >
                Explore <Plus className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>

          {/* Experience Card */}
          <motion.div 
            className="group relative overflow-hidden h-[600px] bg-white shadow-lg hover:shadow-2xl transition-shadow duration-500"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=3000&auto=format&fit=crop"
                alt="Experience"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-500" />
            </div>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 z-10">
              <span className="text-xs tracking-[0.3em] uppercase mb-4 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                Lifestyle
              </span>
              <h3 className="font-serif text-4xl md:text-5xl mb-6">
                Experience <br/> <span className="text-2xl md:text-3xl mt-2 block">灣臥．體驗</span>
              </h3>
              <p className="text-sm md:text-base tracking-wider opacity-90 max-w-md mb-8 transform translate-y-4 group-hover:translate-y-0 transition-all duration-500 delay-100">
                Embrace the purest tranquility of nature
                <br/>
                大自然．有機建築．自然之美
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
