export const contact = {
  lineId: "@417rqiuu",
  phone: "0988-098-367",
  phoneHref: "tel:0988098367",
  email: "service@mumbao.tw",
  address: "宜蘭縣員山鄉深洲二路158號",
};

// Existing Footer assets and destinations; unconfigured services stay unlinked.
export const socialLinks = [
  { href: "https://www.facebook.com/STimeVilla", label: "Facebook", src: "/images/social/brand/facebook.svg" },
  { href: "https://www.instagram.com/mumbao.tw/", label: "Instagram", src: "/images/social/brand/instagram.svg" },
  { href: "https://lin.ee/u3JpTa6", label: "LINE", src: "/images/social/brand/line.svg" },
  { label: "Threads", src: "/images/social/brand/threads.svg" },
  { label: "X", src: "/images/social/brand/x.svg" },
];

export const contactSocialLinks = ["LINE", "Instagram", "Facebook"].map(
  label => socialLinks.find(link => link.label === label)!,
);

export const contactMapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
