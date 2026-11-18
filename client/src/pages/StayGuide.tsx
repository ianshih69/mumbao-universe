import { VisitorPage } from "@/components/layout/VisitorPage";
import { stayGuideTitle, stayGuideIntroduction, stayGuideSections } from "@/data/stayGuide";
import { stayGuideSeo } from "@/lib/publicPageSeo";

export default function StayGuide() {
  return (
    <VisitorPage seo={stayGuideSeo}>
      <header className={"visitor-guide-header"}>
        <p className={"visitor-eyebrow"}>STIME VILLA</p>
        <h1 className={"visitor-title"} data-stay-copy>{stayGuideTitle}</h1>
        <p className={"visitor-introduction"} data-stay-copy>{stayGuideIntroduction}</p>
        <nav className={"visitor-contents"} aria-label="快速查看">
          <h2>快速查看</h2>
          <ul>
            {stayGuideSections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}
          </ul>
        </nav>
      </header>
      <article className={"visitor-guide-body"}>
        {stayGuideSections.map(section => (
          <section key={section.id} id={section.id} className={"visitor-chapter"} aria-labelledby={`${section.id}-title`}>
            <h2 id={`${section.id}-title`} data-stay-copy>{section.title}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <div key={index} className={"visitor-paragraph"}>
                {paragraph.split("\n").map((line, lineIndex) => (
                  <p key={lineIndex} data-stay-copy className={[
                    line.trimStart().startsWith("•") ? "visitor-bullet" : "",
                    line.startsWith(" •") ? "visitor-nested" : "",
                  ].join(" ")}>{line}</p>
                ))}
              </div>
            ))}
          </section>
        ))}
      </article>
    </VisitorPage>
  );
}
