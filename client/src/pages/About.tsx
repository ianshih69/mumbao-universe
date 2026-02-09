import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";

export default function About() {
    // Shared animation variants for fade-in up
    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
    };

    return (
        <div className="min-h-screen-safe bg-background text-gray-700 font-serif selection:bg-[#E8A0BF] selection:text-white">
            <Header />

            <main className="pt-20"> {/* Add padding top to account for fixed header */}

                {/* ==================== Section 1: The Origin (起點) ==================== */}
                <div className="py-24 md:py-32 container mx-auto px-6 md:px-12 bg-[#FAFAFA]">
                    <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-12">

                        {/* Main Image */}
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={fadeInUp}
                            className="w-full relative shadow-2xl rounded-lg overflow-hidden"
                        >
                            <img
                                src="/images/aboutMe_1.webp"
                                alt="Mumbao's Cloud Base"
                                className="w-full h-[400px] md:h-[600px] object-cover hover:scale-105 transition-transform duration-[1.5s]"
                            />
                        </motion.div>

                        {/* Text Content */}
                        <motion.div
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            variants={fadeInUp}
                            className="space-y-8"
                        >
                            <div className="space-y-4">
                                <span className="text-gray-400 text-xs tracking-[0.3em] uppercase">The Origin</span>
                                <h2 className="text-3xl md:text-5xl font-light tracking-wide text-gray-800">
                                    降落在員山的白雲基地
                                </h2>
                            </div>

                            <p className="text-base md:text-lg leading-loose opacity-90 text-justify md:text-center max-w-2xl mx-auto">
                                宜蘭員山，是水的故鄉，也是雲霧繚繞的起點。
                                很久以前，來自第七維度的星際旅人——慢寶 (Mumbao)，在宇宙中尋找一個能讓時間慢下來的座標。他看見了員山的純淨與溫柔，於是決定降落。
                                <br /><br />
                                慢慢蒔光 (STime Villa)，就是慢寶在地球親手打造的「白雲基地」。
                                這座純白的建築，並非為了「居住」而建，而是為了「承接」而生。它模仿了慢寶腳下那朵「蒔光雲」的姿態——柔軟、潔白、且包容。
                                <br /><br />
                                我們在這裡撐開了一道防護罩，過濾掉世界的焦慮與雜訊。
                                在這裡，雲是停下來的，時間也是。
                            </p>
                        </motion.div>

                    </div>
                </div>

                {/* ==================== Section 2: The Space (空間) ==================== */}
                <div className="py-24 md:py-32 bg-white">
                    <div className="container mx-auto px-6 md:px-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">

                            {/* Left Image */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInUp}
                                className="order-1 md:order-1 relative group"
                            >
                                <div className="overflow-hidden rounded-lg shadow-xl aspect-[3/4]">
                                    <img
                                        src="/images/aboutMe_2.webp"
                                        alt="The Warm Star Pocket"
                                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                                    />
                                </div>
                            </motion.div>

                            {/* Right Text */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInUp}
                                className="order-2 md:order-2 space-y-8"
                            >
                                <div className="space-y-4">
                                    <span className="text-gray-400 text-xs tracking-[0.3em] uppercase">The Space</span>
                                    <h2 className="text-3xl md:text-4xl font-light tracking-wide text-gray-800">
                                        被時間遺忘的暖星袋
                                    </h2>
                                </div>

                                <p className="text-base md:text-lg leading-loose opacity-90 text-justify">
                                    走進這座基地，你會發現空間裡充滿了流動的弧線與留白。
                                    這是慢寶的堅持：「人很柔軟，不該被尖銳的直角劃傷。」
                                    <br /><br />
                                    每一扇窗，都是為了引入星源的守護之光；
                                    每一個角落，都像是一個巨大的「暖星袋」，用來收納你無處安放的願望與嘆息。
                                    <br /><br />
                                    在這裡，建築不說話，它只是安靜地擁抱你。
                                    就像慢寶總是靜靜地陪伴，不急著要你變好，只希望你「存在」。
                                    當你躺在床上，感受窗外員山的風輕輕吹過，請閉上眼。
                                    此刻的你，正被宇宙溫柔地接住。
                                </p>
                            </motion.div>

                        </div>
                    </div>
                </div>

                {/* ==================== Section 3: The Philosophy (哲學) ==================== */}
                <div className="py-24 md:py-32 bg-[#FAFAFA]">
                    <div className="container mx-auto px-6 md:px-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">

                            {/* Left Text (Zig-Zag Layout: Text First on Desktop) */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInUp}
                                className="order-2 md:order-1 space-y-10"
                            >
                                <div className="space-y-4">
                                    <span className="text-gray-400 text-xs tracking-[0.3em] uppercase">The Philosophy</span>
                                    <h2 className="text-3xl md:text-4xl font-light tracking-wide text-gray-800">
                                        慢，是一種靈魂的特權
                                    </h2>
                                </div>

                                {/* Blockquote with emphasis */}
                                <blockquote className="border-l-2 border-primary/30 pl-6 py-2">
                                    <p className="text-2xl md:text-3xl font-light text-primary/80 italic tracking-wider leading-relaxed">
                                        "什麼都不做，也值得被愛。"
                                    </p>
                                </blockquote>

                                <p className="text-base md:text-lg leading-loose opacity-90 text-justify">
                                    現代世界告訴我們要快、要優秀、要成為某種樣子。
                                    但慢寶來自的宇宙，有著另一套法則：「愛是一種能量，不是交換條件。」
                                    <br /><br />
                                    來到慢慢蒔光，我們不提供行程表，只提供「空白」。
                                    我們邀請你練習浪費時間，練習對著稻田發呆，練習聽見自己心跳的頻率。
                                    <br /><br />
                                    請記住慢寶送給地球最珍貴的禮物：「什麼都不做，也值得被愛。」
                                    找回你的頻率，成為自己就很好了。
                                </p>
                            </motion.div>

                            {/* Right Image */}
                            <motion.div
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                variants={fadeInUp}
                                className="order-1 md:order-2 relative group"
                            >
                                <div className="overflow-hidden rounded-lg shadow-xl aspect-[3/4]">
                                    <img
                                        src="/images/aboutMe_3.webp"
                                        alt="The Philosophy of Slowness"
                                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                                    />
                                </div>
                            </motion.div>

                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
