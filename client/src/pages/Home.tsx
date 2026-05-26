import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { News } from "@/components/sections/News";
import { Experience } from "@/components/sections/Experience";
import { Rooms } from "@/components/sections/Rooms";
import { BookingCTA } from "@/components/sections/BookingCTA";
import FlyingMascot from "@/components/effects/FlyingMascot";
import MeteorShower from "@/components/effects/MeteorShower";

const enableCruisingMascot =
  import.meta.env.NEXT_PUBLIC_ENABLE_CRUISING_MASCOT === "true";

export default function Home() {
  return (
    <div className="min-h-screen-safe bg-background font-sans selection:bg-[#E8A0BF] selection:text-white">
      <MeteorShower intensity={300} showBackground={false} />
      {enableCruisingMascot && <FlyingMascot />}
      <Header />

      <main>
        <div id="about">
          <Hero />
        </div>
        <About />
        <div id="news">
          <News />
        </div>
        <div id="experience">
          <Experience />
        </div>
        <div id="rooms">
          <Rooms />
        </div>
        <div id="booking">
          <BookingCTA />
        </div>
      </main>

      <Footer />
    </div>
  );
}
