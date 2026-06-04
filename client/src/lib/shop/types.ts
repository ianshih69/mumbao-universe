export type ShopVariant = {
  id: string;
  product_id: string;
  sku?: string;
  variant_name: string;
  variant_option?: string;
  image_url?: string | null;
  price: number;
  compare_at_price?: number | null;
  inventory: number;
  status?: "active" | "inactive";
  sort_order?: number;
};

export type ShopImage = {
  id: string;
  image_url: string;
  alt?: string;
  sort_order?: number;
};

export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  subtitle?: string;
  description?: string;
  category: string;
  cover_image_url?: string;
  featured?: boolean;
  sort_order?: number;
  min_price: number;
  total_inventory: number;
  variants: ShopVariant[];
  images?: ShopImage[];
};

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  imageUrl?: string;
  variantId: string;
  variantName: string;
  variantOption?: string;
  price: number;
  quantity: number;
};

export type CheckoutCustomer = {
  name: string;
  phone: string;
  email?: string;
  address: string;
};

export type CreatedOrder = {
  id: string;
  order_number: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_status: "pending" | "confirmed" | "failed" | "refunded";
  order_status:
    | "pending_confirm"
    | "pending_payment"
    | "paid"
    | "shipping"
    | "completed"
    | "cancelled";
};
