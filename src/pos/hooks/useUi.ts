export function useUi() {
    return {
      page: "bg-zinc-50 text-zinc-800",
      panel: "rounded-2xl border border-zinc-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,.06)]",
      header: "sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur",
      input:
        "w-full rounded-xl bg-white border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200",
      btn: "relative rounded-2xl px-4 py-3 text-sm font-extrabold border transition select-none",
      btnIdle: "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400",
      btnActive:
        "bg-zinc-200 border-zinc-300 text-zinc-900 ring-2 ring-zinc-200 shadow-[0_10px_25px_rgba(0,0,0,.06)]",
      smallBtn:
        "text-xs font-extrabold px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 transition",
      ghostBtn: "text-xs font-extrabold text-zinc-500 hover:text-zinc-700",
      chip: "px-2 py-1 rounded-full border border-zinc-300 bg-zinc-50 text-zinc-700 font-semibold",
      chipPromo: "px-2 py-1 rounded-full border border-zinc-300 bg-zinc-200 text-zinc-800 font-extrabold",
      card:
        "relative text-left rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition p-4 flex flex-col gap-2 active:scale-[0.99] active:bg-zinc-100",
      ticketItem: "relative rounded-2xl border border-zinc-200 bg-white p-3 transition hover:bg-zinc-50",
      qtyBtn:
        "h-9 w-9 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 transition font-extrabold text-zinc-700",
      footerBox: "rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3",
      primary:
        "w-full rounded-2xl px-4 py-4 font-extrabold text-sm tracking-tight bg-zinc-200 text-zinc-900 hover:bg-zinc-300 transition disabled:opacity-40 disabled:cursor-not-allowed",
      primaryStrong:
        "px-3 py-2 rounded-xl text-xs font-extrabold border border-zinc-300 bg-zinc-200 text-zinc-900 hover:bg-zinc-300 transition disabled:opacity-40",
      modalOverlay:
        "fixed inset-0 z-50 bg-zinc-900/20 backdrop-blur-sm flex items-center justify-center p-4",
      modal:
        "w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_25px_80px_rgba(0,0,0,.18)]",
    };
  }
  