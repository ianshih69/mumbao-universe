import { LegalPage } from "@/components/legal/LegalPage";

const emailLink = (
  <a
    href="mailto:service@mumbao.tw"
    className="break-all font-medium text-[#8b6f5b] underline underline-offset-4"
  >
    service@mumbao.tw
  </a>
);

export default function Privacy() {
  return (
    <LegalPage
      title="隱私權政策"
      description="慢慢蒔光 villa｜慢寶宇宙隱私權政策，說明官網、AI 客服、訂房、購物與 Meta、LINE 等功能如何蒐集、使用及保護個人資料。"
      canonicalPath="/privacy"
      updatedAt="2026 年 6 月 10 日"
      introduction={
        <p>
          慢慢蒔光 villa｜慢寶宇宙重視每一位使用者的隱私與個人資料安全。本政策說明您使用本網站、AI
          客服、訂房或聯絡表單、購物車、訂單、社群登入及 Meta
          相關功能時，我們可能蒐集、使用、保存及保護資料的方式。
        </p>
      }
      sections={[
        {
          title: "可能蒐集的資料",
          content: (
            <>
              <p>依您使用的服務不同，我們可能蒐集下列資料：</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  您主動提供的姓名、電話、Email，以及 LINE、Facebook 或
                  Instagram 顯示名稱。
                </li>
                <li>訂房、詢問、購物車、訂單及客服對話內容。</li>
                <li>
                  IP 位址、裝置資訊、瀏覽器資訊、使用時間及網站操作紀錄。
                </li>
                <li>
                  經第三方平台授權取得的基本公開資料，例如 Meta、Facebook
                  粉絲專頁授權或 LINE 登入資料。
                </li>
                <li>
                  後台營運工具所需的公開平台識別資料與操作紀錄。
                </li>
              </ul>
              <p className="font-medium text-stone-800">
                我們不會要求或保存您的 Facebook 密碼、LINE
                密碼，或其他第三方平台的登入密碼。
              </p>
            </>
          ),
        },
        {
          title: "資料使用目的",
          content: (
            <ul className="list-disc space-y-2 pl-6">
              <li>提供住宿、訂房、客服、購物及售後服務。</li>
              <li>回覆詢問、處理訂單及發送必要通知。</li>
              <li>維護網站、AI 客服與後台系統正常運作。</li>
              <li>管理官方社群平台及發布品牌內容。</li>
              <li>改善網站體驗、資訊安全與服務品質。</li>
              <li>符合法律、平台政策或主管機關要求。</li>
            </ul>
          ),
        },
        {
          title: "第三方服務",
          content: (
            <>
              <p>本網站可能使用或連結下列第三方服務：</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Meta、Facebook、Instagram 及 Threads API</li>
                <li>LINE Login 與 LINE 官方帳號</li>
                <li>Vercel</li>
                <li>Supabase</li>
                <li>Cloudflare R2</li>
                <li>Google 相關服務</li>
              </ul>
              <p>
                上述第三方可能依其服務條款與隱私政策獨立處理資料，建議您一併閱讀相關平台的政策。
              </p>
            </>
          ),
        },
        {
          title: "Cookie 與類似技術",
          content: (
            <p>
              本網站可能使用 Cookie、localStorage、sessionStorage
              或類似技術，保存登入狀態、購物車、偏好設定及必要的操作資訊，以維持功能與改善使用體驗。您可透過瀏覽器設定管理相關資料，但停用後部分功能可能無法正常使用。
            </p>
          ),
        },
        {
          title: "資料保存與保護",
          content: (
            <p>
              我們會依資料性質及服務需求，在必要期間內保存資料，並採取合理的技術與管理措施防止未授權存取、洩漏、竄改或遺失。然而，任何網路傳輸或電子儲存方式均無法保證百分之百安全。
            </p>
          ),
        },
        {
          title: "使用者權利",
          content: (
            <p>
              您可透過 {emailLink}
              要求查詢、閱覽、更正、停止使用或刪除您的個人資料。若法令、交易紀錄、帳務、資訊安全、防詐或爭議處理需要保留資料，我們可能依法或於合理必要範圍內保留相關紀錄。
            </p>
          ),
        },
        {
          title: "未成年人",
          content: (
            <p>
              未成年人使用本網站或相關服務時，應由法定代理人陪同、同意或協助。若法定代理人認為未成年人未經同意提供個人資料，可與我們聯絡。
            </p>
          ),
        },
        {
          title: "政策變更",
          content: (
            <p>
              本政策可能因網站功能、服務內容、第三方平台政策或法規調整而更新。更新後內容將公布於本頁，並以本頁所示的最後更新日期為準。
            </p>
          ),
        },
        {
          title: "聯絡方式",
          content: (
            <p>
              如對本政策或個人資料處理有任何疑問，請聯絡：{emailLink}
            </p>
          ),
        },
      ]}
    />
  );
}
