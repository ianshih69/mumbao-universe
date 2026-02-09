import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";

export function BookingCTA() {
  return (
    <section className="relative py-32 md:py-48 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1542718610-a1d656d1884c?q=80&w=3000&auto=format&fit=crop"
          alt="Warm Cabin Night"
          className="w-full h-full object-cover"
        />
        {/* Warm Midnight Overlay */}
        <div className="absolute inset-0 bg-slate-900/40 mix-blend-multiply" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center text-white">
        <motion.div
          className="space-y-8"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          viewport={{ once: true }}
        >
          <h2 className="font-serif text-4xl md:text-6xl tracking-wide leading-tight text-white/90">
            預約 · 歸零
            <br />
            <span className="text-xl md:text-2xl mt-6 block font-light italic opacity-90 tracking-wider font-sans">
              Reserve Your Blank Space
            </span>
          </h2>

          <p className="max-w-xl mx-auto text-lg md:text-xl font-serif leading-relaxed text-white/80 tracking-widest">
            給自己一段空白，讓靈魂跟上身體。
          </p>

          <Button
            size="lg"
            className="bg-transparent border border-white text-white hover:bg-white hover:text-gray-900 transition-all duration-500 rounded-none px-12 py-8 text-sm tracking-[0.2em] uppercase mt-12 backdrop-blur-sm"
          >
            <Calendar className="w-4 h-4 mr-3" />
            Start Your Journey
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
