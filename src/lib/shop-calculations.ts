export type CalculationItem = {
  productId: string;
  productName: string;
  quantity: number;
  buyingPrice: number;
  sellingPrice: number;
};

export type CalculationSale = {
  createdAt: string;
  items: CalculationItem[];
  totalRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
};

export type CalculationExpense = { date: string; amount: number };
export type CalculationProduct = { id: string; quantity: number };
export type DailyProductTotal = {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
};
export type ClosingReportStock = {
  date: string;
  closingStock: { productId: string; productName: string; quantity: number }[];
};

export function isDateClosed(reports: { date: string }[], date: string) {
  return reports.some((report) => report.date === date);
}

export function previousReportStock(reports: ClosingReportStock[], date: string) {
  const previous = reports.filter((report) => report.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  return previous?.closingStock ?? [];
}

export function lagosDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function calculateSaleTotals(items: CalculationItem[]) {
  const totalRevenue = items.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
  const costOfGoodsSold = items.reduce((sum, item) => sum + item.quantity * item.buyingPrice, 0);
  return { totalRevenue, costOfGoodsSold, grossProfit: totalRevenue - costOfGoodsSold };
}

export function applySaleToStock<T extends CalculationProduct>(products: T[], items: CalculationItem[]) {
  const sold = new Map<string, number>();
  for (const item of items) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
  for (const [productId, quantity] of sold) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product || quantity > product.quantity) throw new Error('Sale quantity exceeds available stock.');
  }
  return products.map((product) => ({
    ...product,
    quantity: product.quantity - (sold.get(product.id) ?? 0),
  }));
}

export function calculateDailySummary<S extends CalculationSale, E extends CalculationExpense>(sales: S[], expenses: E[], date: string) {
  const daySales = sales.filter((sale) => lagosDateKey(new Date(sale.createdAt)) === date);
  const products = new Map<string, DailyProductTotal>();
  for (const sale of daySales) {
    for (const item of sale.items) {
      const total = products.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        revenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
      };
      total.quantity += item.quantity;
      total.revenue += item.quantity * item.sellingPrice;
      total.costOfGoodsSold += item.quantity * item.buyingPrice;
      total.grossProfit = total.revenue - total.costOfGoodsSold;
      products.set(item.productId, total);
    }
  }

  const totals = daySales.reduce((summary, sale) => {
    const saleTotals = calculateSaleTotals(sale.items);
    return {
      totalRevenue: summary.totalRevenue + saleTotals.totalRevenue,
      totalCostOfGoodsSold: summary.totalCostOfGoodsSold + saleTotals.costOfGoodsSold,
      totalQuantity: summary.totalQuantity + sale.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, { totalRevenue: 0, totalCostOfGoodsSold: 0, totalQuantity: 0 });
  const dayExpenses = expenses.filter((expense) => expense.date === date);
  const grossProfit = totals.totalRevenue - totals.totalCostOfGoodsSold;
  const totalExpenses = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return {
    ...totals,
    grossProfit,
    productBreakdown: [...products.values()].sort((a, b) => b.revenue - a.revenue),
    expenses: dayExpenses,
    totalExpenses,
    netProfit: grossProfit - totalExpenses,
  };
}
