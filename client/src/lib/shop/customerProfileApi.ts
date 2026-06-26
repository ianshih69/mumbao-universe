export type CustomerProfile = {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  phone: string;
  default_postal_code: string;
  default_city: string;
  default_district: string;
  default_address: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerProfileUpdatePayload = {
  name?: string;
  phone?: string;
  default_postal_code?: string;
  default_city?: string;
  default_district?: string;
  default_address?: string;
};

export type CustomerAdminLink = {
  label: string;
  href: string;
};

export type CustomerAdminAccess = {
  isStaff: boolean;
  role: string | null;
  adminLinks: CustomerAdminLink[];
};

export class CustomerProfileApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CustomerProfileApiError";
    this.status = status;
    this.code = code;
  }
}

type CustomerProfileResponse = {
  profile?: CustomerProfile;
  error?: string;
  code?: string;
};

type CustomerAdminAccessResponse = CustomerAdminAccess & {
  error?: string;
  code?: string;
};

function getCustomerProfileErrorMessage(status: number, fallback?: string) {
  if (status === 401) {
    return "請先登入會員。";
  }

  if (status === 403) {
    return fallback || "此會員帳號目前已停用，請聯絡客服。";
  }

  if (status === 400) {
    return fallback || "會員資料格式不正確。";
  }

  return fallback || "會員資料暫時無法處理，請稍後再試。";
}

async function parseCustomerProfileResponse(response: Response) {
  let data: CustomerProfileResponse = {};

  try {
    data = (await response.json()) as CustomerProfileResponse;
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new CustomerProfileApiError(
      getCustomerProfileErrorMessage(response.status, data.error),
      response.status,
      data.code,
    );
  }

  if (!data.profile) {
    throw new CustomerProfileApiError("會員資料暫時無法處理，請稍後再試。", response.status);
  }

  return data.profile;
}

export async function fetchCustomerProfile(accessToken: string) {
  const response = await fetch("/api/customer?action=profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseCustomerProfileResponse(response);
}

export async function updateCustomerProfile(accessToken: string, payload: CustomerProfileUpdatePayload) {
  const response = await fetch("/api/customer?action=profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseCustomerProfileResponse(response);
}

export async function fetchCustomerAdminAccess(accessToken: string) {
  const response = await fetch("/api/customer?action=admin-links", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let data: CustomerAdminAccessResponse | null = null;
  try {
    data = (await response.json()) as CustomerAdminAccessResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new CustomerProfileApiError(
      getCustomerProfileErrorMessage(response.status, data?.error),
      response.status,
      data?.code,
    );
  }

  return {
    isStaff: Boolean(data?.isStaff),
    role: data?.role || null,
    adminLinks: Array.isArray(data?.adminLinks) ? data.adminLinks : [],
  };
}
