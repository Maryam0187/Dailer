"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/theme/ThemeToggle";
import DialerPhoneIcon from "@/components/brand/DialerPhoneIcon";
import ShiftStatusBadge from "@/components/layout/ShiftStatusBadge";
import NavbarMessagingButton from "@/components/Messaging/NavbarMessagingButton";

const PALETTES = {
  dialer: {
    active:
      "border-sky-500/70 bg-sky-100 text-sky-950 shadow-md shadow-sky-500/25 dark:border-sky-500/55 dark:bg-sky-950/45 dark:text-sky-50 dark:shadow-sky-950/35",
    idle:
      "border-sky-200/90 bg-sky-50/70 text-zinc-950 shadow-sm shadow-sky-500/10 hover:bg-sky-50 hover:shadow-md dark:border-sky-900/50 dark:bg-zinc-900/80 dark:text-zinc-100 dark:shadow-sky-950/20 dark:hover:bg-zinc-900",
  },
  emerald: {
    active:
      "border-emerald-500/70 bg-emerald-100 text-emerald-950 shadow-md shadow-emerald-500/20 dark:border-emerald-500/55 dark:bg-emerald-950/45 dark:text-emerald-50 dark:shadow-emerald-950/30",
    idle:
      "border-transparent text-emerald-700 hover:border-emerald-200/90 hover:bg-emerald-50/90 hover:text-emerald-950 dark:text-emerald-400 dark:hover:border-emerald-800/80 dark:hover:bg-emerald-950/35 dark:hover:text-emerald-100",
  },
  indigo: {
    active:
      "border-indigo-500/70 bg-indigo-100 text-indigo-950 shadow-md shadow-indigo-500/20 dark:border-indigo-500/55 dark:bg-indigo-950/45 dark:text-indigo-50 dark:shadow-indigo-950/30",
    idle:
      "border-transparent text-indigo-700 hover:border-indigo-200/90 hover:bg-indigo-50/90 hover:text-indigo-950 dark:text-indigo-400 dark:hover:border-indigo-800/80 dark:hover:bg-indigo-950/35 dark:hover:text-indigo-100",
  },
  amber: {
    active:
      "border-amber-500/70 bg-amber-100 text-amber-950 shadow-md shadow-amber-500/20 dark:border-amber-500/55 dark:bg-amber-950/45 dark:text-amber-50 dark:shadow-amber-950/30",
    idle:
      "border-transparent text-amber-700 hover:border-amber-200/90 hover:bg-amber-50/90 hover:text-amber-950 dark:text-amber-400 dark:hover:border-amber-800/80 dark:hover:bg-amber-950/35 dark:hover:text-amber-100",
  },
  violet: {
    active:
      "border-violet-500/70 bg-violet-100 text-violet-950 shadow-md shadow-violet-500/20 dark:border-violet-500/55 dark:bg-violet-950/45 dark:text-violet-50 dark:shadow-violet-950/30",
    idle:
      "border-transparent text-violet-700 hover:border-violet-200/90 hover:bg-violet-50/90 hover:text-violet-950 dark:text-violet-400 dark:hover:border-violet-800/80 dark:hover:bg-violet-950/35 dark:hover:text-violet-100",
  },
};

function linkClass(active, palette, extra = "") {
  const colors = PALETTES[palette][active ? "active" : "idle"];
  return `inline-flex shrink-0 items-center rounded-xl border font-semibold transition-colors ${colors} ${extra}`;
}

