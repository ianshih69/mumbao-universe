import type { CreatedOrder } from "./types";

export type CustomerOrderListItem = {
  order_number: string;
  created_at: string;
  order_status: CreatedOrder["order_status"];
  payment_status: CreatedOrder["payment_status"];
  order_source: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_carrier: string | null;
  tracking_number: string | null;
  item_count: number;
  item_summary: string;
};

export type CustomerOrderDetailItem = {
  product_name: string;
  product_image_url: string | null;
  variant_name: string;
  variant_option: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type CustomerOrderDetail = {
  order_number: string;
  created_at: string;
  order_status: CreatedOrder["order_status"];
  payment_status: CreatedOrder["payment_status"];
  order_source: string;
  shipping_carrier: string | null;
  tracking_number: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  customer: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  items: CustomerOrderDetailItem[];
};

export type CustomerOrdersPage = {
  items: CustomerOrderListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export class CustomerOrdersApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CustomerOrdersApiError";
    this.status = status;
    this.code = code;
  }
}

type CustomerOrdersResponse = Partial<CustomerOrdersPage> & {
  error?: string;
  code?: string;
};

type CustomerOrderDetailResponse = {
  order?: CustomerOrderDetail;
  error?: string;
  code?: string;
};

function getCustomerOrderErrorMessage(status: number, fallback?: string) {
  if (status === 401) return "請先登入會員。";
  if (status === 403) return fallback || "此會員帳號目前已停用，請聯絡客服。";
  if (status === 404) return fallback || "找不到這筆訂單。";
  return fallback || "會員訂單暫時無法讀取，請稍後再試。";
}

async function parseJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function fetchCustomerOrders(accessToken: string, page = 1) {
  const response = await fetch(`/api/customer?action=orders&page=${page}&pageSize=10`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await parseJson<CustomerOrdersResponse>(response);

  if (!response.ok) {
    throw new CustomerOrdersApiError(
      getCustomerOrderErrorMessage(response.status, data.error),
      response.status,
      data.code,
    );
  }

  return {
    items: data.items || [],
    page: data.page || page,
    pageSize: data.pageSize || 10,
    total: data.total || 0,
    totalPages: data.totalPages || 1,
  };
}

export async function fetchCustomerOrderDetail(accessToken: string, orderNumber: string) {
  const response = await fetch(
    `/api/customer?action=order&orderNumber=${encodeURIComponent(orderNumber)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const data = await parseJson<CustomerOrderDetailResponse>(response);

  if (!response.ok) {
    throw new CustomerOrdersApiError(
      getCustomerOrderErrorMessage(response.status, data.error),
      response.status,
      data.code,
    );
  }

  if (!data.order) {
    throw new CustomerOrdersApiError("找不到這筆訂單。", response.status);
  }

  return data.order;
}
