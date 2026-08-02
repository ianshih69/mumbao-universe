import { describe, expect, it, vi } from "vitest";
import {
  createCustomerAuthHandler,
  customerAuthResponseCodes,
  customerAuthSiteOrigin,
  customerVerificationRedirectPath,
} from "../../api/customer-auth.js";
import { getCustomerPasswordErrors } from "../../server/customerPasswordPolicy.js";

const testNow = Date.parse("2026-08-01T00:00:00.000Z");
const freshCreatedAt = "2026-08-01T00:00:00.000Z";
const newUserId = "11111111-1111-4111-8111-111111111111";
const existingUserId = "22222222-2222-4222-8222-222222222222";

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

async function invoke(handler, { action, body, headers = {}, remoteAddress = "127.0.0.1" }) {
  const req = {
    method: "POST",
    query: { action },
    body,
    headers,
    socket: {
      remoteAddress,
    },
  };
  const res = createMockResponse();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

function createSupabaseAuthMock({ signUpResult, resendResult }) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue(
        signUpResult || {
          data: { user: { id: newUserId }, session: null },
          error: null,
        },
      ),
      resend: vi.fn().mockResolvedValue(resendResult || { data: {}, error: null }),
    },
  };
}

function authUser(overrides = {}) {
  return {
    id: newUserId,
    email: "test@example.com",
    created_at: freshCreatedAt,
    email_confirmed_at: null,
    confirmed_at: null,
    user_metadata: {
      name: "慢寶",
      phone: "0912345678",
    },
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: "profile-1",
    auth_user_id: existingUserId,
    email: "test@example.com",
    name: "原本姓名",
    phone: "0900000000",
    is_active: true,
    ...overrides,
  };
}

function createDependencies({
  supabase = createSupabaseAuthMock({}),
  now = testNow,
  profileByEmail = null,
  profileByAuthUserId = null,
  adminAuthUser = authUser(),
  createdProfile = {
    id: "profile-new",
    auth_user_id: adminAuthUser.id,
    email: adminAuthUser.email,
  },
} = {}) {
  return {
    createCustomerProfileFromAuthUser: vi.fn().mockResolvedValue(createdProfile),
    findCustomerProfileByAuthUserId: vi.fn().mockResolvedValue(profileByAuthUserId),
    findCustomerProfileByEmail: vi.fn().mockResolvedValue(profileByEmail),
    getAuthUserById: vi.fn().mockResolvedValue(adminAuthUser),
    getSupabaseAuthClient: () => supabase,
    now: () => now,
  };
}

