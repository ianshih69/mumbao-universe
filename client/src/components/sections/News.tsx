import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion"; // Added AnimatePresence
import { useState } from "react"; // Added useState
import { Link } from "wouter";
import { newsItems } from "@/data/news";

export function News() {
  const [activeNews, setActiveNews] = useState(newsItems[0]); // State for interactive preview
  const sideNews = newsItems.slice(1, 4);

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1120px] px-5 md:px-6">
        {/* Section Header */}
        <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between md:mb-16">
          <div className="space-y-2">
            <span className="text-[#E8A0BF] text-xs tracking-[0.2em] uppercase font-bold block">
              Latest News
            </span>
            <h2 className="font-serif text-3xl md:text-4xl text-primary relative inline-block">
              最新消息
              <span className="absolute -bottom-2 left-0 w-1/2 h-[2px] bg-[#E8A0BF]" />
            </h2>
          </div>

          <Button asChild variant="link" className="text-primary hover:text-[#E8A0BF] p-0 h-auto group text-xs md:text-sm">
            <Link href="/news">
              View All News <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1 md:ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>

        {/* --- Mobile: Stacked List --- */}
        <div className="space-y-6 pb-8 lg:hidden">
          <motion.div
            className="group cursor-pointer"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Link href={`/news/${newsItems[0].slug}`} className="block">
              <div className="relative mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-none border border-[rgba(120,95,70,0.08)] bg-[#fbf7f1]">
                <img
                  src={newsItems[0].image}
                  alt={newsItems[0].alt}
                  className="block h-full w-full object-contain transition-transform duration-700"
                />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 text-[10px] uppercase tracking-wider rounded-sm font-medium">
                  {newsItems[0].category}
                </div>
              </div>
              <div className="space-y-2 px-1">
                <span className="text-xs text-gray-400 tracking-wider font-mono block">
                  {newsItems[0].date}
                </span>
                <h3 className="font-serif text-lg text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-snug line-clamp-2">
                  {newsItems[0].title}
                </h3>
              </div>
            </Link>
          </motion.div>

          <div className="space-y-4">
            {sideNews.map((item, idx) => (
            <motion.div
              key={item.id}
              className="group cursor-pointer border-b border-gray-100 pb-4 last:border-0 last:pb-0"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: (idx + 1) * 0.1 }}
            >
              <Link href={`/news/${item.slug}`} className="flex gap-4">
                <div className="flex aspect-video w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(120,95,70,0.08)] bg-[#fbf7f1]">
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="block h-full w-full object-contain transition-transform duration-700"
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-center space-y-2">
                  <span className="text-xs text-gray-400 tracking-wider font-mono block">
                    {item.date} • {item.category}
                  </span>
                  <h3 className="font-serif text-lg text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-snug line-clamp-2">
                    {item.title}
                  </h3>
                </div>
              </Link>
            </motion.div>
            ))}
          </div>
        </div>

        {/* --- Desktop: Asymmetrical Grid (Interactive) --- */}
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,500px)_minmax(400px,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,560px)_minmax(440px,1fr)] xl:gap-14">
          {/* Left: Featured Post (Displays activeNews) */}
          <div className="relative w-full max-w-[560px]">
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
                <Link href={`/news/${activeNews.slug}`} className="block h-full">
                  <div className="relative mb-6 flex aspect-video w-full max-w-[560px] items-center justify-center overflow-hidden rounded-none border border-[rgba(120,95,70,0.08)] bg-[#fbf7f1]">
                    <img
                      src={activeNews.image}
                      alt={activeNews.alt}
                      className="block h-full w-full object-contain transition-transform duration-700"
                    />
                    <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-3 py-1 text-xs uppercase tracking-widest rounded-sm font-medium">
                      {activeNews.category}
                    </div>
                  </div>
                  <div className="max-w-[560px] space-y-4">
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-mono tracking-wider">
                      <span>{activeNews.date}</span>
                      <span className="text-gray-300">——</span>
                      <span>{activeNews.category}</span>
                    </div>
                    <h3 className="font-serif text-3xl font-medium text-primary group-hover:text-[#E8A0BF] transition-colors duration-300 leading-tight">
                      {activeNews.title}
                    </h3>
                    <p className="text-gray-500 font-light leading-relaxed line-clamp-3">
                      {activeNews.excerpt}
                    </p>
                  </div>
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: Side List (Interactive Triggers) */}
          <div
            className="flex w-full min-w-0 flex-col gap-6"
            onMouseLeave={() => setActiveNews(newsItems[0])} // Reset on leave
          >
            {sideNews.map((item, idx) => {
              const isActive = activeNews.id === item.id;
              return (
                <motion.div
                  key={item.id}
                  className={`flex gap-5 group cursor-pointer border-b border-[rgba(120,95,70,0.08)] pb-8 last:border-0 last:pb-0 transition-all duration-300 ${isActive ? 'pl-4 border-l-4 border-l-[#E8A0BF] border-b-[rgba(120,95,70,0.08)]' : 'pl-0 border-l-0'}`}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.1 }}
                  onMouseEnter={() => setActiveNews(item)} // Trigger preview
                >
                  <Link href={`/news/${item.slug}`} className="flex w-full gap-5 xl:gap-6">
                    {/* Thumbnail */}
                    <div className="flex aspect-video w-44 flex-shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(120,95,70,0.08)] bg-[#fbf7f1]">
                      <img
                        src={item.image}
                        alt={item.alt}
                        className="w-full h-full object-contain transition-transform duration-700"
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
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
