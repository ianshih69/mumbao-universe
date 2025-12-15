import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { News } from "@/components/sections/News";
import { Experience } from "@/components/sections/Experience";
import { Rooms } from "@/components/sections/Rooms";
import { BookingCTA } from "@/components/sections/BookingCTA";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans selection:bg-[#E8A0BF] selection:text-white">
      <Header />
      
      <main>
        <Hero />
        <About />
        <News />
        <Experience />
        <Rooms />
        <BookingCTA />
      </main>

      <Footer />
    </div>
  );
}
