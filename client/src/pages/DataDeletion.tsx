import { LegalPage } from "@/components/legal/LegalPage";

const emailLink = (
  <a
    href="mailto:service@mumbao.tw"
    className="break-all font-medium text-[#8b6f5b] underline underline-offset-4"
  >
    service@mumbao.tw
  </a>
);

export default function DataDeletion() {
  return (
    <LegalPage
      title="使用者資料刪除說明"
      description="慢慢蒔光 villa｜慢寶宇宙使用者資料刪除申請方式，適用於 Meta、Facebook、Instagram、LINE、AI 客服、訂房與購物服務。"
      canonicalPath="/data-deletion"
      updatedAt="2026 年 6 月 10 日"
      introduction={
        <p>
          若您曾透過慢慢蒔光 villa｜慢寶宇宙網站、Meta、Facebook、Instagram
          授權、LINE 登入、AI 客服、訂房表單或購物服務提供個人資料，可依本頁方式申請刪除資料。
        </p>
      }
      sections={[
        {
          title: "如何申請刪除資料",
          content: (
            <>
              <p>
                請寄信至 {emailLink}，信件主旨建議填寫「資料刪除申請」。
              </p>
              <p>信件內容請提供：</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>您的姓名或稱呼。</li>
                <li>可供聯絡的 Email。</li>
                <li>
                  使用過的服務，例如 Facebook 授權、LINE 登入、AI
                  客服、訂房詢問或購物訂單。
                </li>
                <li>希望刪除的資料範圍。</li>
                <li>
                  可協助識別資料的資訊，例如訂單編號、對話時間或社群帳號名稱。
                </li>
              </ul>
              <p className="font-medium text-stone-800">
                請勿在信件中提供 Facebook、LINE 或任何第三方平台密碼。
              </p>
            </>
          ),
        },
        {
          title: "處理方式",
          content: (
            <p>
              收到申請後，我們會在合理時間內聯絡您，以確認申請人身分及資料範圍，並協助刪除或匿名化可刪除的個人資料。為避免他人冒名申請，我們可能要求提供合理且必要的識別資訊。
            </p>
          ),
        },
        {
          title: "可能無法立即刪除的資料",
          content: (
            <p>
              基於法律、稅務、交易紀錄、帳務、資訊安全、防詐、備份週期或爭議處理需要，部分資料可能無法立即刪除，或需依法及基於合理目的保留必要期間。保留期間屆滿後，我們將依適用規範處理。
            </p>
          ),
        },
        {
          title: "第三方平台資料",
          content: (
            <p>
              若資料儲存在 Meta、Facebook、Instagram、LINE、Google
              或其他第三方平台，您亦可至該平台的帳號設定中移除應用程式授權，或依該平台的隱私政策與資料刪除程序提出申請。
            </p>
          ),
        },
        {
          title: "聯絡方式",
          content: <p>資料刪除申請與相關問題請聯絡：{emailLink}</p>,
        },
      ]}
    />
  );
}