function buildNavItems(role, pathname, accessMode = "full") {
  const items = [
    {
      href: "/",
      label: "Dialer",
      active: pathname === "/",
      palette: "dialer",
      brand: true,
    },
  ];

  if (accessMode !== "limited") {
    items.push({
      href: "/leads",
      label: "Leads",
      active: pathname === "/leads",
      palette: "emerald",
    });
  }

  items.push({
    href: "/files",
    label: "Files",
    active: pathname === "/files",
    palette: "indigo",
  });

  if (accessMode !== "limited" && (role === "admin" || role === "manager" || role === "supervisor")) {
    items.push({
      href: "/users",
      label: "Users",
      active: pathname === "/users",
      palette: "emerald",
    });
  }

  if (accessMode !== "limited" && role === "admin") {
    items.push(
      {
        href: "/customers",
        label: "Customers",
        active: pathname === "/customers" || pathname?.startsWith("/customers/"),
        palette: "violet",
      },
      {
        href: "/message-oversight",
        label: "Chat oversight",
        active: pathname === "/message-oversight",
        palette: "amber",
      },
      {
        href: "/reports",
        label: "Reports",
        active: pathname === "/reports",
        palette: "amber",
      },
      {
        href: "/billing",
        label: "Billing",
        active: pathname === "/billing",
        palette: "violet",
      },
      {
        href: "/shift",
        label: "Shift",
        active: pathname === "/shift",
        palette: "amber",
      },
    );
  }

  return items;
}

function NavLink({ item, onNavigate, className = "" }) {
  if (item.brand) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={linkClass(
          item.active,
          item.palette,
          `gap-2 px-2.5 py-1.5 text-base outline-none ring-sky-400/40 focus-visible:ring-2 lg:text-lg ${className}`,
        )}
        aria-label="Dialer — home"
        aria-current={item.active ? "page" : undefined}
      >
        <DialerPhoneIcon className="h-6 w-6 lg:h-7 lg:w-7" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={linkClass(item.active, item.palette, `px-3 py-2 text-sm lg:text-base ${className}`)}
      aria-current={item.active ? "page" : undefined}
    >
      {item.label}
    </Link>
  );
}

function MenuIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Navbar({ role, shiftStatus = null, accessMode = "full" }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = buildNavItems(role, pathname, accessMode);
  const mobileItems = navItems.filter((item) => !item.brand);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-sky-500/20 bg-gradient-to-r from-sky-100/70 via-white to-sky-50/70 backdrop-blur-md dark:border-sky-500/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="relative mx-auto max-w-6xl px-3 sm:px-4">
        <div className="flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
          <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto lg:flex lg:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={closeMenu} />
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <Link
              href="/"
              className={linkClass(
                pathname === "/",
                "dialer",
                "gap-2 px-2 py-1.5 text-sm sm:px-2.5 sm:text-base",
              )}
              aria-label="Dialer — home"
              aria-current={pathname === "/" ? "page" : undefined}
            >
              <DialerPhoneIcon className="h-6 w-6" />
              <span className="truncate">Dialer</span>
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-menu"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/60 px-1.5 py-1 dark:border-zinc-600/80 dark:bg-zinc-800/40 sm:gap-2 sm:px-2.5 sm:py-1.5 lg:gap-3 lg:px-3">
            {role === "admin" ? (
              <span className="hidden sm:inline-flex">
                <ShiftStatusBadge initialShiftStatus={shiftStatus} />
              </span>
            ) : null}
            <NavbarMessagingButton />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        {menuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 top-14 z-40 bg-zinc-950/40 sm:top-16 lg:hidden"
              aria-label="Close navigation menu"
              onClick={closeMenu}
            />
            <nav
              id="mobile-nav-menu"
              className="absolute left-0 right-0 top-full z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-sky-500/15 bg-white/98 px-3 py-3 shadow-lg backdrop-blur-md sm:max-h-[calc(100dvh-4rem)] dark:border-sky-500/20 dark:bg-zinc-950/98 lg:hidden"
            >
              {role === "admin" ? (
                <div className="mb-3 sm:hidden">
                  <ShiftStatusBadge initialShiftStatus={shiftStatus} />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                {mobileItems.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    onNavigate={closeMenu}
                    className="w-full justify-center py-2.5"
                  />
                ))}
              </div>
            </nav>
          </>
        ) : null}
      </div>
    </header>
  );
}
