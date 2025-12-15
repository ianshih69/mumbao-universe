import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function Hero() {
  return (
    <section className="relative h-[60vh] md:h-screen w-full overflow-hidden">
      {/* Background Image with Overlay - Fade In Only (No Movement) */}
      <motion.div 
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <img
          src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=3000&auto=format&fit=crop"
          alt="Wandering Walls Architecture"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
      </motion.div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
        {/* Text Content - Fade In Up with Delay */}
        <motion.div 
          className="space-y-8"
          initial={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ 
            duration: 0.8, 
            ease: "easeOut",
            delay: 0.5 // Delay 0.5s so text appears after the image
          }}
        >
          <p className="text-sm md:text-base tracking-[0.3em] uppercase opacity-90">
            Kenting, Taiwan
          </p>
          
          <h2 className="font-serif text-4xl md:text-6xl lg:text-7xl font-light tracking-wider leading-tight">
            The Wandering Walls
          </h2>
          
          <div className="w-24 h-[1px] bg-white/50 mx-auto my-8" />
          
          <p className="font-serif italic text-lg md:text-xl opacity-90 max-w-2xl mx-auto leading-relaxed">
            "Where the wind wanders, and the walls listen."
          </p>
        </motion.div>

        {/* Video Play Button */}
        <motion.div 
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.6, 
            ease: "easeOut",
            delay: 1.1 // Appears after text animation completes
          }}
        >
          <Button 
            variant="outline" 
            size="lg"
            className="rounded-full w-16 h-16 border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:scale-110 transition-all duration-500 group"
          >
            <Play className="w-6 h-6 text-white fill-white group-hover:scale-110 transition-transform" />
          </Button>
          <p className="text-[10px] uppercase tracking-[0.2em] mt-4 text-white/70">Watch Film</p>
        </motion.div>
      </div>
    </section>
  );
}
