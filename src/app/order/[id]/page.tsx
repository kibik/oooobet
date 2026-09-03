"use client";

import { useEffect, useState, useCallback, useRef, useMemo, use } from "react";
import { useAuth } from "@/components/AuthProvider";
import TelegramLogin from "@/components/TelegramLogin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getDailyQuote } from "@/lib/quotes";
import { initial } from "@/lib/utils";
import ParticipantStatus, {
  type ParticipantState,
} from "@/components/ParticipantStatus";

// Format number with thin space thousands separator and before ₽
function fmtPrice(n: number): string {
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  return `${formatted}\u2009₽`;
}

// Yandex Eda CDN resizes on the fly — swap the 200x200 thumbnail for a big one
function bigImageUrl(url: string): string {
  return url.replace("-200x200.", "-500x500.");
}

// --- Types ---

interface OrderItem {
  id: string;
  dishName: string;
  price: number;
  options: string | null;
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl?: string | null;
    avatarUrl?: string | null;
  };
}

interface OrderSession {
  id: string;
  url: string;
  placeName?: string | null;
  placeAddress?: string | null;
  deadlineAt?: string | null;
  status: string;
  deliveryFee: number;
  serviceFee: number;
  adminId: string;
  admin: {
    id: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl?: string | null;
    avatarUrl?: string | null;
    phoneNumber: string | null;
  };
  items: OrderItem[];
  discountPercent: number;
  payments?: Array<{ userId: string }>;
  participants?: Array<{ userId: string }>;
  createdAt: string;
}

interface OptionChoice {
  name: string;
  price: number;
}

interface OptionGroup {
  name: string;
  required: boolean;
  minSelected: number;
  maxSelected: number;
  options: OptionChoice[];
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  weight: string | null;
  imageUrl: string | null;
  optionGroups?: OptionGroup[] | null;
}

interface MenuData {
  categories: Record<string, MenuItem[]>;
  total: number;
}

// --- Component ---

