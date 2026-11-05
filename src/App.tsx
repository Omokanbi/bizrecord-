import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  AlertTriangle, ArrowDownToLine, ArrowRight,
  Boxes, BriefcaseBusiness, CalendarDays, Check,
  ClipboardList, Coins, CreditCard, FileText, Home, LoaderCircle, LogOut, Menu, Package, Plus,
  Search, ShoppingBasket, ShoppingCart, Trash2, TrendingUp, Users, Wallet,
  X
} from 'lucide-react';
import { applySaleToStock, calculateDailySummary, calculateSaleTotals, isDateClosed, lagosDateKey, previousReportStock } from '@/lib/shop-calculations';
import type { Session } from '@supabase/supabase-js';
import { AuthScreen } from '@/components/auth-screen';
import {
  emptyShopData, loadShopData, saveShopData,
  type CreditEntry, type CreditRepayment, type DailyReport, type Expense,
  type Product, type ProductDailyTotal, type Sale, type SaleItem, type ShopData,
} from '@/lib/shop-records';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const todayISO = () => lagosDateKey(new Date());
const fmt = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
const formatReportDate = (date: string) => new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
type Shared = { data: ShopData; setData: (next: ShopData) => void; notify: (message: string, error?: boolean) => void; userEmail: string };
const IconLink = ({ href, icon: Icon, children, active }: { href: string; icon: typeof Home; children: string; active: boolean }) =>
  <Link href={href} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-nav-${href.slice(1) || 'dashboard'}`}><Icon size={18} strokeWidth={2.1} /><span>{children}</span></Link>;

function App() {
  const [data, setData] = useState<ShopData>(emptyShopData);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [location, setLocation] = useLocation();
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveRevision = useRef(0);

  useEffect(() => {
    // The prior prototype explicitly used this key for browser-only records.
    // The user requested its removal; account records now live in Supabase.
    window.localStorage.removeItem('my-shop-demo-v1');
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthReady(true);
      setAuthError(null);
      setAuthStatus(null);
    });
    void supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(sessionData.session);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : 'Could not check your Supabase session.');
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    saveRevision.current += 1;
    setData(emptyShopData());
    setDataLoadError(null);
    if (!session || !supabase) {
      setDataReady(true);
      setSyncStatus('saved');
      return () => { active = false; };
    }
    setDataReady(false);
    void loadShopData(supabase, session.user.id).then((shopData) => {
      if (!active) return;
      setData(shopData);
      setDataReady(true);
      setSyncStatus('saved');
    }).catch((error: unknown) => {
      if (!active) return;
      setDataLoadError(error instanceof Error ? error.message : 'Could not load your records from Supabase.');
      setDataReady(true);
    });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, error = false) => setToast({ message, error });
  const queueSave = (next: ShopData) => {
    const client = supabase;
    if (!client || !session) return;
    const revision = ++saveRevision.current;
    setSyncStatus('saving');
    const operation = saveQueue.current.catch(() => undefined).then(() => saveShopData(client, next));
    saveQueue.current = operation.catch(() => undefined);
    void operation.then(() => {
      if (revision === saveRevision.current) setSyncStatus('saved');
    }).catch((error: unknown) => {
      if (revision !== saveRevision.current) return;
      setSyncStatus('error');
      notify(error instanceof Error ? `Supabase did not save that change: ${error.message}` : 'Supabase did not save that change. Retry when you are back online.', true);
    });
  };
  const updateData = (next: ShopData) => {
    setData(next);
    queueSave(next);
  };
  const handleLogin = async (email: string, password: string) => {
    const client = supabase;
    if (!client) return;
    setAuthBusy(true); setAuthError(null); setAuthStatus(null);
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
      else setLocation('/');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not reach Supabase. Try again.');
    } finally { setAuthBusy(false); }
  };
  const handleCreateAccount = async (email: string, password: string) => {
    const client = supabase;
    if (!client) return;
    setAuthBusy(true); setAuthError(null); setAuthStatus(null);
    try {
      const { data: signupData, error } = await client.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin },
      });
      if (error) setAuthError(error.message);
      else if (signupData.session) setLocation('/');
      else setAuthStatus('Account created. Check your email to confirm it, then log in.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not reach Supabase. Try again.');
    } finally { setAuthBusy(false); }
  };
  const handleLogout = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) notify(`Could not log out: ${error.message}`, true);
      else { setData(emptyShopData()); setLocation('/'); }
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not log out.', true); }
  };
  const retrySave = () => queueSave(data);
  if (!authReady) return <AuthLoading label="Checking your account…" />;
  if (!session || !supabase) {
    return <AuthScreen
      onLogin={handleLogin}
      onCreateAccount={handleCreateAccount}
      busy={authBusy}
      errorMessage={authError}
      statusMessage={authStatus}
      configured={supabaseConfigured}
    />;
  }
  const activeClient = supabase;
  if (!dataReady) return <AuthLoading label="Loading your shop records…" />;
  if (dataLoadError) return <DataLoadError message={dataLoadError} onRetry={() => {
    setDataLoadError(null); setDataReady(false);
    void loadShopData(activeClient, session.user.id).then((shopData) => { setData(shopData); setDataReady(true); }).catch((error: unknown) => {
      setDataLoadError(error instanceof Error ? error.message : 'Could not load your records from Supabase.'); setDataReady(true);
    });
  }} onLogout={handleLogout} />;

  const shared: Shared = {
    data,
    setData: updateData,
    notify,
    userEmail: session.user.email ?? 'Owner account',
  };
  const activeTitle = ({ '/': 'Today at the shop', '/products': 'Your products', '/sales': 'Record a sale', '/history': 'Sales history', '/stock': 'Stock & restock', '/team': 'People & roles', '/daily-summary': 'Daily summary', '/credit': 'Credit book' } as Record<string, string>)[location] ?? 'My Shop';
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">B</div><div><div className="brand-name">BizRecord</div><div className="brand-caption">My Shop · clear records.</div></div></div>
        <div className="nav-label">Your counter</div>
        <nav>
          <IconLink href="/" icon={Home} active={location === '/'}>Today</IconLink>
          <IconLink href="/products" icon={Package} active={location === '/products'}>Products</IconLink>
          <IconLink href="/sales" icon={ShoppingCart} active={location === '/sales'}>Record a sale</IconLink>
          <IconLink href="/history" icon={ClipboardList} active={location === '/history'}>Sales history</IconLink>
          <IconLink href="/stock" icon={Boxes} active={location === '/stock'}>Stock & restock</IconLink>
          <IconLink href="/credit" icon={CreditCard} active={location === '/credit'}>Credit book</IconLink>
          <IconLink href="/team" icon={Users} active={location === '/team'}>People & roles</IconLink>
        </nav>
        <div className="side-foot"><div className="demo-mini"><strong>Private shop account</strong>Your shop records are connected to your signed-in Supabase account.</div></div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" data-testid="button-mobile-menu" onClick={() => document.getElementById('mobile-nav')?.scrollIntoView({ behavior: 'smooth' })}><Menu size={19} /></button><div><div className="eyebrow">My Shop / {activeTitle}</div><div className="top-date">{new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long' })}</div></div></div>
          <div className="profile-chip"><div className="avatar">{(session.user.email?.[0] ?? 'U').toUpperCase()}</div><div className="profile-email" title={session.user.email ?? 'Owner account'}>{session.user.email ?? 'Owner account'}</div><button className="logout-button" onClick={handleLogout} data-testid="button-logout"><LogOut size={15} /><span>Logout</span></button></div>
        </header>
        <main className="content">
          {syncStatus === 'saving' && <div className="sync-notice" role="status" data-testid="status-saving">Saving your changes to Supabase…</div>}
          {syncStatus === 'error' && <div className="sync-notice sync-error" role="alert" data-testid="status-save-error"><span>Your latest change may not be saved online.</span><button type="button" onClick={retrySave} data-testid="button-retry-save">Retry save</button></div>}
          <Switch>
            <Route path="/" component={() => <Dashboard {...shared} />} />
            <Route path="/products" component={() => <Products {...shared} />} />
            <Route path="/sales" component={() => <SalesPage {...shared} />} />
            <Route path="/history" component={() => <HistoryPage {...shared} />} />
            <Route path="/stock" component={() => <StockPage {...shared} />} />
            <Route path="/team" component={() => <TeamPage {...shared} />} />
            <Route path="/daily-summary" component={() => <DailySummaryPage {...shared} />} />
            <Route path="/credit" component={() => <CreditBookPage {...shared} />} />
            <Route><NotFound /></Route>
          </Switch>
        </main>
      </div>
      <nav id="mobile-nav" className="mobile-nav" aria-label="Main navigation">
        <MobileLink href="/" icon={Home} active={location === '/'}>Today</MobileLink>
        <MobileLink href="/products" icon={Package} active={location === '/products'}>Products</MobileLink>
        <MobileLink href="/sales" icon={ShoppingCart} active={location === '/sales'}>Sale</MobileLink>
        <MobileLink href="/history" icon={ClipboardList} active={location === '/history'}>History</MobileLink>
        <MobileLink href="/stock" icon={Boxes} active={location === '/stock'}>Stock</MobileLink>
        <MobileLink href="/credit" icon={CreditCard} active={location === '/credit'}>Credit</MobileLink>
        <MobileLink href="/team" icon={Users} active={location === '/team'}>Team</MobileLink>
      </nav>
      {toast && <div className={`toast-msg ${toast.error ? 'error' : ''}`} role="status" data-testid={toast.error ? 'status-error' : 'status-success'}>{toast.error ? <AlertTriangle size={16} /> : <Check size={16} />} {toast.message}</div>}
    </div>
  );
}

function MobileLink({ href, icon: Icon, active, children }: { href: string; icon: typeof Home; active: boolean; children: string }) {
  return <Link href={href} className={active ? 'active' : ''} data-testid={`mobile-nav-${href.slice(1) || 'dashboard'}`}><Icon />{children}</Link>;
}
function AuthLoading({ label }: { label: string }) {
  return <main className="auth-loading" role="status" aria-live="polite"><LoaderCircle size={24} className="auth-spinner" /><span>{label}</span></main>;
}
function DataLoadError({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <main className="auth-loading"><section className="auth-data-error" role="alert" data-testid="error-load-shop-data">
    <AlertTriangle size={24} />
    <h1>Could not load your shop</h1>
    <p>Your shop records were not loaded from Supabase. Check your connection and confirm that <strong>artifacts/my-shop/supabase/schema.sql</strong> has been run in this project.</p>
    <details><summary>Technical details</summary><pre>{message}</pre></details>
    <div><button className="auth-button auth-button-primary" type="button" onClick={onRetry} data-testid="button-retry-load">Retry</button><button className="auth-button auth-button-secondary" type="button" onClick={onLogout} data-testid="button-error-logout">Log out</button></div>
  </section></main>;
}
function PageHead({ kicker, title, subtitle, children }: { kicker: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-head"><div><div className="page-kicker">{kicker}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children}</div>;
}
function todaySales(sales: Sale[]) { const today = todayISO(); return sales.filter((sale) => saleDate(sale) === today); }
function saleDate(sale: Sale) { return lagosDateKey(new Date(sale.createdAt)); }
function dayIsClosed(data: ShopData, date = todayISO()) { return isDateClosed(data.reports, date); }
function daySummary(data: ShopData, date: string) { return calculateDailySummary(data.sales, data.expenses, date); }
function previousClosingStock(data: ShopData, date: string) {
  return previousReportStock(data.reports, date);
}
function buildDailyReport(data: ShopData, date: string, savedAt: string): DailyReport {
  const summary = daySummary(data, date);
  return {
    date, savedAt, totalRevenue: summary.totalRevenue,
    totalCostOfGoodsSold: summary.totalCostOfGoodsSold,
    grossProfit: summary.grossProfit, totalQuantity: summary.totalQuantity,
    productBreakdown: summary.productBreakdown.map((item) => ({ ...item })),
    expenses: summary.expenses.map((expense) => ({ ...expense })),
    totalExpenses: summary.totalExpenses, netProfit: summary.netProfit,
    openingStock: previousClosingStock(data, date).map((item) => ({ ...item })),
    closingStock: data.products.map((product) => ({ productId: product.id, productName: product.name, quantity: product.quantity })),
  };
}
function DailySummaryButton() {
  return <Link href="/daily-summary" className="action daily-summary-action" data-testid="button-daily-summary"><FileText size={18} /> Daily Summary</Link>;
}
function Empty({ icon: Icon = ShoppingBasket, title, message }: { icon?: typeof Home; title: string; message: string }) {
  return <div className="empty"><div className="empty-mark"><Icon size={20} /></div><strong>{title}</strong><span>{message}</span></div>;
}

function Dashboard({ data }: Shared) {
  const today = todaySales(data.sales);
  const revenue = today.reduce((s, v) => s + v.totalRevenue, 0);
  const cogs = today.reduce((s, v) => s + v.costOfGoodsSold, 0);
  const profit = today.reduce((s, v) => s + v.grossProfit, 0);
  const units = today.reduce((s, v) => s + v.items.reduce((a, i) => a + i.quantity, 0), 0);
  const stockCount = data.products.reduce((a, p) => a + p.quantity, 0);
  const low = data.products.filter((p) => p.quantity <= 7);
  return <>
    <PageHead kicker="Your shop at a glance" title="Good day." subtitle="A quick look at what came in and what needs attention." />
    <div className="metric-grid">
      <Metric icon={Wallet} label="Today's revenue" value={fmt(revenue)} note={`${today.length} sales so far`} />
      <Metric icon={ArrowDownToLine} label="Cost of goods sold" value={fmt(cogs)} note="What today's items cost you" />
      <Metric icon={TrendingUp} label="Gross profit" value={fmt(profit)} note="Before shop expenses" accent />
      <Metric icon={ShoppingBasket} label="Units sold today" value={`${units}`} note={`${stockCount} units across ${data.products.length} products`} />
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2 className="panel-title">Recent sales</h2><div className="panel-caption">What customers have picked up today</div></div><Link href="/history" className="text-link" data-testid="link-see-all-sales">See all <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div>
        <div className="sales-list">{today.length ? today.slice(0, 4).map((sale) => <SaleRow key={sale.id} sale={sale} />) : <Empty title="No sales recorded yet" message="Your first sale will show up here." />}</div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2 className="panel-title">Keep an eye on</h2><div className="panel-caption">{low.length ? `${low.length} items running low` : 'Stock is looking healthy'}</div></div><Link href="/stock" className="text-link" data-testid="link-stock-review">Review stock <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div>
        <div className="stock-alerts">{low.length ? low.slice(0, 5).map((p) => <div className="stock-line" key={p.id} data-testid={`stock-alert-${p.id}`}><span className="stock-dot" /><span className="stock-item">{p.name}</span><span className="stock-count">{p.quantity} left</span></div>) : <Empty icon={Check} title="Nothing running low" message="We'll flag items with 7 or fewer left." />}</div>
      </section>
    </div>
    <div className="summary-strip panel" style={{ marginTop: 16 }}><span className="summary-chip"><CalendarDays size={12} style={{ verticalAlign: 'middle' }} /> Today's summary</span><span className="summary-chip">Revenue<strong>{fmt(revenue)}</strong></span><span className="summary-chip">COGS<strong>{fmt(cogs)}</strong></span><span className="summary-chip">Gross profit<strong>{fmt(profit)}</strong></span><span className="summary-chip">Units<strong>{units}</strong></span></div>
  </>;
}
function Metric({ icon: Icon, label, value, note, accent }: { icon: typeof Home; label: string; value: string; note: string; accent?: boolean }) {
  return <article className="panel metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-label"><Icon size={15} color={accent ? '#d76f4f' : '#39705b'} />{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>;
}
function SaleRow({ sale }: { sale: Sale }) {
  const label = sale.items.map((item) => `${item.quantity} ${item.productName}`).join(', ');
  return <div className="sale-row" data-testid={`sale-row-${sale.id}`}><div className="sale-main"><div className="sale-title">{label}</div><div className="sale-meta">{formatTime(sale.createdAt)} · {sale.soldBy}</div></div><div><div className="sale-amount">{fmt(sale.totalRevenue)}</div><div className="sale-profit">+{fmt(sale.grossProfit)} profit</div></div></div>;
}

function Products({ data, setData, notify }: Shared) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState(''); const [buy, setBuy] = useState(''); const [sell, setSell] = useState(''); const [qty, setQty] = useState('');
  const closed = dayIsClosed(data);
  const filtered = data.products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const clear = () => { setEditing(null); setName(''); setBuy(''); setSell(''); setQty(''); };
  const edit = (p: Product) => { setEditing(p); setName(p.name); setBuy(String(p.buyingPrice)); setSell(String(p.sellingPrice)); setQty(String(p.quantity)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (closed) { notify('Today is closed. Product and stock changes can be made tomorrow.', true); return; }
    const buyingPrice = Number(buy), sellingPrice = Number(sell), quantity = Number(qty);
    if (!name.trim() || !Number.isFinite(buyingPrice) || buyingPrice <= 0 || !Number.isFinite(sellingPrice) || sellingPrice <= 0 || !Number.isInteger(quantity) || quantity < 0) { notify('Enter a product name, positive prices, and a whole-number quantity of 0 or more.', true); return; }
    if (editing) { setData({ ...data, products: data.products.map((p) => p.id === editing.id ? { ...p, name: name.trim(), buyingPrice, sellingPrice, quantity } : p) }); notify('Product details updated.'); }
    else { const product = { id: `p-${Date.now()}`, name: name.trim(), buyingPrice, sellingPrice, quantity }; setData({ ...data, products: [product, ...data.products] }); notify('Product added to your shop.'); }
    clear();
  };
  const remove = (p: Product) => {
    if (closed) { notify('Today is closed. Product and stock changes can be made tomorrow.', true); return; }
    if (!window.confirm(`Remove ${p.name} from your products? Existing sale records will stay in history.`)) return;
    setData({ ...data, products: data.products.filter((item) => item.id !== p.id) }); notify('Product removed.');
    if (editing?.id === p.id) clear();
  };
  return <>
    <PageHead kicker="Know what is on your shelf" title="Your products" subtitle={`${data.products.length} products in this shop. Prices are shown in naira.`}><Link href="/stock" className="action secondary" data-testid="button-go-stock"><Boxes size={16} /> Restock items</Link></PageHead>
    {closed && <div className="notice"><CalendarDays size={17} /><div><strong>Today’s stock is locked.</strong> The closing count is saved for today. Product and quantity changes resume tomorrow.</div></div>}
    <div className="section-grid">
      <section className="panel">
        <div className="toolbar"><div className="search"><Search size={15} style={{ position: 'absolute', left: 12, top: 15, color: '#718078' }} /><input aria-label="Search products" data-testid="input-search-products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product..." style={{ paddingLeft: 36 }} /></div><span className="subtle">{filtered.length} shown</span></div>
        {filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Buy price</th><th>Sell price</th><th>In stock</th><th>Actions</th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id} data-testid={`product-row-${p.id}`}><td><div className="product-name">{p.name}</div><div className="subtle">Per item</div></td><td>{fmt(p.buyingPrice)}</td><td>{fmt(p.sellingPrice)}</td><td><span className={`qty-pill ${p.quantity <= 7 ? 'low' : ''}`}>{p.quantity} units</span></td><td><div className="row-actions"><button className="action secondary small" data-testid={`button-edit-${p.id}`} onClick={() => edit(p)} disabled={closed}>Edit</button><button className="icon-button" aria-label={`Remove ${p.name}`} data-testid={`button-delete-${p.id}`} onClick={() => remove(p)} disabled={closed}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <Empty icon={Search} title="No products found" message="Try a different name, or add a new item." />}
      </section>
      <form className="panel form-panel" onSubmit={submit}>
        <h2>{editing ? 'Edit product' : 'Add a product'}</h2><p>{editing ? 'Update the price or shelf quantity.' : 'Add something you sell in the shop.'}</p>
        <Field label="Product name"><input data-testid="input-product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Peak milk sachet" required /></Field>
        <Field label="Buying price (₦)"><input data-testid="input-buying-price" type="number" min="1" step="1" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="What you pay" required /></Field>
        <Field label="Selling price (₦)"><input data-testid="input-selling-price" type="number" min="1" step="1" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="What customers pay" required /></Field>
        <Field label="Quantity in stock"><input data-testid="input-product-quantity" type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" required /></Field>
        <button className="action" style={{ width: '100%' }} data-testid="button-save-product" type="submit" disabled={closed}>{editing ? 'Save changes' : <><Plus size={16} /> Add product</>}</button>
        {editing && <button className="action secondary" style={{ width: '100%', marginTop: 8 }} type="button" data-testid="button-cancel-edit" onClick={clear}>Cancel editing</button>}
      </form>
    </div>
  </>;
}

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <div className="field"><label>{label}</label>{children}{help && <span className="field-help">{help}</span>}</div>;
}

type CartEntry = { productId: string; quantity: string };
function SalesPage({ data, setData, notify, userEmail }: Shared) {
  const [cart, setCart] = useState<CartEntry[]>([{ productId: data.products[0]?.id ?? '', quantity: '1' }]);
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [customerName, setCustomerName] = useState('');
  const entries = cart.map((entry) => ({ entry, product: data.products.find((p) => p.id === entry.productId) })).filter((r): r is { entry: CartEntry; product: Product } => !!r.product);
  const items = entries.map(({ entry, product }) => ({ productId: product.id, productName: product.name, quantity: Number(entry.quantity || 0), buyingPrice: product.buyingPrice, sellingPrice: product.sellingPrice }));
  const { totalRevenue: total, costOfGoodsSold: cost, grossProfit } = calculateSaleTotals(items);
  const closed = dayIsClosed(data);
  const setEntry = (index: number, key: keyof CartEntry, value: string) => setCart((old) => old.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (closed) { notify('Today is already closed. New sales can be recorded tomorrow.', true); return; }
    if (paymentType === 'credit' && !customerName.trim()) { notify('Enter the customer name for this credit sale.', true); return; }
    const requested = new Map<string, number>();
    entries.forEach(({ entry, product }) => requested.set(product.id, (requested.get(product.id) ?? 0) + Number(entry.quantity)));
    if (!entries.length || entries.some(({ entry }) => !Number.isInteger(Number(entry.quantity)) || Number(entry.quantity) <= 0) || [...requested].some(([id, amount]) => amount > (data.products.find((p) => p.id === id)?.quantity ?? 0))) { notify('Check quantities. Each must be positive, and combined quantities cannot exceed stock.', true); return; }
    const saleItems = items.map((item) => ({ ...item }));
    let updatedProducts: Product[];
    try { updatedProducts = applySaleToStock(data.products, saleItems); }
    catch { notify('The stock count changed or is too low. Check the quantities and try again.', true); return; }
    const createdAt = new Date().toISOString();
    const saleId = `s-${Date.now()}`;
    const sale: Sale = { id: saleId, createdAt, items: saleItems, totalRevenue: total, costOfGoodsSold: cost, grossProfit, soldBy: userEmail, paymentType, ...(paymentType === 'credit' ? { customerName: customerName.trim() } : {}) };
    const credit: CreditEntry | null = paymentType === 'credit' ? {
      id: `c-${Date.now()}`, saleId, customerName: customerName.trim(), createdAt,
      totalAmount: total, amountPaid: 0, soldBy: sale.soldBy, items: saleItems, repayments: [],
    } : null;
    setData({
      ...data,
      products: updatedProducts,
      sales: [sale, ...data.sales],
      creditBook: credit ? [credit, ...data.creditBook] : data.creditBook,
    });
    setCart([{ productId: data.products[0]?.id ?? '', quantity: '1' }]); setCustomerName('');
    notify(`${paymentType === 'credit' ? 'Credit sale recorded' : 'Sale recorded'}: ${fmt(total)} revenue.`);
  };
  return <>
    <PageHead kicker="Quick counter entry" title="Record a sale" subtitle="Choose what left the shelf. Stock and today's totals update automatically." />
    {closed && <div className="notice" data-testid="notice-day-closed"><CalendarDays size={17} /><div><strong>Today's report is closed.</strong> Sales are locked for this date so the saved report and closing stock stay unchanged.</div></div>}
    {data.products.length === 0 ? <div className="panel"><Empty icon={Package} title="Add products before your first sale" message="Your product list is empty. Add the items you sell, then come back here." /><div style={{ textAlign: 'center', paddingBottom: 22 }}><Link href="/products" className="action" data-testid="link-add-first-product">Add a product</Link></div></div> : <div className="section-grid">
      <form className="panel form-panel" onSubmit={submit}>
        <h2>What did the customer buy?</h2><p>Each line reduces the matching stock count.</p>
        <div className="role-switch" role="group" aria-label="Payment type" style={{ marginBottom: 15 }}>
          <button type="button" className={paymentType === 'cash' ? 'selected' : ''} data-testid="button-sale-cash" onClick={() => setPaymentType('cash')}>Paid now</button>
          <button type="button" className={paymentType === 'credit' ? 'selected' : ''} data-testid="button-sale-credit" onClick={() => setPaymentType('credit')}>Add to credit</button>
        </div>
        {paymentType === 'credit' && <Field label="Customer name"><input data-testid="input-credit-customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who will pay later?" required /></Field>}
        {cart.map((item, index) => <div className="sale-cart-line" key={`cart-${index}`} data-testid={`sale-item-line-${index}`}>
          <select data-testid={`select-sale-product-${index}`} value={item.productId} onChange={(e) => setEntry(index, 'productId', e.target.value)} aria-label="Choose product">
            {data.products.map((p) => <option value={p.id} key={p.id} disabled={p.quantity === 0}>{p.name} · {p.quantity} left · {fmt(p.sellingPrice)}</option>)}
          </select>
          <input data-testid={`input-sale-quantity-${index}`} type="number" min="1" step="1" max={data.products.find((p) => p.id === item.productId)?.quantity ?? 1} value={item.quantity} onChange={(e) => setEntry(index, 'quantity', e.target.value)} aria-label="Quantity sold" />
          <button className="icon-button" type="button" aria-label="Remove sale item" data-testid={`button-remove-sale-item-${index}`} onClick={() => setCart((old) => old.length > 1 ? old.filter((_, i) => i !== index) : old.map((r, i) => i === index ? { ...r, quantity: '1' } : r))}><X size={16} /></button>
        </div>)}
        <button type="button" className="action secondary small" data-testid="button-add-sale-item" onClick={() => { const available = data.products.find((p) => p.quantity > 0 && !cart.some((c) => c.productId === p.id)); if (!available) notify('Every in-stock product is already on this sale.', true); else setCart((old) => [...old, { productId: available.id, quantity: '1' }]); }}><Plus size={14} /> Add another item</button>
        <div className="profit-preview"><span>Gross profit on this sale</span><strong>{fmt(total - cost)}</strong></div>
        <button className="action coral" data-testid="button-submit-sale" type="submit" disabled={closed} style={{ width: '100%', minHeight: 52 }}><ShoppingCart size={17} /> {closed ? 'Day already closed' : `${paymentType === 'credit' ? 'Record credit sale' : 'Record sale'} · ${fmt(total)}`}</button>
      </form>
      <aside className="panel form-panel"><h2>Sale at a glance</h2><p>These totals update as you add products.</p><div className="metric-label"><Coins size={15} /> {paymentType === 'credit' ? 'Credit amount' : 'Customer pays'}</div><div className="metric-value" style={{ marginBottom: 24 }}>{fmt(total)}</div><div className="metric-label"><ArrowDownToLine size={15} /> Cost of items</div><div style={{ font: '700 20px var(--app-font-serif)', margin: '8px 0 20px' }}>{fmt(cost)}</div><div className="metric-label"><TrendingUp size={15} /> Gross profit</div><div style={{ font: '800 25px var(--app-font-serif)', color: '#39724f', marginTop: 8 }}>{fmt(total - cost)}</div><div className="notice" style={{ marginTop: 21, marginBottom: 0 }}>{paymentType === 'credit' ? 'The customer balance will appear in Credit Book. Credit sales still reduce stock and count in sales revenue.' : 'Record cash sales here. Choose “Add to credit” when payment is due later.'}</div></aside>
    </div>}
    <div className="daily-summary-cta"><DailySummaryButton /></div>
  </>;
}

function HistoryPage({ data }: Shared) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const sales = useMemo(() => [...data.sales].filter((s) => filter === 'all' || saleDate(s) === todayISO()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.sales, filter]);
  const total = sales.reduce((n, s) => n + s.totalRevenue, 0);
  const reports = [...data.reports].sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <PageHead kicker="Every counter entry" title="Sales history" subtitle="Look back at what sold, daily reports and what each sale earned." />
    <section className="panel report-history-panel">
       <div className="panel-heading"><div><h2 className="panel-title">Saved daily reports</h2><div className="panel-caption">Reports are stored in your Supabase account and cannot be saved twice for one date.</div></div></div>
      {reports.length ? <div className="report-list">{reports.map((report) => <article className="report-history-item" key={report.date} data-testid={`daily-report-${report.date}`}>
        <div className="report-history-top"><div><strong>{formatReportDate(report.date)}</strong><div className="subtle">Closed {formatTime(report.savedAt)}</div></div><button className="action secondary small" type="button" data-testid={`button-view-report-${report.date}`} onClick={() => setSelectedReport(selectedReport === report.date ? null : report.date)}>{selectedReport === report.date ? 'Hide report' : 'View report'}</button></div>
        <div className="report-history-metrics"><span>Revenue <strong>{fmt(report.totalRevenue)}</strong></span><span>Gross profit <strong>{fmt(report.grossProfit)}</strong></span><span>Net profit <strong>{fmt(report.netProfit)}</strong></span></div>
        {selectedReport === report.date && <ReportDetails report={report} />}
      </article>)}</div> : <Empty icon={FileText} title="No saved day reports yet" message="Preview today's figures and close the day to keep a report here." />}
      <div className="report-history-action"><DailySummaryButton /></div>
    </section>
    <section className="panel">
      <div className="summary-strip"><span className="summary-chip">{filter === 'today' ? "Today's" : 'All'} transactions<strong>{sales.length}</strong></span><span className="summary-chip">Revenue<strong>{fmt(total)}</strong></span><span className="summary-chip">Gross profit<strong>{fmt(sales.reduce((n, s) => n + s.grossProfit, 0))}</strong></span><div style={{ marginLeft: 'auto' }}><select aria-label="Filter sales" data-testid="select-history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ border: '1px solid #ddd7c9', background: '#fffdf8', padding: '7px 9px', borderRadius: 8, fontSize: 11 }}><option value="all">All dates</option><option value="today">Today only</option></select></div></div>
      {sales.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date & time</th><th>Items</th><th>Revenue</th><th>Cost</th><th>Gross profit</th><th></th></tr></thead><tbody>{sales.map((sale) => <FragmentSale key={sale.id} sale={sale} expanded={selected === sale.id} onToggle={() => setSelected(selected === sale.id ? null : sale.id)} />)}</tbody></table></div> : <Empty icon={ClipboardList} title="No sales for this date" message="When you record a sale, its details will appear here." />}
    </section>
    <div className="daily-summary-cta"><DailySummaryButton /></div>
  </>;
}
function FragmentSale({ sale, expanded, onToggle }: { sale: Sale; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr data-testid={`history-sale-${sale.id}`}><td><strong>{formatDate(sale.createdAt)}</strong><div className="subtle">{formatTime(sale.createdAt)} · {sale.soldBy}</div></td><td>{sale.items.reduce((n, i) => n + i.quantity, 0)} units<div className="subtle">{sale.items.length} product{sale.items.length === 1 ? '' : 's'}{sale.paymentType === 'credit' ? ` · Credit: ${sale.customerName ?? 'Customer'}` : ''}</div></td><td>{fmt(sale.totalRevenue)}</td><td>{fmt(sale.costOfGoodsSold)}</td><td><strong style={{ color: '#39724f' }}>{fmt(sale.totalRevenue - sale.costOfGoodsSold)}</strong></td><td><button className="action secondary small" data-testid={`button-sale-details-${sale.id}`} onClick={onToggle}>{expanded ? 'Hide' : 'Details'}</button></td></tr>
    {expanded && <tr><td colSpan={6} style={{ background: '#f7f4eb' }}><div style={{ fontWeight: 800, fontSize: 11, marginBottom: 8 }}>Sale items</div>{sale.items.map((item, i) => <div key={`${sale.id}-${i}`} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', padding: '7px 0', fontSize: 11, borderTop: '1px solid #e5dfd1' }}><span>{item.quantity} × {item.productName}</span><span>{fmt(item.quantity * item.sellingPrice)}</span></div>)}</td></tr>}
  </>;
}

function ReportDetails({ report }: { report: DailyReport }) {
  return <div className="report-details" data-testid={`report-details-${report.date}`}>
    <div className="report-detail-grid">
      <span>Sales revenue<strong>{fmt(report.totalRevenue)}</strong></span>
      <span>Products sold cost<strong>{fmt(report.totalCostOfGoodsSold)}</strong></span>
      <span>Gross profit<strong>{fmt(report.grossProfit)}</strong></span>
      <span>Units sold<strong>{report.totalQuantity}</strong></span>
      <span>Expenses<strong>{fmt(report.totalExpenses)}</strong></span>
      <span>Net profit<strong>{fmt(report.netProfit)}</strong></span>
    </div>
    <h3>Sales by product</h3>
    {report.productBreakdown.length ? <ProductBreakdown products={report.productBreakdown} tableTestId={`report-product-table-${report.date}`} /> : <p className="subtle">No products were sold on this date.</p>}
    <h3>Expenses</h3>
    {report.expenses.length ? <div className="expense-list">{report.expenses.map((expense) => <div className="expense-row" key={expense.id}><span>{expense.description}</span><strong>{fmt(expense.amount)}</strong></div>)}</div> : <p className="subtle">No expenses were entered for this date.</p>}
    <h3>Stock carried forward</h3>
    {report.openingStock.length ? <p className="subtle">Opening stock came from the previous saved report's closing count.</p> : <p className="subtle">This is the first saved report; no earlier closing stock is recorded.</p>}
    <div className="stock-snapshot-grid">
      <div><strong>Opening stock</strong>{report.openingStock.length ? report.openingStock.map((item) => <div key={item.productId}>{item.productName}<span>{item.quantity}</span></div>) : <small>No previous report</small>}</div>
      <div><strong>Closing stock</strong>{report.closingStock.length ? report.closingStock.map((item) => <div key={item.productId}>{item.productName}<span>{item.quantity}</span></div>) : <small>No products recorded</small>}</div>
    </div>
    <p className="report-saved-at">Report date: {formatReportDate(report.date)} · Saved {formatTime(report.savedAt)}</p>
  </div>;
}

function ProductBreakdown({ products, tableTestId }: { products: ProductDailyTotal[]; tableTestId: string }) {
  return <>
    <div className="table-wrap desktop-product-breakdown"><table className="data-table report-table" data-testid={tableTestId}><thead><tr><th>Product</th><th>Quantity</th><th>Revenue</th><th>Product cost</th><th>Gross profit</th></tr></thead><tbody>{products.map((product) => <tr key={product.productId} data-testid={`daily-product-${product.productId}`}><td>{product.productName}</td><td>{product.quantity}</td><td>{fmt(product.revenue)}</td><td>{fmt(product.costOfGoodsSold)}</td><td>{fmt(product.grossProfit)}</td></tr>)}</tbody></table></div>
    <div className="mobile-product-breakdown" data-testid="mobile-product-breakdown">{products.map((product) => <article className="product-breakdown-card" key={product.productId} data-testid={`product-breakdown-card-${product.productId}`}>
      <div className="product-breakdown-heading"><strong>{product.productName}</strong><span>{product.quantity} sold</span></div>
      <div className="product-breakdown-values"><div>Revenue<strong>{fmt(product.revenue)}</strong></div><div>Product cost<strong>{fmt(product.costOfGoodsSold)}</strong></div><div>Gross profit<strong>{fmt(product.grossProfit)}</strong></div></div>
    </article>)}</div>
  </>;
}

function DailySummaryPage({ data, setData, notify }: Shared) {
  const date = todayISO();
  const summary = useMemo(() => daySummary(data, date), [data, date]);
  const saved = data.reports.find((report) => report.date === date);
  const shownReport = saved ?? buildDailyReport(data, date, new Date().toISOString());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const closingRef = useRef(false);

  const addExpense = (event: FormEvent) => {
    event.preventDefault();
    if (dayIsClosed(data, todayISO())) { notify('This day is already closed. Expenses can no longer be added.', true); return; }
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) { notify('Enter an expense description and a positive amount.', true); return; }
    const expense: Expense = { id: `x-${Date.now()}`, date, description: description.trim(), amount: value, createdAt: new Date().toISOString() };
    setData({ ...data, expenses: [expense, ...data.expenses] });
    setDescription(''); setAmount(''); notify('Expense added to today’s summary.');
  };

  const closeDay = () => {
    if (closingRef.current) return;
    const reportDate = todayISO();
    if (dayIsClosed(data, reportDate)) { closingRef.current = true; setConfirmClose(false); notify('A report is already saved for this date.', true); return; }
    closingRef.current = true;
    const report = buildDailyReport(data, reportDate, new Date().toISOString());
    setData({ ...data, reports: [report, ...data.reports] });
    setConfirmClose(false); notify('Day closed. The report is saved in Sales History.');
  };

  return <>
    <PageHead kicker="Today’s figures, as they change" title="Daily Summary" subtitle="This preview updates whenever a sale or expense is recorded." />
    <section className="summary-date-bar panel" data-testid="daily-report-date"><CalendarDays size={18} /><div><span>Report date</span><strong>{formatReportDate(date)}</strong></div><span className={`report-state ${saved ? 'closed' : ''}`}>{saved ? 'Day closed' : 'Live preview'}</span></section>
    {saved && <div className="notice" data-testid="notice-report-closed"><Check size={17} /><div><strong>This date has already been closed.</strong> The saved figures and stock counts are fixed. You can view this report in Sales History.</div></div>}
    <div className="metric-grid report-metric-grid">
      <Metric icon={Wallet} label="Sales revenue" value={fmt(saved?.totalRevenue ?? summary.totalRevenue)} note="All cash and credit sales" />
      <Metric icon={ArrowDownToLine} label="Products sold cost" value={fmt(saved?.totalCostOfGoodsSold ?? summary.totalCostOfGoodsSold)} note="Cost of goods sold" />
      <Metric icon={TrendingUp} label="Gross profit" value={fmt(saved?.grossProfit ?? summary.grossProfit)} note="Revenue minus product costs" accent />
      <Metric icon={ShoppingBasket} label="Products sold" value={`${saved?.totalQuantity ?? summary.totalQuantity}`} note="Total units today" />
    </div>
    <div className="summary-profit-row">
      <div className="summary-net panel" data-testid="daily-net-profit"><div><div className="metric-label">Net profit after expenses</div><p>Gross profit minus expenses entered for this date</p></div><strong>{fmt(saved?.netProfit ?? summary.netProfit)}</strong></div>
      <section className="panel expense-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Record an expense</h2><div className="panel-caption">{fmt(saved?.totalExpenses ?? summary.totalExpenses)} entered today</div></div></div>
        <form className="expense-form" onSubmit={addExpense}>
          <Field label="What was the expense?"><input data-testid="input-expense-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Transport or electricity" required disabled={!!saved} /></Field>
          <Field label="Amount (₦)"><input data-testid="input-expense-amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 1500" required disabled={!!saved} /></Field>
          <button className="action secondary" type="submit" data-testid="button-add-expense" disabled={!!saved}>Add expense</button>
        </form>
        {(saved?.expenses ?? summary.expenses).length > 0 ? <div className="expense-list summary-expense-list">{(saved?.expenses ?? summary.expenses).map((expense) => <div className="expense-row" key={expense.id}><span>{expense.description}</span><strong>{fmt(expense.amount)}</strong></div>)}</div> : <p className="expense-empty">No expenses entered for this date.</p>}
      </section>
    </div>
    <section className="panel report-breakdown-panel">
      <div className="panel-heading"><div><h2 className="panel-title">Sales by product</h2><div className="panel-caption">Product totals are based on the same item quantities and prices as each sale.</div></div></div>
      {shownReport.productBreakdown.length ? <ProductBreakdown products={shownReport.productBreakdown} tableTestId="table-daily-product-breakdown" /> : <Empty icon={ShoppingBasket} title="No sales yet today" message="Your product totals will appear here as soon as you record a sale." />}
    </section>
    <section className="panel carry-forward-panel">
      <div className="panel-heading"><div><h2 className="panel-title">Stock carried forward</h2><div className="panel-caption">The closing count becomes opening stock for the next report.</div></div></div>
      <div className="stock-snapshot-grid">
        <div><strong>Previous saved close</strong>{shownReport.openingStock.length ? shownReport.openingStock.map((item) => <div key={item.productId}>{item.productName}<span>{item.quantity}</span></div>) : <small>No earlier saved report. The first close starts the stock trail.</small>}</div>
        <div><strong>Today’s closing stock preview</strong>{shownReport.closingStock.length ? shownReport.closingStock.map((item) => <div key={item.productId}>{item.productName}<span>{item.quantity}</span></div>) : <small>No products in stock yet.</small>}</div>
      </div>
    </section>
    <div className="close-day-action">
      {saved ? <Link className="action secondary large-action" href="/history" data-testid="link-view-saved-report"><FileText size={18} /> View saved report in Sales History</Link> : <button className="action large-action" type="button" data-testid="button-close-day" onClick={() => setConfirmClose(true)}><Check size={19} /> Close Day and Save Report</button>}
      <span>{saved ? 'This date can only have one saved report.' : 'You’ll review the final figures and confirm before saving.'}</span>
    </div>
    {confirmClose && <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setConfirmClose(false); }}>
      <section className="confirm-dialog panel" role="dialog" aria-modal="true" aria-labelledby="confirm-close-title" data-testid="dialog-close-day">
        <div className="dialog-heading"><div><div className="page-kicker">Final check</div><h2 id="confirm-close-title">Close this day?</h2><p>Review the final summary below. This report will be saved once for {formatReportDate(date)}.</p></div><button className="icon-button" type="button" aria-label="Cancel closing" data-testid="button-dismiss-close-dialog" onClick={() => setConfirmClose(false)}><X size={19} /></button></div>
        <ReportDetails report={buildDailyReport(data, date, new Date().toISOString())} />
        <div className="dialog-actions"><button className="action secondary large-action" type="button" data-testid="button-cancel-close-day" onClick={() => setConfirmClose(false)}>Keep the day open</button><button className="action large-action" type="button" data-testid="button-confirm-close-day" onClick={closeDay}><Check size={17} /> Confirm and save report</button></div>
      </section>
    </div>}
  </>;
}

function CreditBookPage({ data, setData, notify }: Shared) {
  const [payments, setPayments] = useState<Record<string, string>>({});
  const credits = [...data.creditBook].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const balanceDue = credits.reduce((sum, credit) => sum + Math.max(0, credit.totalAmount - credit.amountPaid), 0);
  const collectPayment = (event: FormEvent, credit: CreditEntry) => {
    event.preventDefault();
    const amount = Number(payments[credit.id]);
    const due = credit.totalAmount - credit.amountPaid;
    if (!Number.isFinite(amount) || amount <= 0 || amount > due) { notify(`Enter a payment from ₦1 to ${fmt(due)}.`, true); return; }
    const repayment: CreditRepayment = { id: `r-${Date.now()}`, amount, createdAt: new Date().toISOString() };
    setData({ ...data, creditBook: data.creditBook.map((item) => item.id === credit.id ? { ...item, amountPaid: item.amountPaid + amount, repayments: [...item.repayments, repayment] } : item) });
    setPayments((old) => ({ ...old, [credit.id]: '' }));
    notify(`Payment of ${fmt(amount)} recorded for ${credit.customerName}.`);
  };
  return <>
    <PageHead kicker="Payments due later" title="Credit Book" subtitle="Track customer balances from credit sales recorded at the counter." />
    <div className="notice" data-testid="notice-credit-security"><CreditCard size={17} /><div><strong>Private account records.</strong> Credit balances and repayments are saved with your shop data in Supabase and protected by row-level security.</div></div>
    <div className="credit-summary-row">
      <article className="panel credit-total"><span>Total still owed</span><strong>{fmt(balanceDue)}</strong></article>
      <article className="panel credit-total"><span>Credit transactions</span><strong>{credits.length}</strong></article>
      <article className="panel credit-total"><span>Not yet paid</span><strong>{credits.filter((credit) => credit.totalAmount > credit.amountPaid).length}</strong></article>
    </div>
    <section className="panel credit-list-panel">
      <div className="panel-heading"><div><h2 className="panel-title">Customer credit records</h2><div className="panel-caption">Credit sales reduce stock and appear in Sales History and daily revenue.</div></div></div>
      {credits.length ? <div className="credit-list">{credits.map((credit) => {
        const due = Math.max(0, credit.totalAmount - credit.amountPaid);
        const paid = due === 0;
        return <article className="credit-card" key={credit.id} data-testid={`credit-record-${credit.id}`}>
          <div className="credit-card-head"><div><h3>{credit.customerName}</h3><span>{formatDate(credit.createdAt)} · {formatTime(credit.createdAt)} · {credit.soldBy}</span></div><span className={`credit-status ${paid ? 'paid' : ''}`}>{paid ? 'Paid' : 'Balance due'}</span></div>
          <div className="credit-items">{credit.items.map((item, index) => <span key={`${credit.id}-${index}`}>{item.quantity} × {item.productName}</span>)}</div>
          <div className="credit-amounts"><div>Total credit<strong>{fmt(credit.totalAmount)}</strong></div><div>Paid so far<strong>{fmt(credit.amountPaid)}</strong></div><div>Still owed<strong className={!paid ? 'due-value' : ''}>{fmt(due)}</strong></div></div>
          {credit.repayments.length > 0 && <div className="repayment-list"><strong>Payments received</strong>{credit.repayments.map((repayment) => <div key={repayment.id}><span>{formatDate(repayment.createdAt)} · {formatTime(repayment.createdAt)}</span><strong>{fmt(repayment.amount)}</strong></div>)}</div>}
          {!paid && <form className="payment-form" onSubmit={(event) => collectPayment(event, credit)}><Field label="Record a payment (₦)"><input type="number" min="1" max={due} step="1" value={payments[credit.id] ?? ''} onChange={(event) => setPayments((old) => ({ ...old, [credit.id]: event.target.value }))} placeholder={`Up to ${fmt(due)}`} data-testid={`input-credit-payment-${credit.id}`} required /></Field><button className="action secondary" type="submit" data-testid={`button-credit-payment-${credit.id}`}>Record payment</button></form>}
        </article>;
      })}</div> : <Empty icon={CreditCard} title="No credit sales recorded" message="On the sale screen, choose “Add to credit” to start a customer record." />}
    </section>
  </>;
}

function StockPage({ data, setData, notify }: Shared) {
  const [productId, setProductId] = useState(data.products[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [name, setName] = useState(''); const [buy, setBuy] = useState(''); const [sell, setSell] = useState(''); const [initialQty, setInitialQty] = useState('');
  const closed = dayIsClosed(data);
  const replenish = (e: FormEvent) => {
    e.preventDefault(); if (closed) { notify('Today is closed. Stock changes can be made tomorrow.', true); return; }
    const amount = Number(quantity), product = data.products.find((p) => p.id === productId);
    if (!product || !Number.isInteger(amount) || amount <= 0) { notify('Choose an item and enter a positive whole-number quantity.', true); return; }
    setData({ ...data, products: data.products.map((p) => p.id === productId ? { ...p, quantity: p.quantity + amount } : p) }); setQuantity(''); notify(`${amount} added to ${product.name}.`);
  };
  const addNew = (e: FormEvent) => {
    e.preventDefault(); if (closed) { notify('Today is closed. Stock changes can be made tomorrow.', true); return; }
    const buyingPrice = Number(buy), sellingPrice = Number(sell), quantityValue = Number(initialQty);
    if (!name.trim() || buyingPrice <= 0 || sellingPrice <= 0 || !Number.isInteger(quantityValue) || quantityValue < 0) { notify('Enter a name, positive prices, and a whole-number opening quantity.', true); return; }
    const product: Product = { id: `p-${Date.now()}`, name: name.trim(), buyingPrice, sellingPrice, quantity: quantityValue };
    setData({ ...data, products: [product, ...data.products] }); setName(''); setBuy(''); setSell(''); setInitialQty(''); notify(`${product.name} added to your stock.`);
  };
  const low = data.products.filter((p) => p.quantity <= 7).length;
  return <>
    <PageHead kicker="Keep the shelf count honest" title="Stock & restock" subtitle="Replenish items you already sell, or set up a new product." />
    {closed && <div className="notice"><CalendarDays size={17} /><div><strong>Today’s stock is locked.</strong> Restocking resumes tomorrow so the saved closing count stays accurate.</div></div>}
    <div className="summary-strip panel" style={{ marginBottom: 17 }}><span className="summary-chip">Products<strong>{data.products.length}</strong></span><span className="summary-chip">Units on shelf<strong>{data.products.reduce((n, p) => n + p.quantity, 0)}</strong></span><span className="summary-chip">Low stock<strong>{low}</strong></span></div>
    <div className="section-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2 className="panel-title">What's on the shelf</h2><div className="panel-caption">Items with 7 or fewer left need a look.</div></div></div>
        {data.products.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Current stock</th><th>Selling price</th></tr></thead><tbody>{[...data.products].sort((a,b) => a.quantity - b.quantity).map((p) => <tr key={p.id} data-testid={`stock-product-${p.id}`}><td><span className="product-name">{p.name}</span></td><td><span className={`qty-pill ${p.quantity <= 7 ? 'low' : ''}`}>{p.quantity} units</span>{p.quantity <= 7 && <div className="subtle">Running low</div>}</td><td>{fmt(p.sellingPrice)}</td></tr>)}</tbody></table></div> : <Empty icon={Boxes} title="Your shelves are clear" message="Add a product to begin tracking stock." />}
      </section>
      <div>
        <form className="panel form-panel" onSubmit={replenish}><h2>Replenish stock</h2><p>Record stock that has just arrived.</p>
          {data.products.length ? <><Field label="Choose product"><select data-testid="select-replenish-product" value={productId} onChange={(e) => setProductId(e.target.value)}>{data.products.map((p) => <option value={p.id} key={p.id}>{p.name} · {p.quantity} left</option>)}</select></Field><Field label="Quantity received"><input data-testid="input-replenish-quantity" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 12" required /></Field><button className="action" data-testid="button-replenish-stock" type="submit" style={{ width: '100%' }} disabled={closed}><Plus size={16} /> Add to stock</button></> : <Empty icon={Package} title="Nothing to replenish" message="Add your first product below." />}
        </form>
        <form className="panel form-panel" style={{ marginTop: 15 }} onSubmit={addNew}><h2>Add a new item</h2><p>Start tracking a product you have not listed yet.</p>
          <Field label="Product name"><input data-testid="input-stock-new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Peak milk sachet" required /></Field>
          <Field label="Buying price (₦)"><input data-testid="input-stock-new-buy" type="number" min="1" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="What you pay" required /></Field>
          <Field label="Selling price (₦)"><input data-testid="input-stock-new-sell" type="number" min="1" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="What customers pay" required /></Field>
          <Field label="Opening quantity"><input data-testid="input-stock-new-quantity" type="number" min="0" step="1" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="0" required /></Field>
          <button className="action secondary" type="submit" data-testid="button-add-stock-product" style={{ width: '100%' }} disabled={closed}><Plus size={15} /> Add product</button>
        </form>
      </div>
    </div>
  </>;
}

function TeamPage({ data, userEmail }: Shared) {
  return <>
    <PageHead kicker="Account and access" title="People & roles" subtitle="Review the account currently connected to this private shop." />
    <div className="notice" data-testid="notice-account-isolation"><Users size={17} /><div><strong>Your records belong to this sign-in.</strong> Supabase row-level security scopes each shop record to its authenticated user ID.</div></div>
    <section className="panel form-panel account-panel">
      <h2>Signed-in account</h2>
      <p>This email is the owner account for the shop data you are viewing.</p>
      <div className="account-email" data-testid="text-account-email">{userEmail}</div>
      <div className="account-security-note"><strong>{data.employees.length} employee records</strong><span>Employee invitations, shared business access, and employee activity tracking are not connected yet. A separate login sees its own records until business membership is added.</span></div>
    </section>
  </>;
}
function NotFound() {
  return <div className="panel" style={{ padding: 35, textAlign: 'center' }}><div className="empty-mark"><BriefcaseBusiness size={20} /></div><h1 className="page-title">This page isn't on the shelf.</h1><p className="page-subtitle">Choose a shop area from the navigation to get back on track.</p><Link className="action" href="/" data-testid="link-back-today" style={{ marginTop: 16 }}>Back to today</Link></div>;
}

export default App;
