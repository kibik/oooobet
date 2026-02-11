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

// Format number with thin space thousands separator and before ₽
function fmtPrice(n: number): string {
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  return `${formatted}\u2009₽`;
}

// --- Types ---

interface OrderItem {
  id: string;
  dishName: string;
  price: number;
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
  createdAt: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  weight: string | null;
  imageUrl: string | null;
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
  const [finalizing, setFinalizing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fly-to-cart animation
  const [flyingItem, setFlyingItem] = useState<{
    menuItem: MenuItem;
    imageUrl: string | null;
    fromRect: DOMRect;
    toRect: DOMRect;
  } | null>(null);
  const [flyPhase, setFlyPhase] = useState<"from" | "to">("from");
  const orderCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyingItem) return;
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFlyPhase("to"));
    });
    return () => cancelAnimationFrame(t);
  }, [flyingItem]);

  const handleFlyEnd = () => {
    if (flyingItem) {
      handleAddFromMenu(flyingItem.menuItem);
      setFlyingItem(null);
      setFlyPhase("from");
    }
  };

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

  const handleWantThis = (menuItem: MenuItem, e: React.MouseEvent) => {
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

  const handleAddFromMenu = async (menuItem: MenuItem) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishName: menuItem.name,
          price: menuItem.price,
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
    if (flyingItem) {
      handleAddFromMenu(flyingItem.menuItem);
      setFlyingItem(null);
      setFlyPhase("from");
    }
  };

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

  // Count how many of each menu item the current user has ordered
  const myItemCounts: Record<string, { count: number; itemIds: string[] }> = {};
  if (user && session) {
    for (const item of session.items) {
      if (item.userId === user.id) {
        const key = `${item.dishName}__${item.price}`;
        if (!myItemCounts[key]) {
          myItemCounts[key] = { count: 0, itemIds: [] };
        }
        myItemCounts[key].count++;
        myItemCounts[key].itemIds.push(item.id);
      }
    }
  }

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
                    {user.firstName[0]}
                  </div>
                )}
                <span className="text-sm text-muted-foreground">
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
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>За{"\u00A0"}всё платит</span>
                  {(session.admin.avatarUrl ?? session.admin.photoUrl) ? (
                    <img
                      src={session.admin.avatarUrl ?? session.admin.photoUrl ?? ""}
                      alt={session.admin.firstName}
                      className="w-5 h-5 rounded-full object-cover inline-block"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                      {session.admin.firstName[0]}
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
              <Badge variant={statusInfo.variant}>{statusInfo.text}</Badge>
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
                {(() => {
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
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {filteredMenuItems.length > 0 ? (
                          filteredMenuItems.map((menuItem) => {
                            const key = `${menuItem.name}__${menuItem.price}`;
                            const myCount = myItemCounts[key]?.count || 0;
                            const myIds = myItemCounts[key]?.itemIds || [];

                            return (
                              <div
                                key={menuItem.id}
                                data-menu-row
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 hover:shadow-sm transition-all duration-150"
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
                                  {menuItem.weight && (
                                    <span className="text-xs text-muted-foreground">
                                      {menuItem.weight}
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
                                          handleAddFromMenu(menuItem)
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

                      {/* Manual input toggle inside menu card */}
                      <Separator />
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowManualForm(!showManualForm)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1 cursor-pointer"
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
                                {itemUser.firstName[0]}
                              </span>
                            )}
                            {itemUser.firstName} {itemUser.lastName || ""}
                          </h3>
                          <span className="text-sm text-muted-foreground tabular-nums text-right min-w-[5rem]">
                            {fmtPrice(total)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between py-1 text-sm"
                            >
                              <span>{item.dishName}</span>
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
                            Общая сумма блюд: <strong>{fmtPrice(totalSum)}</strong>
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
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {groupedItems &&
                    Object.entries(groupedItems).map(
                      ([userId, { user: itemUser, total }]) => {
                        const extra =
                          (session.deliveryFee + session.serviceFee) /
                          uniqueUsers;
                        const finalTotal = Math.round(total + extra);

                        return (
                          <div
                            key={userId}
                            className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                          >
                            <span className="text-sm flex items-center gap-1.5">
                              {(itemUser.avatarUrl ?? itemUser.photoUrl) ? (
                                <img
                                  src={itemUser.avatarUrl ?? itemUser.photoUrl ?? ""}
                                  alt={itemUser.firstName}
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                                  {itemUser.firstName[0]}
                                </span>
                              )}
                              {itemUser.firstName} {itemUser.lastName || ""}
                            </span>
                            <span className="font-semibold tabular-nums text-right min-w-[5rem]">
                              {fmtPrice(finalTotal)}
                            </span>
                          </div>
                        );
                      }
                    )}
                </CardContent>
              </Card>
            )}
          </>
        )}

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
