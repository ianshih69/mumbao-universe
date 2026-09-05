function normalizeCompactText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function hasPricingCue(text) {
  return /房價|房費|住宿費|住宿價格|住宿報價|包棟價格|單間價格|總價|總共|多少錢|費用|報價|價位|多少|幾多|怎麼算|怎算/.test(
    text
  );
}

function hasHardPolicyPricingCue(text) {
  return /取消|退訂|退款|退費|退多少|訂金|押金|保留|留房|匯款|付款|刷卡|信用卡|加(?:一|1|[0-9]+)?個?人|多(?:一|1|[0-9]+)?個?人|延後退房|退房時間|幾點退房|提早入住|提前入住|入住時間|行李|清潔|垃圾|寄放|設備|損壞|賠|賠償/.test(
    text
  );
}

function hasAddOnPolicyPricingCue(text) {
  return /寵物|狗|狗狗|犬|貓|貓咪|毛孩|早餐|烤肉|bbq|麻將|ktv|停車|車位/.test(
    text
  );
}

function hasLodgingCostCue(text) {
  return /房價|房費|住宿費|住宿價格|住宿報價|包棟價格|包棟房價|包棟費用|單間價格|單間房價|單間費用/.test(
    text
  );
}

function hasStayTypeCue(text) {
  return /包棟|整棟|全棟|villa|單間|房間/.test(text);
}

function hasDateCue(text) {
  return /(?:\d{1,2}[\/.-]\d{1,2}|\d{1,2}月\d{1,2}(?:日|號)?|今天|明天|後天|這週|週[一二三四五六日天]|星期[一二三四五六日天]|下週|下個月|月底)/.test(
    text
  );
}

function hasGuestCue(text) {
  return /(?:\d+|[零〇一二兩两三四五六七八九十]+)(?:位|個)?(?:人|位|大人|成人|小孩|兒童|孩童|住客)/.test(
    text
  );
}

function hasNightCue(text) {
  return /(?:\d+|[零〇一二兩两三四五六七八九十]+)(?:晚|夜)/.test(text);
}

function hasLodgingActionCue(text) {
  return /想訂|要訂|訂房|預訂|入住|住一晚|住兩晚|住\d+晚|住宿/.test(text);
}

function hasPricingFollowUpCue(text) {
  return /^(?:那|所以|這樣)?(?:總共)?(?:多少|多少錢|費用|價格|報價)(?:呢|嗎|啊|呀)?[?？]?$/.test(
    text
  );
}

function hasStandaloneWholeStayQuoteCue(text) {
  return /^(?:那|所以|這樣)?(?:總共|整趟|住宿)?(?:多少|多少錢|費用多少|價格多少|報價)(?:呢|嗎|啊|呀)?[?？]?$/.test(
    text
  );
}

function hasCollectedStayContext(context) {
  return Boolean(
    context?.stay_type &&
      (context?.check_in ||
        context?.check_out ||
        (context?.guest_count !== null && context?.guest_count !== undefined))
  );
}

function hasPricingSessionContext({ context, previousContext, recentMessages } = {}) {
  const contexts = [context, previousContext].filter(Boolean);
  if (
    contexts.some(
      (item) =>
        item?.active_intent === "pricing" || item?.current_topic === "booking_price"
    )
  ) {
    return true;
  }

  return (recentMessages || []).some((message) => {
    if (message?.sender !== "ai") return false;
    const metadata = message?.metadata;
    return Boolean(
      metadata?.lodging_price_status === "resolved" ||
        metadata?.price_calculation_route === "existing_official_pricing" ||
        metadata?.pricing_override_applied === true ||
        Number.isInteger(metadata?.lodging_price_amount)
    );
  });
}

export function isStrongExplicitLodgingQuoteRequest(
  message,
  { context = null, previousContext = null, recentMessages = [] } = {}
) {
  const text = normalizeCompactText(message);
  if (!text || !hasPricingCue(text) || hasHardPolicyPricingCue(text)) return false;

  const hasStayType = hasStayTypeCue(text);
  const hasDate = hasDateCue(text);
  const hasGuest = hasGuestCue(text);
  const hasNight = hasNightCue(text);
  const hasLodgingAction = hasLodgingActionCue(text);
  const hasMessageTripEvidence = Boolean(
    hasLodgingCostCue(text) ||
      hasStayType ||
      hasDate ||
      hasGuest ||
      hasNight ||
      hasLodgingAction
  );
  const hasContextTripEvidence =
    hasCollectedStayContext(context) || hasCollectedStayContext(previousContext);

  if (hasAddOnPolicyPricingCue(text) && !hasMessageTripEvidence && !hasContextTripEvidence) {
    return false;
  }

  if (hasStandaloneWholeStayQuoteCue(text)) {
    return (
      hasPricingSessionContext({ context, previousContext, recentMessages }) ||
      hasContextTripEvidence
    );
  }
  if (hasPricingFollowUpCue(text)) {
    return (
      hasPricingSessionContext({ context, previousContext, recentMessages }) ||
      hasContextTripEvidence
    );
  }
  if (hasLodgingCostCue(text)) return true;

  return Boolean(hasStayType || hasDate || hasGuest || hasNight || hasLodgingAction);
}

export function isDeterministicPricingRequest(message, options = {}) {
  const text = normalizeCompactText(message);
  if (!text || !hasPricingCue(text)) return false;
  if (isStrongExplicitLodgingQuoteRequest(message, options)) return true;

  return Boolean(
    /(?:狗|狗狗|犬|毛孩).*(?:公斤|押金|多少|費用|價格)|(?:寵物押金)|(?:早餐).*(?:份|多少|費用|價格)|(?:兩天一夜|三天兩夜|算幾晚)/.test(
      text
    )
  );
}
