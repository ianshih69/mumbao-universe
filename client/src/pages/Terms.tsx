import { LegalPage } from "@/components/legal/LegalPage";

const emailLink = (
  <a
    href="mailto:service@mumbao.tw"
    className="break-all font-medium text-[#8b6f5b] underline underline-offset-4"
  >
    service@mumbao.tw
  </a>
);

export default function Terms() {
  return (
    <LegalPage
      title="服務條款"
      description="慢慢蒔光 villa｜慢寶宇宙服務條款，說明住宿資訊、AI 客服、文創商品、訂房與網站內容的使用規範。"
      canonicalPath="/terms"
      updatedAt="2026 年 6 月 10 日"
      introduction={
        <p>
          歡迎使用慢慢蒔光 villa｜慢寶宇宙官方網站。當您瀏覽或使用本網站及相關服務，即表示您已閱讀、理解並同意遵守本服務條款。
        </p>
      }
      sections={[
        {
          title: "網站與服務內容",
          content: (
            <p>
              本網站提供宜蘭員山包棟 villa、寵物友善住宿、房型與訂房導引、AI
              客服、慢寶宇宙 IP 內容、文創商品展示、購物車與訂單、社群資訊及其他品牌相關內容。部分功能仍在建置或測試中，實際提供項目以網站公告為準。
            </p>
          ),
        },
        {
          title: "資訊正確性",
          content: (
            <p>
              我們會盡力維持網站資訊正確與即時，但網站內容、價格、活動、房型、商品、庫存、開放時間及營運資訊可能隨時調整。正式資訊應以官網最新公告、客服回覆、訂房平台或雙方實際確認內容為準。
            </p>
          ),
        },
        {
          title: "使用者責任",
          content: (
            <p>
              使用者不得惡意攻擊、干擾或破壞網站與系統，不得冒用他人身分、提供不實或侵權資料、濫用 AI
              客服、未經授權存取後台，或利用本網站從事任何違法、詐欺、騷擾或損害他人權益的行為。
            </p>
          ),
        },
        {
          title: "訂房與商品",
          content: (
            <p>
              訂房、取消、付款、退款、入住與寵物規範，以及商品價格、付款、出貨、退換貨與售後服務，均依相關頁面公告、客服說明、訂房平台規範或雙方實際確認內容為準。完成網站送單不代表訂房或交易必然成立，仍可能需要人工確認。
            </p>
          ),
        },
        {
          title: "智慧財產權",
          content: (
            <p>
              慢慢蒔光、STime villa、慢寶、慢寶宇宙、MUMBAO、角色設定、插畫、文字、圖片、Logo、商品設計、網站版面及其他內容，除另有標示外，均屬慢慢蒔光或相關權利人所有。未經書面授權，不得重製、改作、散布、販售、公開傳輸、商業使用，或用於建立、訓練及改善 AI
              模型。
            </p>
          ),
        },
        {
          title: "第三方連結",
          content: (
            <p>
              本網站可能連結至 Meta、Facebook、Instagram、Threads、LINE、Google、訂房平台或其他第三方網站與服務。第三方服務由其各自的條款、政策與營運方式規範，我們不控制其內容或可用性。
            </p>
          ),
        },
        {
          title: "免責聲明",
          content: (
            <p>
              因網路中斷、第三方服務異常、系統維護、不可抗力、使用者設備或操作問題造成的服務中斷、資訊延遲或資料顯示差異，我們將在合理範圍內協助處理，但不負擔超出依法應負或合理可控制範圍的責任。
            </p>
          ),
        },
        {
          title: "條款變更",
          content: (
            <p>
              本條款可能因服務內容、網站功能、平台政策或法規調整而更新。更新後內容將公布於本頁，繼續使用本網站即表示您同意更新後的條款。
            </p>
          ),
        },
        {
          title: "聯絡方式",
          content: <p>如對本條款有任何疑問，請聯絡：{emailLink}</p>,
        },
      ]}
    />
  );
}