describe("customer auth API", () => {
  it("creates a new signup and sends verification through Supabase Auth", async () => {
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      adminAuthUser: authUser({ email: "test@example.com" }),
    });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      body: {
        email: " Test@Example.com ",
        password: "Mumbao88",
        name: "慢寶",
        phone: "0912345678",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: customerAuthResponseCodes.signupCreated,
      requiresEmailVerification: true,
      emailVerificationSent: true,
      verificationRedirectOrigin: customerAuthSiteOrigin,
    });
    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        options: expect.objectContaining({
          emailRedirectTo: `${customerAuthSiteOrigin}${customerVerificationRedirectPath}`,
        }),
      }),
    );
    expect(dependencies.findCustomerProfileByEmail).toHaveBeenCalledWith("test@example.com");
    expect(dependencies.getAuthUserById).toHaveBeenCalledWith(newUserId);
    expect(dependencies.createCustomerProfileFromAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: newUserId,
        email: "test@example.com",
      }),
    );
  });

  it("enforces the shared password policy before calling Supabase", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({ supabase });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      headers: { "x-forwarded-for": "203.0.113.30" },
      body: {
        email: "test@example.com",
        password: "aa123456",
        name: "慢寶",
        phone: "0912345678",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: "CUSTOMER_PASSWORD_INVALID",
      details: {
        passwordErrors: getCustomerPasswordErrors("aa123456"),
      },
    });
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    expect(dependencies.createCustomerProfileFromAuthUser).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not report success when Supabase cannot send the verification email", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({
      signUpResult: {
        data: { user: null, session: null },
        error: { message: "Error sending confirmation mail", status: 500 },
      },
    });
    const dependencies = createDependencies({ supabase });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      headers: { "x-forwarded-for": "203.0.113.31" },
      body: {
        email: "test@example.com",
        password: "Mumbao88",
        name: "慢寶",
        phone: "0912345678",
      },
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      ok: false,
      code: "CUSTOMER_VERIFICATION_EMAIL_FAILED",
    });
    expect(response.body.emailVerificationSent).toBeUndefined();
    consoleError.mockRestore();
  });

  it("fails clearly if email confirmation is disabled", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({
      signUpResult: {
        data: { user: { id: "user-1" }, session: { access_token: "session-token" } },
        error: null,
      },
    });
    const dependencies = createDependencies({ supabase });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      body: {
        email: "test@example.com",
        password: "Mumbao88",
        name: "慢寶",
        phone: "0912345678",
      },
    });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      ok: false,
      code: "CUSTOMER_EMAIL_CONFIRMATION_DISABLED",
    });
    consoleError.mockRestore();
  });

  it("rejects an already verified email before calling signup", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      profileByEmail: profile({
        auth_user_id: existingUserId,
        email: "verified@example.com",
      }),
      adminAuthUser: authUser({
        id: existingUserId,
        email: "verified@example.com",
        created_at: "2026-07-01T00:00:00.000Z",
        email_confirmed_at: "2026-07-01T00:10:00.000Z",
      }),
    });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      headers: { "x-forwarded-for": "203.0.113.30" },
      body: {
        email: "verified@example.com",
        password: "Mumbao88",
        name: "新姓名",
        phone: "0911111111",
      },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: customerAuthResponseCodes.emailAlreadyRegistered,
    });
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    expect(dependencies.createCustomerProfileFromAuthUser).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects an unverified email and does not overwrite profile or auth metadata", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      profileByEmail: profile({
        auth_user_id: existingUserId,
        email: "unverified@example.com",
        name: "原本姓名",
        phone: "0900000000",
      }),
      adminAuthUser: authUser({
        id: existingUserId,
        email: "unverified@example.com",
        created_at: "2026-07-01T00:00:00.000Z",
        email_confirmed_at: null,
        confirmed_at: null,
      }),
    });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      headers: { "x-forwarded-for": "203.0.113.31" },
      body: {
        email: "unverified@example.com",
        password: "NewMumbao88",
        name: "新姓名",
        phone: "0911111111",
      },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: customerAuthResponseCodes.emailNotVerified,
    });
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    expect(dependencies.createCustomerProfileFromAuthUser).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("normalizes email casing and surrounding spaces before duplicate checks", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      profileByEmail: profile({ email: "case@example.com" }),
      adminAuthUser: authUser({
        id: existingUserId,
        email: "case@example.com",
        email_confirmed_at: "2026-07-01T00:10:00.000Z",
      }),
    });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "sign-up",
      headers: { "x-forwarded-for": "203.0.113.32" },
      body: {
        email: " Case@Example.com ",
        password: "Mumbao88",
        name: "慢寶",
        phone: "0912345678",
      },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(customerAuthResponseCodes.emailAlreadyRegistered);
    expect(dependencies.findCustomerProfileByEmail).toHaveBeenCalledWith("case@example.com");
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns only one signup success when the profile insert loses a duplicate race", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      adminAuthUser: authUser({
        email: "race@example.com",
        user_metadata: {
          name: "第一筆",
          phone: "0912345678",
        },
      }),
    });
    dependencies.createCustomerProfileFromAuthUser = vi
      .fn()
      .mockResolvedValueOnce({
        id: "profile-race",
        auth_user_id: newUserId,
        email: "race@example.com",
      })
      .mockResolvedValueOnce(null);
    const handler = createCustomerAuthHandler(dependencies);
    const body = {
      email: "race@example.com",
      password: "Mumbao88",
      name: "第一筆",
      phone: "0912345678",
    };

    const first = await invoke(handler, {
      action: "sign-up",
      body,
      headers: { "x-forwarded-for": "203.0.113.20" },
    });
    const second = await invoke(handler, {
      action: "sign-up",
      body: {
        ...body,
        name: "第二筆",
        phone: "0999999999",
      },
      headers: { "x-forwarded-for": "203.0.113.20" },
    });

    expect(first.body.code).toBe(customerAuthResponseCodes.signupCreated);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe(customerAuthResponseCodes.emailNotVerified);
    expect(
      [first, second].filter((response) => response.body.code === customerAuthResponseCodes.signupCreated),
    ).toHaveLength(1);
    consoleError.mockRestore();
  });

  it("resends signup verification with the production redirect and cooldown", async () => {
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({ supabase });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "resend-verification",
      body: { email: "resend@example.com" },
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      cooldownSeconds: 60,
    });
    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "resend@example.com",
      options: {
        emailRedirectTo: `${customerAuthSiteOrigin}${customerVerificationRedirectPath}`,
      },
    });
  });

  it("does not reveal whether resend produced a new verification email", async () => {
    const supabase = createSupabaseAuthMock({
      resendResult: {
        data: null,
        error: { message: "User already confirmed", status: 400 },
      },
    });
    const dependencies = createDependencies({ supabase, now: testNow + 61_000 });
    const handler = createCustomerAuthHandler(dependencies);

    const response = await invoke(handler, {
      action: "resend-verification",
      body: { email: "verified@example.com" },
      headers: { "x-forwarded-for": "203.0.113.11" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      message: "若此 Email 尚未驗證，我們已寄出驗證信，請至信箱查看。",
    });
    expect(response.body.emailVerificationSent).toBeUndefined();
  });

  it("rate limits repeated public signup attempts before calling Supabase", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const dependencies = createDependencies({
      supabase,
      now: testNow + 120_000,
      adminAuthUser: authUser({
        email: "limited@example.com",
      }),
    });
    const handler = createCustomerAuthHandler(dependencies);
    const baseBody = {
      password: "Mumbao88",
      name: "慢寶",
      phone: "0912345678",
    };

    for (const index of [1, 2, 3]) {
      const response = await invoke(handler, {
        action: "sign-up",
        body: { ...baseBody, email: "limited@example.com" },
        headers: { "x-forwarded-for": "203.0.113.12" },
      });
      expect(response.status).toBe(200);
    }

    const fourthSameEmail = await invoke(handler, {
      action: "sign-up",
      body: { ...baseBody, email: "limited@example.com" },
      headers: { "x-forwarded-for": "203.0.113.12" },
    });

    expect(fourthSameEmail.status).toBe(429);
    expect(fourthSameEmail.body).toMatchObject({
      ok: false,
      code: "CUSTOMER_AUTH_RATE_LIMITED",
    });
    expect(supabase.auth.signUp).toHaveBeenCalledTimes(3);
    consoleError.mockRestore();
  });
});
