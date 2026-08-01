import { describe, expect, it, vi } from "vitest";
import {
  createCustomerAuthHandler,
  customerAuthSiteOrigin,
  customerVerificationRedirectPath,
} from "./customer-auth.js";
import { getCustomerPasswordErrors } from "../server/customerPasswordPolicy.js";

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
      signUp: vi.fn().mockResolvedValue(signUpResult || { data: { user: { id: "user-1" }, session: null }, error: null }),
      resend: vi.fn().mockResolvedValue(resendResult || { data: {}, error: null }),
    },
  };
}

describe("customer auth API", () => {
  it("uses the production domain for verification redirects", async () => {
    const supabase = createSupabaseAuthMock({});
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 1_000,
    });

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
  });

  it("enforces the shared password policy before calling Supabase", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = createSupabaseAuthMock({});
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 1_000,
    });

    const response = await invoke(handler, {
      action: "sign-up",
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
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 1_000,
    });

    const response = await invoke(handler, {
      action: "sign-up",
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
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 1_000,
    });

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

  it("resends signup verification with the production redirect and cooldown", async () => {
    const supabase = createSupabaseAuthMock({});
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 1_000,
    });

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
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 61_000,
    });

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
    const handler = createCustomerAuthHandler({
      getSupabaseAuthClient: () => supabase,
      now: () => 120_000,
    });
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
