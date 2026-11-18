import { VisitorPage } from "@/components/layout/VisitorPage";
import { contact, contactSocialLinks, contactMapHref } from "@/data/contact";
import { contactSeo } from "@/lib/publicPageSeo";

export default function Contact() {
  const line = contactSocialLinks.find(link => link.label === "LINE")!;
  return (
    <VisitorPage seo={contactSeo}>
      <header className={"visitor-contact-header"}>
        <p className={"visitor-eyebrow"}>STIME VILLA · CONTACT</p>
        <h1 className={"visitor-title"}>聯絡我們</h1>
        <p className={"visitor-brand"}>慢慢蒔光 STime Villa</p>
      </header>
      <nav className={"visitor-socials"} aria-label="官方社群">
        {contactSocialLinks.map(link => (
          <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
            <img src={link.src} alt="" />
            <span>{link.label}</span>
          </a>
        ))}
      </nav>
      <dl className={"visitor-details"}>
        <div><dt>官方 LINE ID</dt><dd><a href={line.href} target="_blank" rel="noopener noreferrer">{contact.lineId}</a></dd></div>
        <div><dt>聯絡電話</dt><dd><a href={contact.phoneHref}>{contact.phone}</a></dd></div>
        <div><dt>聯絡 Email</dt><dd><a href={`mailto:${contact.email}`}>{contact.email}</a></dd></div>
        <div><dt>民宿地址</dt><dd><span className={"visitor-address"}>{contact.address}</span><a className={"visitor-map"} href={contactMapHref} target="_blank" rel="noopener noreferrer">Google 地圖導航</a></dd></div>
      </dl>
    </VisitorPage>
  );
}
