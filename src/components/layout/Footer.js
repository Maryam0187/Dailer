export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="flex h-16 shrink-0 items-center justify-center border-t border-zinc-200 bg-white/80 text-base text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center px-4">
        <p>© {year} Dialer</p>
      </div>
    </footer>
  );
}
