const compact = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const capability = (definition) =>
  Object.freeze({
    goal_id: "general_policy_lookup",
    canonical_faq_ids: [],
    required: [],
    optional: [],
    excluded: [],
    local: false,
    unknown_policy: false,
    ...definition,
  });

// These are semantic frames, not utterance templates. Each capability requires
// the subject and action/qualifier slots that distinguish it from nearby policy.
export const semanticDialogueCapabilities = Object.freeze([
  capability({
    capability_id: "luggage_delivery_policy",
    required: [/行李|包裹/, /宅配|寄送|郵寄|代收|送達|物流/],
    excluded: [/食材|蛋糕|冷凍|冷藏/],
    unknown_policy: true,
    specificity: 100,
  }),
  capability({
    capability_id: "post_checkout_luggage_policy",
    canonical_faq_ids: ["faq-092"],
    required: [/行李/, /寄放|暫放|保管/, /退房|離開|離館|住宿結束|下午/],
    excluded: [/宅配|寄送|郵寄|代收|物流/],
    specificity: 96,
  }),
  capability({
    capability_id: "precheckin_luggage_policy",
    canonical_faq_ids: ["faq-091"],
    required: [/行李/, /寄放|暫放|保管/, /入住前|提早|先到|抵達|到場|現場/],
    excluded: [/宅配|寄送|郵寄|代收|物流/],
    specificity: 94,
  }),
  capability({
    capability_id: "late_checkout_policy",
    canonical_faq_ids: ["faq-079"],
    required: [/退房|離館/, /延後|延遲|晚(?:點|些|一|二|兩|三|\d)|加時|超時|多待|延長|最晚/],
    specificity: 94,
  }),
  capability({
    capability_id: "visitor_policy",
    canonical_faq_ids: ["faq-320"],
    required: [/訪客|朋友|親友|非住宿|不過夜|來玩|來訪/],
    optional: [/費|價格|多少|收費|時間|幾點|停留|可以|能|帶/],
    specificity: 92,
  }),
  capability({
    capability_id: "general_deposit_policy",
    canonical_faq_ids: ["faq-050"],
    required: [/押金|保證金/],
    excluded: [/寵物|狗|犬|毛孩/],
    specificity: 92,
  }),
  capability({
    capability_id: "cancellation_policy",
    goal_id: "cancellation_policy_lookup",
    canonical_faq_ids: ["faq-051"],
    required: [/取消|退訂/],
    excluded: [/早餐|寵物|狗|犬|毛孩|成人|兒童|嬰幼兒|人數|行李|加購/],
    specificity: 92,
  }),
  capability({
    capability_id: "pet_supplies_policy",
    canonical_faq_ids: ["faq-237"],
    required: [/寵物|狗|犬|毛孩/, /用品|用具|飯碗|水碗|圍欄|圍籬|提供什麼|準備什麼/],
    specificity: 92,
  }),
  capability({
    capability_id: "pet_shedding_policy",
    canonical_faq_ids: ["faq-243"],
    required: [/寵物|狗|犬|毛孩/, /掉毛|脫毛|毛很多|毛髮|清毛/],
    specificity: 92,
  }),
  capability({
    capability_id: "pet_bathing_policy",
    canonical_faq_ids: ["faq-244"],
    required: [/寵物|狗|犬|毛孩/, /洗澡|沖洗|清洗|沐浴/],
    specificity: 92,
  }),
  capability({
    capability_id: "large_dog_policy",
    canonical_faq_ids: ["faq-234"],
    required: [/狗|犬|毛孩/, /大型|大隻|體型大|超過20|重(?:量)?/],
    optional: [/入住|住宿|接受|可以|能/],
    specificity: 90,
  }),
  capability({
    capability_id: "pet_deposit_policy",
    goal_id: "pet_deposit_lookup",
    required: [/寵物|狗|犬|毛孩/, /押金|保證金/],
    local: true,
    specificity: 90,
  }),
  capability({
    capability_id: "vegetarian_breakfast_policy",
    canonical_faq_ids: ["faq-203"],
    required: [/早餐|早點|早餐餐點/, /素食|吃素|蔬食|不吃肉/],
    specificity: 90,
  }),
  capability({
    capability_id: "room_allocation_policy",
    canonical_faq_ids: ["faq-130"],
    required: [/房間|客房|房型|床位/, /分配|安排|怎麼住|如何住|誰住|配置/],
    specificity: 90,
  }),
  capability({
    capability_id: "room_count_policy",
    canonical_faq_ids: ["faq-131"],
    required: [/房間|客房|臥房|房型/, /幾間|多少間|間數|總數|數量/],
    specificity: 90,
  }),
  capability({
    capability_id: "quad_room_policy",
    canonical_faq_ids: ["faq-135"],
    required: [/房間|客房|房型/, /四人|4人|睡四|住四/],
    specificity: 95,
  }),
  capability({
    capability_id: "pet_eligibility_policy",
    goal_id: "pet_eligibility_lookup",
    canonical_faq_ids: ["faq-226"],
    required: [/寵物|狗|犬|毛孩|貓/],
    optional: [/可以|能|接受|開放|入住|住宿|帶|規定|限制/],
    local: false,
    specificity: 60,
  }),
  capability({
    capability_id: "breakfast_policy",
    goal_id: "breakfast_info_lookup",
    canonical_faq_ids: ["faq-204"],
    required: [/早餐|早點/],
    excluded: [/素食|吃素|蔬食|不吃肉/],
    local: true,
    specificity: 50,
  }),
  capability({
    capability_id: "checkout_policy",
    goal_id: "checkout_info",
    canonical_faq_ids: ["faq-077"],
    required: [/退房|離館|checkout|check-out/],
    excluded: [/延後|延遲|晚(?:點|些|一|二|兩|三|\d)|加時|超時|多待|延長|最晚|行李|寄放|暫放/],
    local: true,
    specificity: 48,
  }),
  capability({
    capability_id: "checkin_policy",
    goal_id: "checkin_info",
    canonical_faq_ids: ["faq-076"],
    required: [/入住|進房|checkin|check-in/],
    excluded: [/行李|寄放|暫放|宅配|寄送/],
    local: true,
    specificity: 48,
  }),
  capability({
    capability_id: "kitchen_policy",
    goal_id: "facility_policy_lookup",
    canonical_faq_ids: ["faq-178"],
    required: [/廚房|煮飯|料理|烹煮|開伙/],
    local: true,
    specificity: 48,
  }),
  capability({
    capability_id: "pool_policy",
    goal_id: "facility_policy_lookup",
    canonical_faq_ids: ["faq-363"],
    required: [/泳池|戲水|游泳/],
    local: true,
    specificity: 48,
  }),
]);

function matchesEvery(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

export function matchSemanticDialogueCapabilities(message) {
  const text = compact(message);
  const matches = semanticDialogueCapabilities
    .filter(
      (entry) =>
        matchesEvery(text, entry.required) &&
        !entry.excluded.some((pattern) => pattern.test(text)),
    )
    .map((entry) => ({
      ...entry,
      optional_match_count: entry.optional.filter((pattern) => pattern.test(text)).length,
    }))
    .sort(
      (left, right) =>
        right.specificity - left.specificity ||
        right.optional_match_count - left.optional_match_count,
    );

  if (!matches.length) {
    return {
      matches: [],
      primary: null,
      goal_ids: [],
      canonical_faq_ids: [],
      unknown_policy: false,
    };
  }

  const highestSpecificity = matches[0].specificity;
  const selected = matches.filter(
    (entry) => entry.specificity === highestSpecificity,
  );
  return {
    matches: selected,
    primary: selected[0],
    goal_ids: [...new Set(selected.map((entry) => entry.goal_id))],
    canonical_faq_ids: [
      ...new Set(selected.flatMap((entry) => entry.canonical_faq_ids)),
    ],
    unknown_policy: selected.some((entry) => entry.unknown_policy),
  };
}
