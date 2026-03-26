export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="flex h-16 shrink-0 items-center justify-center border-t-2 border-zinc-200/90 bg-gradient-to-r from-zinc-50/80 via-white to-sky-50/40 text-base text-zinc-600 dark:border-zinc-700 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 dark:text-zinc-400">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center px-4">
        <p>© {year} Dialer</p>
      </div>
    </footer>
  );
}
