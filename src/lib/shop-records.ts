import type { SupabaseClient } from '@supabase/supabase-js';

export type Product = { id: string; name: string; buyingPrice: number; sellingPrice: number; quantity: number };
export type SaleItem = { productId: string; productName: string; quantity: number; buyingPrice: number; sellingPrice: number };
export type Sale = { id: string; createdAt: string; items: SaleItem[]; totalRevenue: number; costOfGoodsSold: number; grossProfit: number; soldBy: string; paymentType?: 'cash' | 'credit'; customerName?: string };
export type Employee = { id: string; name: string; role: string; activity: string; at: string };
export type Expense = { id: string; date: string; description: string; amount: number; createdAt: string };
export type ProductDailyTotal = { productId: string; productName: string; quantity: number; revenue: number; costOfGoodsSold: number; grossProfit: number };
export type StockSnapshot = { productId: string; productName: string; quantity: number };
export type DailyReport = {
  date: string; savedAt: string; totalRevenue: number; totalCostOfGoodsSold: number;
  grossProfit: number; totalQuantity: number; productBreakdown: ProductDailyTotal[];
  expenses: Expense[]; totalExpenses: number; netProfit: number;
  openingStock: StockSnapshot[]; closingStock: StockSnapshot[];
};
export type CreditRepayment = { id: string; amount: number; createdAt: string };
export type CreditEntry = {
  id: string; saleId: string; customerName: string; createdAt: string;
  totalAmount: number; amountPaid: number; soldBy: string; items: SaleItem[];
  repayments: CreditRepayment[];
};
export type ShopData = {
  products: Product[];
  sales: Sale[];
  employees: Employee[];
  reports: DailyReport[];
  expenses: Expense[];
  creditBook: CreditEntry[];
};

export type ShopRecordType = 'product' | 'sale' | 'employee' | 'daily_report' | 'expense' | 'credit_entry';
export type ShopRecordInput = { record_type: ShopRecordType; record_id: string; payload: Record<string, unknown> };
export type ShopRecordRow = ShopRecordInput & { user_id: string };

export function emptyShopData(): ShopData {
  return { products: [], sales: [], employees: [], reports: [], expenses: [], creditBook: [] };
}

export function toShopRecords(data: ShopData): ShopRecordInput[] {
  return [
    ...data.products.map((record) => ({ record_type: 'product' as const, record_id: record.id, payload: record })),
    ...data.sales.map((record) => ({ record_type: 'sale' as const, record_id: record.id, payload: record })),
    ...data.employees.map((record) => ({ record_type: 'employee' as const, record_id: record.id, payload: record })),
    ...data.reports.map((record) => ({ record_type: 'daily_report' as const, record_id: record.date, payload: record })),
    ...data.expenses.map((record) => ({ record_type: 'expense' as const, record_id: record.id, payload: record })),
    ...data.creditBook.map((record) => ({ record_type: 'credit_entry' as const, record_id: record.id, payload: record })),
  ];
}

export function fromShopRecords(rows: ShopRecordRow[]): ShopData {
  const result = emptyShopData();
  for (const row of rows) {
    switch (row.record_type) {
      case 'product': result.products.push(row.payload as unknown as Product); break;
      case 'sale': result.sales.push(row.payload as unknown as Sale); break;
      case 'employee': result.employees.push(row.payload as unknown as Employee); break;
      case 'daily_report': result.reports.push(row.payload as unknown as DailyReport); break;
      case 'expense': result.expenses.push(row.payload as unknown as Expense); break;
      case 'credit_entry': result.creditBook.push(row.payload as unknown as CreditEntry); break;
    }
  }
  result.products.sort((a, b) => a.name.localeCompare(b.name));
  result.sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  result.reports.sort((a, b) => b.date.localeCompare(a.date));
  result.expenses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  result.creditBook.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}

export async function loadShopData(client: SupabaseClient, userId: string): Promise<ShopData> {
  const { data, error } = await client
    .from('shop_records')
    .select('user_id, record_type, record_id, payload')
    .eq('user_id', userId);
  if (error) throw error;
  return fromShopRecords((data ?? []) as unknown as ShopRecordRow[]);
}

export async function saveShopData(client: SupabaseClient, shopData: ShopData): Promise<void> {
  const { error } = await client.rpc('replace_my_shop_records', { p_records: toShopRecords(shopData) });
  if (error) throw error;
}
