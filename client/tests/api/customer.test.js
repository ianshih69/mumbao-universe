import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/customer.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const profileId = "profile-a";

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = value || "";
    },
  };
}

function createJsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function invoke({ method = "GET", action = "profile", query = {}, body, headers = {} } = {}) {
  const req = {
    method,
    query: { action, ...query },
    headers: {
      authorization: "Bearer customer-access-token",
      ...headers,
    },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) {
        yield Buffer.from(JSON.stringify(body), "utf8");
      }
    },
  };
  const res = createMockResponse();

  await handler(req, res);

  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

function authUser(overrides = {}) {
  return {
    id: authUserId,
    email: "member@example.com",
    email_confirmed_at: "2026-08-02T10:00:00.000Z",
    confirmed_at: null,
    raw_app_meta_data: { provider: "email" },
    raw_user_meta_data: { secret: "do-not-return" },
    identities: [{ id: "identity-a" }],
    ...overrides,
  };
}

function customerProfile(overrides = {}) {
  return {
    id: profileId,
    auth_user_id: authUserId,
    email: "member@example.com",
    name: "測試會員",
    phone: "0912345678",
    member_level: "vip",
    default_postal_code: "970",
    default_city: "花蓮縣",
    default_district: "壽豐鄉",
    default_address: "慢慢蒔光路 1 號",
    is_active: true,
    admin_note: "frontend must not see this",
    created_at: "2026-08-02T09:00:00.000Z",
    updated_at: "2026-08-02T09:00:00.000Z",
    ...overrides,
  };
}

function installFetchMock() {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, options });

    if (requestUrl === "https://supabase.test/auth/v1/user") {
      return createJsonResponse(authUser());
    }

    if (requestUrl.includes("/rest/v1/shop_customer_profiles?auth_user_id=eq.")) {
      return createJsonResponse([customerProfile()]);
    }

    if (requestUrl.includes("/rest/v1/shop_orders?customer_profile_id=eq.")) {
      return createJsonResponse(
        [
          {
            id: "order-a",
            order_number: "MV-001",
            created_at: "2026-08-02T10:00:00.000Z",
            order_source: "online",
            subtotal: 1200,
            shipping_fee: 80,
            total: 1280,
            payment_status: "confirmed",
            order_status: "paid",
            shipping_carrier: null,
            tracking_number: null,
          },
        ],
        { headers: { "Content-Range": "0-9/11" } },
      );
    }

    if (requestUrl.includes("/rest/v1/shop_order_items?order_id=in.")) {
      return createJsonResponse([
        {
          order_id: "order-a",
          product_name: "慢寶星座馬克杯",
          variant_name: "星座",
          variant_option: "金牛座",
          quantity: 1,
        },
      ]);
    }

    throw new Error(`Unexpected fetch: ${requestUrl}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("customer account API", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("rejects unauthenticated customer profile requests", async () => {
    const response = await invoke({
      headers: { authorization: "" },
    });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("profile");
  });

  it("returns only the logged-in customer's safe profile fields", async () => {
    const { calls } = installFetchMock();

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      id: profileId,
      auth_user_id: authUserId,
      email: "member@example.com",
      member_level: "vip",
      email_verified: true,
      default_address: "慢慢蒔光路 1 號",
    });
    expect(response.body.profile).not.toHaveProperty("admin_note");
    expect(response.body.profile).not.toHaveProperty("raw_user_meta_data");
    expect(response.body.profile).not.toHaveProperty("raw_app_meta_data");
    expect(response.body.profile).not.toHaveProperty("identities");
    expect(JSON.stringify(response.body)).not.toContain("service-role-secret");

    const profileLookup = calls.find((call) => call.url.includes("/rest/v1/shop_customer_profiles?auth_user_id=eq."));
    expect(profileLookup.url).toContain(`auth_user_id=eq.${authUserId}`);
    expect(profileLookup.url).not.toContain("email=eq.");
  });

  it("rejects attempts to update member-only fields before patching the profile", async () => {
    const { calls } = installFetchMock();

    const response = await invoke({
      method: "PATCH",
      body: {
        name: "新姓名",
        member_level: "diamond",
        admin_note: "should not pass",
      },
    });

    expect(response.status).toBe(400);
    expect(calls.some((call) => call.options?.method === "PATCH")).toBe(false);
  });

  it("loads customer orders by the logged-in customer profile with a 10 item page", async () => {
    const { calls } = installFetchMock();

    const response = await invoke({
      action: "orders",
      query: { page: "1", pageSize: "50" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      order_number: "MV-001",
      item_summary: "慢寶星座馬克杯",
    });

    const orderLookup = calls.find((call) => call.url.includes("/rest/v1/shop_orders?customer_profile_id=eq."));
    expect(orderLookup.url).toContain(`customer_profile_id=eq.${profileId}`);
    expect(orderLookup.options.headers.Range).toBe("0-9");
    expect(calls.some((call) => call.url.includes("booking_requests"))).toBe(false);
  });
});