export default function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading: authLoading, refresh } = useAuth();

  // Order state
  const [session, setSession] = useState<OrderSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Menu state
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [menuSearch, setMenuSearch] = useState("");

  // Manual input state
  const [showManualForm, setShowManualForm] = useState(false);
  const [dishName, setDishName] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);

  // Admin finalize state
  const [deliveryFee, setDeliveryFee] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Hover preview (desktop only)
  const [hoverPreview, setHoverPreview] = useState<{
    item: MenuItem;
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // "Выбор сделан" state
  const [markingReady, setMarkingReady] = useState(false);

  // Re-render once a second so the deadline countdown ticks
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Options dialog (dish with options: spiciness, sauce, drink, ...)
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);
  const [optionSelections, setOptionSelections] = useState<
    Record<number, number[]>
  >({});

  // Fly-to-cart animation
  const [flyingItem, setFlyingItem] = useState<{
    menuItem: MenuItem;
    imageUrl: string | null;
    fromRect: DOMRect;
    toRect: DOMRect;
  } | null>(null);
  const [flyPhase, setFlyPhase] = useState<"from" | "to">("from");
  const orderCardRef = useRef<HTMLDivElement>(null);
  const flyProcessedRef = useRef(false);

  useEffect(() => {
    if (!flyingItem) return;
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFlyPhase("to"));
    });
    return () => cancelAnimationFrame(t);
  }, [flyingItem]);

  // --- Data fetching ---

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
      }
    } catch {
      toast.error("Ошибка загрузки заказа");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}/menu`);
      const data: MenuData = await res.json();
      setMenu(data);
      // Set first category as active
      const cats = Object.keys(data.categories || {});
      if (cats.length > 0 && !activeCategory) {
        setActiveCategory(cats[0]);
      }
    } catch {
      // Menu not available — that's fine
    } finally {
      setMenuLoading(false);
    }
  }, [id, activeCategory]);

  useEffect(() => {
    fetchOrder();
    fetchMenu();
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [fetchOrder, fetchMenu]);

  // --- Handlers ---

  const hasOptions = (menuItem: MenuItem) =>
    Array.isArray(menuItem.optionGroups) && menuItem.optionGroups.length > 0;

  const openOptionsDialog = (menuItem: MenuItem) => {
    setOptionSelections({});
    setOptionsItem(menuItem);
  };

  const handleWantThis = (menuItem: MenuItem, e: React.MouseEvent) => {
    if (hasOptions(menuItem)) {
      openOptionsDialog(menuItem);
      return;
    }
    flyProcessedRef.current = false;
    const row = (e.target as HTMLElement).closest("[data-menu-row]");
    const img = row?.querySelector("img");
    const fromEl = img || row;
    const toEl = orderCardRef.current;
    if (!fromEl || !toEl) {
      handleAddFromMenu(menuItem);
      return;
    }
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    setFlyingItem({
      menuItem,
      imageUrl: menuItem.imageUrl,
      fromRect,
      toRect,
    });
  };

  const handleAddFromMenu = async (
    menuItem: MenuItem,
    extra?: { price: number; options: string }
  ) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishName: menuItem.name,
          price: extra?.price ?? menuItem.price,
          options: extra?.options || undefined,
        }),
      });
      if (res.ok) {
        toast.success(`${menuItem.name} добавлено`);
        fetchOrder();
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка добавления");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  };

  const handleFlyEnd = () => {
    if (flyProcessedRef.current || !flyingItem) return;
    flyProcessedRef.current = true;
    handleAddFromMenu(flyingItem.menuItem);
    setFlyingItem(null);
    setFlyPhase("from");
  };

  // --- Options dialog logic ---

  const toggleOption = (groupIdx: number, optIdx: number) => {
    if (!optionsItem?.optionGroups) return;
    const group = optionsItem.optionGroups[groupIdx];
    setOptionSelections((prev) => {
      const current = prev[groupIdx] || [];
      let next: number[];
      if (group.maxSelected === 1) {
        // radio behavior
        next = current.includes(optIdx) && !group.required ? [] : [optIdx];
      } else if (current.includes(optIdx)) {
        next = current.filter((i) => i !== optIdx);
      } else if (current.length >= group.maxSelected) {
        return prev; // limit reached
      } else {
        next = [...current, optIdx];
      }
      return { ...prev, [groupIdx]: next };
    });
  };

  const optionsExtraPrice = (() => {
    if (!optionsItem?.optionGroups) return 0;
    return optionsItem.optionGroups.reduce((sum, group, gi) => {
      const selected = optionSelections[gi] || [];
      return (
        sum + selected.reduce((s, oi) => s + (group.options[oi]?.price || 0), 0)
      );
    }, 0);
  })();

  const optionsValid = (() => {
    if (!optionsItem?.optionGroups) return true;
    return optionsItem.optionGroups.every((group, gi) => {
      const count = (optionSelections[gi] || []).length;
      const min = group.required ? Math.max(1, group.minSelected) : group.minSelected;
      return count >= min;
    });
  })();

  const handleConfirmOptions = () => {
    if (!optionsItem?.optionGroups || !optionsValid) return;
    const parts: string[] = [];
    optionsItem.optionGroups.forEach((group, gi) => {
      const selected = optionSelections[gi] || [];
      if (selected.length === 0) return;
      const names = selected.map((oi) => group.options[oi].name).join(", ");
      parts.push(`${group.name}: ${names}`);
    });
    handleAddFromMenu(optionsItem, {
      price: optionsItem.price + optionsExtraPrice,
      options: parts.join(" · "),
    });
    setOptionsItem(null);
  };

  // --- Hover preview logic (desktop pointers only) ---

  const handleMenuRowEnter = (menuItem: MenuItem, e: React.MouseEvent) => {
    if (!menuItem.imageUrl && !menuItem.description) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const gap = 12;
    const margin = 8;

    // Prefer a side panel; shrink it a bit on narrower windows
    for (const width of [320, 250]) {
      let left: number | null = null;
      if (rect.right + gap + width <= window.innerWidth - margin) {
        left = rect.right + gap;
      } else if (rect.left - gap - width >= margin) {
        left = rect.left - gap - width;
      }
      if (left !== null) {
        const top = Math.max(
          margin,
          Math.min(rect.top, window.innerHeight - (width + 140))
        );
        setHoverPreview({ item: menuItem, top, left, width });
        return;
      }
    }

    // No side room — show the panel below the row (or above near the bottom)
    const width = Math.min(300, window.innerWidth - margin * 2);
    const panelH = width + 130; // square image + text block
    const left = Math.max(
      margin,
      Math.min(
        rect.left + rect.width / 2 - width / 2,
        window.innerWidth - width - margin
      )
    );
    const top =
      rect.bottom + gap + panelH <= window.innerHeight - margin
        ? rect.bottom + gap
        : Math.max(margin, rect.top - gap - panelH);
    setHoverPreview({ item: menuItem, top, left, width });
  };

  const handleMenuRowLeave = () => setHoverPreview(null);

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishName.trim() || !price) return;

    setAdding(true);
    try {
      const res = await fetch(`/api/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishName: dishName.trim(),
          price: Number(price),
        }),
      });
      if (res.ok) {
        setDishName("");
        setPrice("");
        toast.success("Блюдо добавлено");
        fetchOrder();
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка добавления");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setAdding(false);
    }
  };

  const [markingPaid, setMarkingPaid] = useState(false);
  const [copied, setCopied] = useState<"phone" | "amount" | null>(null);

  const copyToClipboard = async (value: string, what: "phone" | "amount") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Не получилось скопировать — выдели и скопируй вручную");
    }
  };

  const handleMarkPaid = async () => {
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/orders/${id}/paid`, { method: "POST" });
      if (res.ok) {
        toast.success("Отметил перевод. Напоминания больше не придут");
        fetchOrder();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Не получилось");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleToggleReady = async () => {
    if (!user) return;
    setMarkingReady(true);
    try {
      const res = await fetch(`/api/orders/${id}/ready`, {
        method: iAmReady ? "DELETE" : "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          iAmReady ? "Продолжай выбирать" : "Готово! Ждём остальных 🍽"
        );
        fetchOrder();
      } else {
        toast.error(data.error || "Не получилось");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setMarkingReady(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/orders/${id}/items?itemId=${itemId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Блюдо удалено");
        fetchOrder();
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка удаления");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const res = await fetch(`/api/orders/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryFee: Number(deliveryFee) || 0,
          serviceFee: Number(serviceFee) || 0,
          discountPercent: Number(discountPct) || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const sent = data.notifiedCount || 0;
        const failed = data.failedCount || 0;
        if (failed > 0) {
          toast.success(`Заказ оформлен! Уведомлений: ${sent} доставлено, ${failed} не\u00A0удалось.`);
        } else {
          toast.success(`Заказ оформлен! Уведомления отправлены (${sent}).`);
        }
        setDialogOpen(false);
        fetchOrder();
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setFinalizing(false);
    }
  };

  // --- Derived data ---

  const groupedItems = session?.items.reduce(
    (acc, item) => {
      const key = item.userId;
      if (!acc[key]) {
        acc[key] = { user: item.user, items: [], total: 0 };
      }
      acc[key].items.push(item);
      acc[key].total += item.price;
      return acc;
    },
    {} as Record<
      string,
      { user: OrderItem["user"]; items: OrderItem[]; total: number }
    >
  );

  const quote = useMemo(() => getDailyQuote(), []);

  const totalSum =
    session?.items.reduce((sum, item) => sum + item.price, 0) || 0;
  const isAdmin = user && session && user.id === session.adminId;
  const uniqueUsers = groupedItems ? Object.keys(groupedItems).length : 0;


  // Count how many of each menu item the current user has ordered.
  // Items with options can differ in price, so we also count by dish name.
  const myItemCounts: Record<string, { count: number; itemIds: string[] }> = {};
  const myNameCounts: Record<string, { count: number; itemIds: string[] }> = {};
  if (user && session) {
    for (const item of session.items) {
      if (item.userId === user.id) {
        const key = `${item.dishName}__${item.price}`;
        if (!myItemCounts[key]) {
          myItemCounts[key] = { count: 0, itemIds: [] };
        }
        myItemCounts[key].count++;
        myItemCounts[key].itemIds.push(item.id);

        if (!myNameCounts[item.dishName]) {
          myNameCounts[item.dishName] = { count: 0, itemIds: [] };
        }
        myNameCounts[item.dishName].count++;
        myNameCounts[item.dishName].itemIds.push(item.id);
      }
    }
  }

  const fmtPhone = (phone: string | null): string => {
    const p = (phone || "").replace(/\D/g, "");
    if (p.length !== 11) return p ? `+${p}` : "";
    return `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}`;
  };

  const paidUserIds = new Set(
    (session?.payments || []).map((p) => p.userId)
  );
  const readyUserIds = new Set(
    (session?.participants || []).map((p) => p.userId)
  );
  const iAmReady = user ? readyUserIds.has(user.id) : false;
  // What the current user owes once the order is placed
  const myTotal = (() => {
    if (!session || !user || session.status !== "ORDERED") return null;
    const mine = groupedItems?.[user.id];
    if (!mine || uniqueUsers === 0) return null;
    const extra = (session.deliveryFee + session.serviceFee) / uniqueUsers;
    const discountMult = 1 - (session.discountPercent || 0) / 100;
    return Math.round(mine.total * discountMult + extra);
  })();
  const iPaid = user ? paidUserIds.has(user.id) : false;

  const participantState = (userId: string): ParticipantState => {
    if (paidUserIds.has(userId)) return "paid";
    if (readyUserIds.has(userId)) return "ready";
    return "picking";
  };

  // Dish rows in the order list reuse the menu's hover preview
  const menuByName = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const list of Object.values(menu?.categories || {})) {
      for (const item of list) map.set(item.name, item);
    }
    return map;
  }, [menu]);

  // Countdown to the deadline the admin set in the bot
  const deadlineMs = session?.deadlineAt
    ? new Date(session.deadlineAt).getTime()
    : null;
  const msLeft = deadlineMs !== null ? deadlineMs - now : null;
  const countdown = (() => {
    if (msLeft === null) return null;
    if (msLeft <= 0) return { text: "время вышло", expired: true };
    const totalSec = Math.floor(msLeft / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      text: h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`,
      expired: false,
      urgent: msLeft < 5 * 60 * 1000,
    };
  })();

  const hasMenu = menu && menu.total > 0;
  const categories = menu ? Object.keys(menu.categories) : [];

  // Filter menu items by search (all categories when search is active)
  const filteredMenuItems = (() => {
    if (!menu) return [];
    if (!menuSearch.trim()) {
      const cat = activeCategory && menu.categories[activeCategory]
        ? activeCategory
        : categories[0];
      return menu.categories[cat] || [];
    }
    const q = menuSearch.toLowerCase();
    return Object.values(menu.categories).flat().filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    );
  })();

  // --- Loading ---

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-lg">
          Загрузка...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Заказ не найден</CardTitle>
            <CardDescription>
              Проверьте ссылку и{"\u00A0"}попробуйте снова.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const statusLabel: Record<
    string,
    { text: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    OPEN: { text: "Сбор заказов", variant: "default" },
    ORDERED: { text: "Ожидание оплаты", variant: "secondary" },
    CLOSED: { text: "Закрыт", variant: "outline" },
  };

  const statusInfo = statusLabel[session.status] || {
    text: session.status,
    variant: "outline" as const,
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight logo-gradient">
                oooobet!
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {quote}
              </p>
            </div>
            {user && (
              <div className="flex items-center gap-2">
                {(user.avatarUrl ?? user.photoUrl) ? (
                  <img
                    src={user.avatarUrl ?? user.photoUrl ?? ""}
                    alt={user.firstName}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {initial(user.firstName, user.lastName)}
                  </div>
                )}
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {user.firstName} {user.lastName || ""}
                </span>
              </div>
            )}
          </div>
          <Separator />
        </div>

        {/* Order Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-x-3 gap-y-1 flex-wrap">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span>За{"\u00A0"}всё платит</span>
                  {(session.admin.avatarUrl ?? session.admin.photoUrl) ? (
                    <img
                      src={session.admin.avatarUrl ?? session.admin.photoUrl ?? ""}
                      alt={session.admin.firstName}
                      className="w-5 h-5 rounded-full object-cover inline-block"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                      {initial(session.admin.firstName, session.admin.lastName)}
                    </span>
                  )}
                  {session.admin.username ? (
                    <a
                      href={`https://t.me/${session.admin.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {session.admin.firstName} {session.admin.lastName || ""}
                    </a>
                  ) : (
                    <span>
                      {session.admin.firstName} {session.admin.lastName || ""}
                    </span>
                  )}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {countdown && session.status === "OPEN" && (
                  <span
                    className={`text-lg sm:text-xl font-bold tabular-nums leading-none ${
                      countdown.expired
                        ? "text-muted-foreground"
                        : countdown.urgent
                          ? "text-destructive"
                          : ""
                    }`}
                    title={
                      countdown.expired
                        ? "приём заказов закрыт"
                        : "до конца сбора заказов"
                    }
                  >
                    {countdown.expired ? "⏳ —" : `⏳ ${countdown.text}`}
                  </span>
                )}
                <Badge variant={statusInfo.variant}>{statusInfo.text}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Заказываем из{"\u00A0"}
              <a
                href={session.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {session.placeName ||
                  (() => {
                    try {
                      const parsed = new URL(session.url);
                      const placeSlug = parsed.searchParams.get("placeSlug");
                      if (placeSlug) return placeSlug;
                      const m = parsed.pathname.match(/\/(?:restaurant|r)\/([^/?]+)/);
                      if (m) return m[1];
                      const cm = parsed.pathname.match(/\/[^/]+\/r\/([^/?]+)/);
                      if (cm) return cm[1];
                    } catch { /* ignore */ }
                    return session.url;
                  })()}
              </a>
              {session.placeAddress && (
                <span className="block text-xs mt-0.5">
                  {session.placeAddress.replace(/^Москва,\s*/, "")}
                </span>
              )}
            </p>

          </CardContent>
        </Card>

        {/* Auth Gate */}
        {!user ? (
          <Card>
            <CardHeader>
              <CardTitle>Войдите через{"\u00A0"}Telegram</CardTitle>
              <CardDescription>
                Чтобы добавить свои блюда, нужно{"\u00A0"}авторизоваться.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TelegramLogin
                botName={
                  process.env.NEXT_PUBLIC_BOT_USERNAME || "edashare_bot"
                }
                onAuth={refresh}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ===== MENU SECTION (only if OPEN) ===== */}
            {session.status === "OPEN" && (
              <>
                {menuLoading ? (
                  <Card>
                    <CardContent className="py-8">
                      <div className="animate-pulse text-muted-foreground text-sm text-center">
                        Загрузка меню...
                      </div>
                    </CardContent>
                  </Card>
                ) : hasMenu ? (
                  <Card>
                    <CardContent className="space-y-4 pt-6">
                      {/* Search */}
                      <Input
                        placeholder="Поиск по меню..."
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        className="h-9"
                      />

                      {/* Category tabs */}
                      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setActiveCategory(cat);
                              setMenuSearch("");
                            }}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                              activeCategory === cat
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Menu items */}
                      <div
                        className="space-y-2 max-h-[60vh] overflow-y-auto"
                        onScroll={handleMenuRowLeave}
                      >
                        {filteredMenuItems.length > 0 ? (
                          filteredMenuItems.map((menuItem) => {
                            const withOptions = hasOptions(menuItem);
                            const key = `${menuItem.name}__${menuItem.price}`;
                            const counts = withOptions
                              ? myNameCounts[menuItem.name]
                              : myItemCounts[key];
                            const myCount = counts?.count || 0;
                            const myIds = counts?.itemIds || [];

                            return (
                              <div
                                key={menuItem.id}
                                data-menu-row
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 hover:shadow-sm transition-all duration-150"
                                onMouseEnter={(e) =>
                                  handleMenuRowEnter(menuItem, e)
                                }
                                onMouseLeave={handleMenuRowLeave}
                              >
                                {/* Image */}
                                {menuItem.imageUrl && (
                                  <img
                                    src={menuItem.imageUrl}
                                    alt={menuItem.name}
                                    className="w-14 h-14 rounded-md object-cover shrink-0"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm leading-tight">
                                    {menuItem.name}
                                  </div>
                                  {(menuItem.weight || withOptions) && (
                                    <span className="text-xs text-muted-foreground">
                                      {menuItem.weight}
                                      {menuItem.weight && withOptions && " · "}
                                      {withOptions && "есть опции"}
                                    </span>
                                  )}
                                  <div className="font-semibold text-sm mt-0.5">
                                    {fmtPrice(menuItem.price)}
                                  </div>
                                </div>

                                {/* Add / counter */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {myCount > 0 ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        onClick={() => {
                                          const lastId = myIds[myIds.length - 1];
                                          if (lastId) handleDeleteItem(lastId);
                                        }}
                                      >
                                        <span className="text-lg leading-none">
                                          -
                                        </span>
                                      </Button>
                                      <span className="w-6 text-center text-sm font-semibold">
                                        {myCount}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        onClick={() =>
                                          withOptions
                                            ? openOptionsDialog(menuItem)
                                            : handleAddFromMenu(menuItem)
                                        }
                                      >
                                        <span className="text-lg leading-none">
                                          +
                                        </span>
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="text-xs h-8 px-3"
                                      onClick={(e) =>
                                        handleWantThis(menuItem, e)
                                      }
                                    >
                                      Хочу это! 🤤
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-muted-foreground text-sm text-center py-4">
                            Ничего не{"\u00A0"}найдено
                          </p>
                        )}
                      </div>

                      {/* Done choosing + manual entry underneath */}
                      <Separator />
                      <div>
                        <Button
                          size="lg"
                          variant={iAmReady ? "outline" : "default"}
                          className="w-full"
                          disabled={markingReady}
                          onClick={handleToggleReady}
                        >
                          {markingReady
                            ? "Секунду..."
                            : iAmReady
                              ? "Я ещё выбираю"
                              : "Выбор сделан, заказывайте!"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setShowManualForm(!showManualForm)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-2 cursor-pointer"
                        >
                          {showManualForm
                            ? "Скрыть ручной ввод"
                            : "Нет в\u00A0меню? Добавить вручную"}
                        </button>
                        {showManualForm && (
                          <form
                            onSubmit={handleAddManual}
                            className="space-y-3 mt-3"
                          >
                            <div className="grid grid-cols-[1fr_120px] gap-3">
                              <div className="space-y-1">
                                <Label htmlFor="dishName" className="text-xs">
                                  Название блюда
                                </Label>
                                <Input
                                  id="dishName"
                                  placeholder="Пицца Маргарита"
                                  value={dishName}
                                  onChange={(e) => setDishName(e.target.value)}
                                  required
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="price" className="text-xs">
                                  Цена, ₽
                                </Label>
                                <Input
                                  id="price"
                                  type="number"
                                  min="1"
                                  placeholder="590"
                                  value={price}
                                  onChange={(e) => setPrice(e.target.value)}
                                  required
                                  className="h-9"
                                />
                              </div>
                            </div>
                            <Button
                              type="submit"
                              disabled={adding}
                              className="w-full"
                              size="sm"
                            >
                              {adding ? "Добавляем..." : "Добавить"}
                            </Button>
                          </form>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* No menu — show manual form by default */
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Добавить блюдо вручную
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleAddManual} className="space-y-4">
                        <div className="grid grid-cols-[1fr_120px] gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="dishName">Название блюда</Label>
                            <Input
                              id="dishName"
                              placeholder="Пицца Маргарита"
                              value={dishName}
                              onChange={(e) => setDishName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="price">Цена, ₽</Label>
                            <Input
                              id="price"
                              type="number"
                              min="1"
                              placeholder="590"
                              value={price}
                              onChange={(e) => setPrice(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <Button
                          type="submit"
                          disabled={adding}
                          className="w-full"
                        >
                          {adding ? "Добавляем..." : "Добавить"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* ===== ORDERED ITEMS LIST ===== */}
            <div ref={orderCardRef}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Итого &mdash; {session.items.length}{" "}
                    {(() => {
                      const n = session.items.length;
                      const mod10 = n % 10;
                      const mod100 = n % 100;
                      if (mod100 >= 11 && mod100 <= 19) return "блюд";
                      if (mod10 === 1) return "блюдо";
                      if (mod10 >= 2 && mod10 <= 4) return "блюда";
                      return "блюд";
                    })()}
                  </CardTitle>
                  <span className="text-sm font-semibold tabular-nums text-right min-w-[5rem]">
                    {fmtPrice(totalSum)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {groupedItems && Object.keys(groupedItems).length > 0 ? (
                  Object.entries(groupedItems).map(
                    ([userId, { user: itemUser, items, total }]) => (
                      <div key={userId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-sm flex items-center gap-1.5">
                            {(itemUser.avatarUrl ?? itemUser.photoUrl) ? (
                              <img
                                src={itemUser.avatarUrl ?? itemUser.photoUrl ?? ""}
                                alt={itemUser.firstName}
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                                {initial(itemUser.firstName, itemUser.lastName)}
                              </span>
                            )}
                            {itemUser.firstName} {itemUser.lastName || ""}
                            <ParticipantStatus state={participantState(userId)} />
                          </h3>
                          <span className="text-sm text-muted-foreground tabular-nums text-right min-w-[5rem]">
                            {fmtPrice(total)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between py-1 text-sm rounded hover:bg-accent/40 transition-colors -mx-1 px-1"
                              onMouseEnter={(e) => {
                                const menuItem = menuByName.get(item.dishName);
                                if (menuItem) handleMenuRowEnter(menuItem, e);
                              }}
                              onMouseLeave={handleMenuRowLeave}
                            >
                              <span>
                                {item.dishName}
                                {item.options && (
                                  <span className="block text-xs text-muted-foreground">
                                    {item.options}
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                {session.status === "OPEN" &&
                                  user.id === userId && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteItem(item.id)
                                      }
                                      className="text-destructive hover:text-destructive/80 text-xs font-medium cursor-pointer"
                                    >
                                      Удалить
                                    </button>
                                  )}
                                <span className="font-medium tabular-nums text-right min-w-[5rem]">
                                  {fmtPrice(item.price)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Separator />
                      </div>
                    )
                  )
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    Пока никто не{"\u00A0"}добавил блюда
                  </p>
                )}
              </CardContent>
            </Card>
            </div>

            {/* ===== Admin: Finalize ===== */}
            {isAdmin &&
              session.status === "OPEN" &&
              session.items.length > 0 && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full">
                      Рассчитать заказ
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader className="sr-only">
                      <DialogTitle>Завершение сбора заказов</DialogTitle>
                    </DialogHeader>
                    <DialogDescription>
                      Укажите стоимость доставки и{"\u00A0"}сервисный сбор. Сумма будет
                      разделена поровну между {uniqueUsers}{"\u00A0"}участниками.
                    </DialogDescription>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="deliveryFee">
                          Стоимость доставки, ₽
                        </Label>
                        <Input
                          id="deliveryFee"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={deliveryFee}
                          onChange={(e) => setDeliveryFee(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="serviceFee">Сервисный сбор, ₽</Label>
                        <Input
                          id="serviceFee"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={serviceFee}
                          onChange={(e) => setServiceFee(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="discountPct">
                          Скидка на{" "}блюда, %
                        </Label>
                        <Input
                          id="discountPct"
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={discountPct}
                          onChange={(e) => setDiscountPct(e.target.value)}
                        />
                      </div>
                      {uniqueUsers > 0 && (
                        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                          <p>
                            Доп. расходы на{"\u00A0"}человека:{" "}
                            <strong>
                              {fmtPrice(
                                Math.round(
                                  ((Number(deliveryFee) || 0) +
                                    (Number(serviceFee) || 0)) /
                                    uniqueUsers
                                )
                              )}
                            </strong>
                          </p>
                          <p className="mt-1">
                            Общая сумма блюд:{" "}
                            <strong>
                              {Number(discountPct) > 0 ? (
                                <>
                                  <span className="line-through font-normal">
                                    {fmtPrice(totalSum)}
                                  </span>{" "}
                                  {fmtPrice(
                                    totalSum *
                                      (1 -
                                        Math.min(100, Number(discountPct)) /
                                          100)
                                  )}
                                </>
                              ) : (
                                fmtPrice(totalSum)
                              )}
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleFinalize}
                        disabled={finalizing}
                        className="w-full"
                      >
                        {finalizing
                          ? "Оформляем..."
                          : "Подтвердить и\u00A0пусть платят"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

            {/* ===== ORDERED status - payment summary ===== */}
            {session.status === "ORDERED" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Кто что должен</CardTitle>
                  <CardDescription>
                    Доставка {fmtPrice(session.deliveryFee)} и{"\u00A0"}сервисный сбор {fmtPrice(session.serviceFee)}
                    {session.discountPercent > 0 && (
                      <>
                        {" "}
                        · скидка на блюда {session.discountPercent}%
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {groupedItems &&
                    Object.entries(groupedItems).map(
                      ([userId, { user: itemUser, total }]) => {
                        const extra =
                          (session.deliveryFee + session.serviceFee) /
                          uniqueUsers;
                        const discountMult =
                          1 - (session.discountPercent || 0) / 100;
                        const finalTotal = Math.round(
                          total * discountMult + extra
                        );
                        const hasPaid = paidUserIds.has(userId);

                        return (
                          <div
                            key={userId}
                            className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                          >
                            <span
                              className={`text-sm flex items-center gap-1.5 ${
                                hasPaid
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }`}
                            >
                              {(itemUser.avatarUrl ?? itemUser.photoUrl) ? (
                                <img
                                  src={itemUser.avatarUrl ?? itemUser.photoUrl ?? ""}
                                  alt={itemUser.firstName}
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                                  {initial(itemUser.firstName, itemUser.lastName)}
                                </span>
                              )}
                              {itemUser.firstName} {itemUser.lastName || ""}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              {hasPaid && (
                                <span className="text-xs font-medium text-green-600 dark:text-green-500">
                                  перевёл ✅
                                </span>
                              )}
                              <span
                                className={`font-semibold tabular-nums text-right min-w-[5rem] ${
                                  hasPaid
                                    ? "line-through text-muted-foreground font-normal"
                                    : ""
                                }`}
                              >
                                {fmtPrice(finalTotal)}
                              </span>
                            </span>
                          </div>
                        );
                      }
                    )}

                  {/* My own requisites: no bank deeplink can pre-fill an
                      amount without the bank's API, so make the phone and the
                      sum one tap away instead. */}
                  {myTotal !== null && (
                    <div className="rounded-md border p-3 space-y-3">
                      {iPaid ? (
                        <p className="text-sm text-green-600 dark:text-green-500 font-medium">
                          Перевод отмечен — спасибо! ✅
                        </p>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm text-muted-foreground">
                              С тебя
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(String(myTotal), "amount")
                              }
                              className="text-xl font-bold tabular-nums hover:text-blue-600 transition-colors cursor-pointer"
                              title="Скопировать сумму"
                            >
                              {copied === "amount" ? "скопировано" : fmtPrice(myTotal)}
                            </button>
                          </div>

                          {session.admin.phoneNumber ? (
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-sm text-muted-foreground">
                                На номер
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    session.admin.phoneNumber || "",
                                    "phone"
                                  )
                                }
                                className="text-sm font-mono font-medium hover:text-blue-600 transition-colors cursor-pointer"
                                title="Скопировать номер"
                              >
                                {copied === "phone"
                                  ? "скопировано"
                                  : fmtPhone(session.admin.phoneNumber)}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Номер не указан — спроси у{"\u00A0"}
                              {session.admin.firstName}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Нажми на сумму или номер, чтобы скопировать
                          </p>

                          <Button
                            className="w-full"
                            disabled={markingPaid}
                            onClick={handleMarkPaid}
                          >
                            {markingPaid ? "Отмечаю..." : "Я перевёл"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Hover preview: big photo + состав (desktop only) */}
        {hoverPreview && (
          <div
            className="fixed z-[9998] pointer-events-none rounded-xl border bg-popover text-popover-foreground shadow-xl overflow-hidden"
            style={{
              top: hoverPreview.top,
              left: hoverPreview.left,
              width: hoverPreview.width,
            }}
          >
            {hoverPreview.item.imageUrl && (
              <img
                src={bigImageUrl(hoverPreview.item.imageUrl)}
                alt={hoverPreview.item.name}
                className="w-full aspect-square object-cover"
              />
            )}
            <div className="p-3 space-y-1">
              <div className="font-semibold text-sm leading-tight">
                {hoverPreview.item.name}
              </div>
              {hoverPreview.item.weight && (
                <div className="text-xs text-muted-foreground">
                  {hoverPreview.item.weight}
                </div>
              )}
              {hoverPreview.item.description && (
                <p className="text-xs text-muted-foreground leading-snug max-h-32 overflow-hidden">
                  {hoverPreview.item.description}
                </p>
              )}
              <div className="font-semibold text-sm pt-1">
                {fmtPrice(hoverPreview.item.price)}
              </div>
            </div>
          </div>
        )}

        {/* Options dialog */}
        <Dialog
          open={!!optionsItem}
          onOpenChange={(open) => {
            if (!open) setOptionsItem(null);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{optionsItem?.name}</DialogTitle>
              <DialogDescription>
                Выбери опции — они попадут в{" "}заказ.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {optionsItem?.optionGroups?.map((group, gi) => {
                const selected = optionSelections[gi] || [];
                const isRadio = group.maxSelected === 1;
                return (
                  <div key={gi} className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {group.name}
                      {group.required && (
                        <span className="text-xs text-muted-foreground font-normal">
                          обязательно
                        </span>
                      )}
                      {!isRadio && group.maxSelected > 1 && (
                        <span className="text-xs text-muted-foreground font-normal">
                          до {group.maxSelected}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {group.options.map((opt, oi) => {
                        const isSelected = selected.includes(oi);
                        return (
                          <button
                            key={oi}
                            type="button"
                            onClick={() => toggleOption(gi, oi)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors cursor-pointer ${
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-input hover:bg-accent/50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`shrink-0 w-4 h-4 border flex items-center justify-center text-[10px] ${
                                  isRadio ? "rounded-full" : "rounded-sm"
                                } ${
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {isSelected && "✓"}
                              </span>
                              {opt.name}
                            </span>
                            {opt.price > 0 && (
                              <span className="text-muted-foreground tabular-nums shrink-0">
                                +{fmtPrice(opt.price)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button
                onClick={handleConfirmOptions}
                disabled={!optionsValid}
                className="w-full"
              >
                {optionsItem
                  ? `Добавить за ${fmtPrice(optionsItem.price + optionsExtraPrice)}`
                  : "Добавить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fly-to-cart overlay */}
        {flyingItem && (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: flyPhase === "from" ? flyingItem.fromRect.left : flyingItem.toRect.left + (flyingItem.toRect.width - Math.min(flyingItem.fromRect.width, 48)) / 2,
              top: flyPhase === "from" ? flyingItem.fromRect.top : flyingItem.toRect.top + (flyingItem.toRect.height - Math.min(flyingItem.fromRect.height, 48)) / 2,
              width: flyPhase === "from" ? flyingItem.fromRect.width : Math.min(flyingItem.fromRect.width, 48),
              height: flyPhase === "from" ? flyingItem.fromRect.height : Math.min(flyingItem.fromRect.height, 48),
              transition: "all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
            onTransitionEnd={handleFlyEnd}
          >
            {flyingItem.imageUrl ? (
              <img
                src={flyingItem.imageUrl}
                alt=""
                className="w-full h-full rounded-md object-cover shadow-lg"
              />
            ) : (
              <div className="w-full h-full rounded-md bg-muted flex items-center justify-center text-lg shadow-lg">
                🍽
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
