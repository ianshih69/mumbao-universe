import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";

export function BookingCTA() {
  return (
    <section className="relative py-32 md:py-48 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1470075801209-17f9ec0cada6?q=80&w=3000&auto=format&fit=crop"
          alt="Booking Background"
          className="w-full h-full object-cover grayscale contrast-125 brightness-50"
        />
        <div className="absolute inset-0 bg-primary/40 mix-blend-multiply" />
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
          <h2 className="font-serif text-4xl md:text-6xl tracking-wide leading-tight">
            預定您的假期
            <br />
            <span className="text-2xl md:text-3xl opacity-80 mt-4 block font-light italic">
              Reserve Your Sanctuary
            </span>
          </h2>
          
          <p className="max-w-xl mx-auto text-lg opacity-80 font-serif leading-relaxed">
            Escape to the edge of the world, where the sky meets the sea.
          </p>

          <Button 
            size="lg"
            className="bg-white text-primary hover:bg-[#E8A0BF] hover:text-white transition-all duration-500 rounded-none px-12 py-8 text-sm tracking-[0.2em] uppercase mt-8"
          >
            <Calendar className="w-4 h-4 mr-3" />
            Book Now
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
