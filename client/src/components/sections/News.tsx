import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion"; // Added AnimatePresence
import { useState } from "react"; // Added useState

const newsItems = [
  {
    id: 1,
    date: "2022.12.26",
    title: "慢寶入選世界當代建築代表作",
    desc: "Mumbao 被評選為年度最具影響力的建築之一，展現了自然與現代設計的完美融合。這座建築不僅是棲息之所，更是心靈的避風港。",
    image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=3000&auto=format&fit=crop",
    category: "Award"
  },
  {
    id: 2,
    date: "2022.11.08",
    title: "慢寶．世界百大建築",
    desc: "在今年的世界建築大獎中，慢寶憑藉其獨特的生態工法與光影設計，榮獲百大建築殊榮，讓世界看見台灣的設計軟實力。",
    image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?q=80&w=3000&auto=format&fit=crop",
    category: "Press"
  },
  {
    id: 3,
    date: "2025.08.13",
    title: "慢寶生日獻禮",
    desc: "為了慶祝慢寶成立三週年，我們推出了一系列限時住宿優惠與專屬體驗活動，邀請舊雨新知一同回娘家。",
    image: "https://images.unsplash.com/photo-1493770348161-369560ae357d?q=80&w=3000&auto=format&fit=crop",
    category: "Event"
  },
  {
    id: 4,
    date: "2025.09.15",
    title: "高級宴會廳新落成",
    desc: "全新的多功能宴會廳正式啟用，配備頂級視聽設備與全景落地窗，是舉辦婚禮、會議與私人派對的絕佳場地。",
    image: "https://images.unsplash.com/photo-1578500494198-246f612d03b3?q=80&w=3000&auto=format&fit=crop",
    category: "Experience"
  },
  {
    id: 5,
    date: "2025.10.20",
    title: "餐飲設計獲國際認可",
    desc: "我們的餐飲團隊與空間設計師攜手合作，打造出沉浸式的用餐體驗，榮獲國際餐飲空間設計大獎。",
    image: "https://images.unsplash.com/photo-1567521464027-f127ff144326?q=80&w=3000&auto=format&fit=crop",
    category: "Design"
  }
];

export function News() {
  const [activeNews, setActiveNews] = useState(newsItems[0]); // State for interactive preview
  const sideNews = newsItems.slice(1, 4);

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-8">
        {/* Section Header */}
        <div className="flex justify-between items-end mb-8 md:mb-16">
          <div className="space-y-2">
            <span className="text-[#E8A0BF] text-xs tracking-[0.2em] uppercase font-bold block">
              Latest News
            </span>
            <h2 className="font-serif text-3xl md:text-4xl text-primary relative inline-block">
              最新消息
              <span className="absolute -bottom-2 left-0 w-1/2 h-[2px] bg-[#E8A0BF]" />
            </h2>
          </div>

          <Button variant="link" className="text-primary hover:text-[#E8A0BF] p-0 h-auto group text-xs md:text-sm">
            View All News <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        {/* --- Mobile: Horizontal Scroll (Unchanged) --- */}
        <div className="flex overflow-x-auto snap-x snap-mandatory pb-8 -mx-4 px-4 md:hidden scrollbar-hide">
          {newsItems.map((item, idx) => (
            <motion.div
              key={item.id}
              className="flex-shrink-0 w-[80vw] mr-4 last:mr-0 snap-center group cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
            >
              <div className="relative overflow-hidden aspect-[4/3] mb-4 bg-gray-100 rounded-none">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 text-[10px] uppercase tracking-wider rounded-sm font-medium">
                  {item.category}
                </div>
              </div>
              <div className="space-y-2 px-1">
                <span className="text-xs text-gray-400 tracking-wider font-mono block">
                  {item.date}
                </span>
                <h3 className="font-serif text-lg text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-snug line-clamp-2">
                  {item.title}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>

        {/* --- Desktop: Asymmetrical Grid (Interactive) --- */}
        <div className="hidden md:grid grid-cols-12 gap-8">
          {/* Left: Featured Post (Displays activeNews) */}
          <div className="col-span-8 relative min-h-[500px]">
            {/* AnimatePresence for smooth transitions between active items */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeNews.id} // Key change triggers animation
                className="group cursor-pointer relative w-full h-full"
                initial={{ opacity: 0 }} // Simple fade in
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="relative overflow-hidden aspect-video rounded-none mb-6 bg-gray-100">
                  <img
                    src={activeNews.image}
                    alt={activeNews.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-3 py-1 text-xs uppercase tracking-widest rounded-sm font-medium">
                    {activeNews.category}
                  </div>
                </div>
                <div className="space-y-4 pr-12">
                  <div className="flex items-center gap-4 text-sm text-gray-400 font-mono tracking-wider">
                    <span>{activeNews.date}</span>
                    <span className="w-8 h-[1px] bg-gray-300" />
                    {/* Show 'Featured' only if it's the first item, otherwise 'Preview' or similar? kept simple for now */}
                    <span>{activeNews.id === 1 ? 'Featured' : 'Preview'}</span>
                  </div>
                  <h3 className="font-serif text-3xl font-medium text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-tight">
                    {activeNews.title}
                  </h3>
                  <p className="text-gray-500 font-light leading-relaxed line-clamp-3">
                    {activeNews.desc}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: Side List (Interactive Triggers) */}
          <div
            className="col-span-4 flex flex-col gap-6"
            onMouseLeave={() => setActiveNews(newsItems[0])} // Reset on leave
          >
            {sideNews.map((item, idx) => {
              const isActive = activeNews.id === item.id;
              return (
                <motion.div
                  key={item.id}
                  className={`flex gap-4 group cursor-pointer border-b border-gray-100 pb-6 last:border-0 last:pb-0 transition-all duration-300 ${isActive ? 'pl-4 border-l-4 border-l-[#E8A0BF] border-b-gray-100' : 'pl-0 border-l-0'}`}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.1 }}
                  onMouseEnter={() => setActiveNews(item)} // Trigger preview
                >
                  {/* Thumbnail */}
                  <div className="w-24 h-24 flex-shrink-0 overflow-hidden rounded-none bg-gray-100">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  {/* Info */}
                  <div className="flex flex-col justify-center space-y-2">
                    <span className="text-[10px] text-gray-400 tracking-wider font-mono uppercase">
                      {item.date} • {item.category}
                    </span>
                    <h4 className={`font-serif text-lg transition-colors duration-300 leading-snug line-clamp-2 ${isActive ? 'text-[#E8A0BF]' : 'text-primary group-hover:text-[#E8A0BF]'}`}>
                      {item.title}
                    </h4>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
