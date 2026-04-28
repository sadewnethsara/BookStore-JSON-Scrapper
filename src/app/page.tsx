"use client";

import { CatalogSourcesPanel } from "@/components/catalog-sources-panel";
import { ProfileMenu } from "@/components/profile-menu";
import { dedupeBySku } from "@/lib/dedupe-by-sku";
import type { ScrapedBook } from "@lumina/shared-types";
import { createLuminaBrowserClient } from "@lumina/supabase-client/browser";
import { partitionScrapedBooks } from "@lumina/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function isSupabasePublicConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error' | 'warning';
}

export default function Home() {
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [products, setProducts] = useState<ScrapedBook[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<ScrapedBook[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const [catalogPreviewOpen, setCatalogPreviewOpen] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  /** Set when this review session came from a job part (Review Queue → button) */
  const [partContext, setPartContext] = useState<{ jobId: string; partIndex: number } | null>(null);
  const notificationSeq = useRef(0);

  useEffect(() => {
    fetch("/api/ai/enrich")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        setAiEnabled(Boolean(d?.enabled));
      })
      .catch(() => setAiEnabled(false));
  }, []);

  // Auto-load a part from ingest-jobs detail page when navigated here via "Review Queue →"
  useEffect(() => {
    const REVIEW_QUEUE_KEY = "review_queue_preload";
    try {
      const raw = sessionStorage.getItem(REVIEW_QUEUE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(REVIEW_QUEUE_KEY);
      const parsed = JSON.parse(raw) as {
        items?: unknown;
        label?: string;
        jobId?: string;
        partIndex?: number;
      };
      if (!Array.isArray(parsed.items)) return;
      const { valid, errors } = partitionScrapedBooks(parsed.items);
      if (valid.length === 0) return;
      setProducts(valid);
      setCurrentIndex(0);
      setSelectedItems([]);
      if (parsed.jobId && parsed.partIndex != null) {
        setPartContext({ jobId: parsed.jobId, partIndex: parsed.partIndex });
      }
      addNotification(
        `Part ${parsed.partIndex ?? "?"} loaded — ${valid.length} books${errors.length > 0 ? ` (${errors.length} invalid skipped)` : ""}. Accept or Reject each one.`,
        "success",
      );
    } catch {
      // ignore parse errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSupabasePublicConfigured()) return;
    const supabase = createLuminaBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setAuthEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const addNotification = (msg: string, type: Notification['type'] = 'info') => {
    notificationSeq.current += 1;
    const id = `${Date.now()}-${notificationSeq.current}`;
    setNotifications((prev) => [...prev, { id, message: msg, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  };

  const currentProduct = products[currentIndex];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const { valid, errors } = partitionScrapedBooks(json);
        if (errors.length > 0 && errors[0]?.index === -1) {
          addNotification(errors[0].message, "error");
          return;
        }
        if (valid.length === 0) {
          addNotification("No valid catalog rows (need name + sku per item).", "error");
          return;
        }
        setProducts(valid);
        setCurrentIndex(0);
        setSelectedItems([]);
        const skipped = errors.length;
        addNotification(
          skipped > 0
            ? `Loaded ${valid.length} valid rows (${skipped} skipped — invalid fields).`
            : `Dataset loaded: ${valid.length} items`,
          skipped > 0 ? "warning" : "success",
        );
      } catch {
        addNotification("Error parsing JSON file", "error");
      }
    };
    reader.readAsText(file);
  };

  const nextProduct = () => {
    if (currentIndex < products.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      addNotification("Reached the end of the list!", "info");
    }
  };

  const handleSelect = () => {
    if (!currentProduct) return;
    addNotification(`Selected: ${currentProduct.name.substring(0, 20)}...`, 'success');
    setSelectedItems(prev => [...prev, currentProduct]);
    nextProduct();
  };

  const handleAiEnrich = async () => {
    if (!currentProduct) return;
    setAiWorking(true);
    try {
      const res = await fetch("/api/ai/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: currentProduct }),
      });
      const data = (await res.json()) as {
        error?: string;
        suggested_category?: string;
        suggested_summary?: string;
      };
      if (!res.ok) {
        addNotification(data.error ?? "AI request failed", "error");
        return;
      }
      const cat = data.suggested_category?.trim();
      const sum = data.suggested_summary?.trim();
      setProducts((prev) => {
        const next = [...prev];
        const i = currentIndex;
        const row = next[i];
        if (!row) return prev;
        next[i] = {
          ...row,
          ...(cat ? { category: cat } : {}),
          ...(sum ? { description: sum } : {}),
        };
        return next;
      });
      addNotification(
        "AI filled category & description — review, then accept or edit manually.",
        "success",
      );
    } catch {
      addNotification("AI request failed", "error");
    } finally {
      setAiWorking(false);
    }
  };

  const handleReject = () => {
    if (currentProduct) {
      addNotification(`Rejected: ${currentProduct.name.substring(0, 20)}...`, 'warning');
    }
    nextProduct();
  };

  const handleSave = async () => {
    if (selectedItems.length === 0) {
      addNotification("No items selected to save", "warning");
      return;
    }

    setIsSaving(true);
    addNotification("Saving items...", "info");

    const toSave = dedupeBySku(selectedItems);

    try {
      const response = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toSave }),
      });

      const data = await response.json();
      if (data.success) {
        const extra =
          typeof data.skippedInvalid === "number" && data.skippedInvalid > 0
            ? ` (${data.skippedInvalid} invalid rows dropped server-side)`
            : "";
        const where =
          data.target === "supabase"
            ? "to Supabase staging"
            : `in ${data.chunks} local batches`;
        addNotification(
          `Successfully saved ${data.count} items ${where}${extra}`,
          "success",
        );

        // Mark the source part as imported so it can't be reviewed again
        if (partContext) {
          const { jobId, partIndex } = partContext;
          fetch(`/api/catalog/ingest-jobs/${jobId}/parts/${partIndex}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "imported" }),
          })
            .then((r) => r.json())
            .then((d: { ok?: boolean; error?: string }) => {
              if (d.ok) {
                addNotification(`Part ${partIndex} marked as reviewed ✓`, "info");
                setPartContext(null);
              }
            })
            .catch(() => {/* best-effort */});
        }
      } else {
        addNotification(`Error: ${data.error}`, "error");
      }
    } catch {
      addNotification('Failed to save items', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMerge = async () => {
    if (isSupabasePublicConfigured() && !authEmail) {
      addNotification("Sign in first — click the Sign in button in the top-right corner.", "warning");
      return;
    }
    setIsMerging(true);
    addNotification("Publishing to catalog…", "info");
    
    try {
      const response = await fetch('/api/merge', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        if (data.target === "supabase") {
          const rh =
            typeof data.rehostedCovers === "number"
              ? ` Re-hosted ${data.rehostedCovers} cover(s) to Storage.`
              : "";
          const rf =
            typeof data.rehostFailed === "number" && data.rehostFailed > 0
              ? ` (${data.rehostFailed} cover upload(s) failed; remote URLs kept.)`
              : "";
          addNotification(
            `Promoted ${data.count} book(s) to the catalog.${rh}${rf}`,
            "success",
          );
        } else {
          addNotification(
            `Files merged successfully! (${data.count} items) — opening folder…`,
            "success",
          );
          fetch("/api/open-folder", { method: "POST" }).catch(console.error);
        }
      } else {
        addNotification(`Error: ${data.error}`, 'error');
      }
    } catch {
      addNotification('Failed to merge files', 'error');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="glass shrink-0 z-40 w-full px-6 py-4 flex items-center justify-between h-24 gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {isSupabasePublicConfigured() && !catalogPreviewOpen ? (
            <Link
              href="/ingest-jobs"
              className="shrink-0 text-[10px] font-black uppercase tracking-widest text-violet-300/90 hover:text-violet-200 border border-violet-500/30 rounded-lg px-3 py-2"
            >
              Ingest jobs
            </Link>
          ) : null}
          {products.length > 0 && currentProduct && (
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleReject}
                  className="btn-reject px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:scale-105 transition-all active:scale-95"
                >
                  <XIcon className="w-5 h-5" />
                  Reject
                </button>
                <button 
                  onClick={handleSelect}
                  className="btn-select px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-lg shadow-green-500/10"
                >
                  <CheckIcon className="w-5 h-5" />
                  Accept
                </button>
                {aiEnabled && (
                  <button
                    type="button"
                    onClick={() => void handleAiEnrich()}
                    disabled={aiWorking}
                    className="glass px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border border-violet-500/40 text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
                  >
                    {aiWorking ? "AI…" : "AI suggest"}
                  </button>
                )}
              </div>

              <div className="h-10 w-px bg-white/10 hidden xl:block"></div>

              {/* Live Product Metadata */}
              <div className="hidden xl:flex items-center gap-3">
                {currentProduct.stock_status && (
                  <div className="glass px-3 py-1.5 rounded-lg border-white/5 flex flex-col">
                    <span className="text-[9px] font-black opacity-30 uppercase">Stock</span>
                    <span className={`text-xs font-bold ${currentProduct.stock_status.toLowerCase().includes('in stock') ? 'text-green-400' : 'text-orange-400'}`}>
                      {currentProduct.stock_status}
                    </span>
                  </div>
                )}
                {currentProduct.page_count && (
                  <div className="glass px-3 py-1.5 rounded-lg border-white/5 flex flex-col">
                    <span className="text-[9px] font-black opacity-30 uppercase">Pages</span>
                    <span className="text-xs font-bold">{currentProduct.page_count}</span>
                  </div>
                )}
                {currentProduct.language && (
                  <div className="glass px-3 py-1.5 rounded-lg border-white/5 flex flex-col">
                    <span className="text-[9px] font-black opacity-30 uppercase">Language</span>
                    <span className="text-xs font-bold uppercase">{currentProduct.language}</span>
                  </div>
                )}
                {currentProduct.category && (
                  <div className="glass px-3 py-1.5 rounded-lg border-white/5 flex flex-col max-w-[150px]">
                    <span className="text-[9px] font-black opacity-30 uppercase tracking-tighter">Category</span>
                    <span className="text-xs font-bold truncate opacity-80">{currentProduct.category}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          {products.length > 0 && (
            <div className="hidden lg:flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-black opacity-30 uppercase tracking-tighter">Inventory Progress</span>
              <div className="glass px-3 py-1.5 rounded-xl border-white/5 flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-xs font-medium opacity-50">Total</span>
                  <span className="text-sm font-black text-primary leading-none">{products.length}</span>
                </div>
                <div className="w-px h-6 bg-white/10"></div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium opacity-50">Saved</span>
                  <span className="text-sm font-black text-green-400 leading-none">{selectedItems.length}</span>
                </div>
                <div className="w-px h-6 bg-white/10"></div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium opacity-50">Current</span>
                  <span className="text-sm font-black text-white leading-none">{currentIndex + 1}</span>
                </div>
              </div>
            </div>
          )}
          
          {products.length > 0 ? (
            <div className="flex h-12 items-center gap-2">
              <button 
                onClick={handleSave}
                disabled={isSaving || selectedItems.length === 0}
                className="premium-button px-5 h-full rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-30 disabled:grayscale transition-all hover:shadow-primary/40 shadow-lg"
              >
                {isSaving ? 'Saving...' : 'Save Batches'}
              </button>
              <button 
                onClick={handleMerge}
                disabled={isMerging}
                className="glass px-5 h-full rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {isMerging ? "Publishing…" : "Publish to Catalog"}
              </button>
            </div>
          ) : null}
          {isSupabasePublicConfigured() && !catalogPreviewOpen ? (
            <ProfileMenu email={authEmail} />
          ) : null}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {!sourcesCollapsed ? (
          <aside className="flex max-h-[42vh] min-h-0 shrink-0 flex-col border-b border-white/10 bg-black/25 md:max-h-none md:w-[min(380px,36vw)] md:border-b-0 md:border-r">
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <CatalogSourcesPanel
                enabled={isSupabasePublicConfigured()}
                onCatalogPreviewActiveChange={setCatalogPreviewOpen}
                onImportBooks={(items, meta) => {
                  setProducts(items);
                  setCurrentIndex(0);
                  setSelectedItems([]);
                  if (meta.partIndex != null) {
                    setPartContext({ jobId: meta.jobId, partIndex: meta.partIndex });
                  } else {
                    setPartContext(null);
                  }
                }}
                onNotify={addNotification}
              />
            </div>
          </aside>
        ) : null}

        <button
          type="button"
          title={sourcesCollapsed ? "Show catalog sources" : "Hide catalog sources"}
          aria-expanded={!sourcesCollapsed}
          onClick={() => {
            setSourcesCollapsed((c) => {
              const next = !c;
              if (next) setCatalogPreviewOpen(false);
              return next;
            });
          }}
          className="flex shrink-0 flex-col items-center justify-center gap-1 border-b border-white/10 bg-black/40 px-2 py-2 text-[9px] font-black uppercase tracking-tighter text-white/55 hover:bg-white/10 md:w-10 md:border-b-0 md:border-r md:px-1"
        >
          <span aria-hidden className="text-base leading-none">
            {sourcesCollapsed ? "›" : "‹"}
          </span>
          <span className="max-w-[2.5rem] text-center leading-tight md:max-w-none">
            {sourcesCollapsed ? "Sources" : "Hide"}
          </span>
        </button>

        {/* Right: upload + reviewer */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-full w-full flex-col gap-4 px-4 py-4">

        {products.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-white/10 bg-white/5 m-1">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl premium-button shadow-2xl shadow-primary/20">
              <UploadIcon className="h-12 w-12 text-white" />
            </div>
            <h2 className="mb-3 text-3xl font-black italic">Upload your Dataset</h2>
            <p className="mb-10 max-w-sm text-center text-lg leading-relaxed text-gray-400">
              Drop your JSON file here to begin your ultra-premium review experience.
            </p>
            <label className="premium-button cursor-pointer rounded-2xl px-10 py-4 text-lg font-black shadow-xl transition-all hover:scale-105 active:scale-95">
              Select JSON File
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        ) : currentProduct ? (
          <div key={currentIndex} className="flex-1 min-h-0 fade-in grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-10 items-stretch pb-6 px-2 h-full overflow-hidden">
            {/* Left: Enhanced Image Section */}
            <div className="glass rounded-[2rem] p-4 flex items-center justify-center bg-black/40 border-white/5 shadow-inner overflow-hidden relative group">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05),transparent)] pointer-events-none"></div>
              <div className="h-full w-full flex items-center justify-center overflow-hidden relative">
                {currentProduct.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote catalog URLs; no Image remotePatterns yet
                  <img
                    src={currentProduct.image_url}
                    alt={currentProduct.name}
                    className="max-h-full max-w-full object-contain transition-all duration-1000 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 opacity-30">
                    <div className="w-20 h-20 border-2 border-dashed border-white/30 rounded-full flex items-center justify-center">
                       <UploadIcon className="w-10 h-10" />
                    </div>
                    <span className="text-gray-500 font-black uppercase tracking-widest text-xs">No Visual Data</span>
                  </div>
                )}
                
                {currentProduct.discount_percent && (
                  <div className="absolute top-6 left-6 animate-pulse">
                    <span className="bg-primary px-6 py-2 rounded-xl text-xs font-black tracking-widest uppercase shadow-lg shadow-primary/40 border border-white/20">
                      {currentProduct.discount_percent} Savings
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Refined Details Section */}
            <div className="flex flex-col gap-8 overflow-y-auto pr-4 custom-scrollbar h-full">
              <div className="border-b border-white/10 pb-6">
                <span className="text-sm font-bold text-primary uppercase tracking-[0.2em]">{currentProduct.author || 'Unknown Author'}</span>
                <h2 className="text-3xl lg:text-5xl font-black mt-2 leading-none tracking-tight">{currentProduct.name}</h2>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Current Price</span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-black text-green-400">{currentProduct.sale_price}</span>
                    {currentProduct.original_price && (
                      <span className="text-lg text-gray-500 line-through opacity-50">{currentProduct.original_price}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="badge bg-white/10 border border-white/10 text-xs font-mono">{currentProduct.sku}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                  Description
                </h3>
                <p className="text-gray-400 leading-relaxed text-base italic line-clamp-[12]">
                  {currentProduct.description}
                </p>
              </div>

              {/* Minimal Info Moved to Header */}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <h2 className="text-2xl font-bold">Product not found</h2>
          </div>
        )}
        </div>
        </div>
      </main>
      {/* Bottom Spacer for fixed notification container only */}
      <div className="h-4"></div>
      {/* Notifications */}
      <div className="notification-container">
        {notifications.map(notif => (
          <div key={notif.id} className={`toast toast-${notif.type} glass`}>
            {notif.type === 'success' && <CheckIcon className="w-5 h-5" />}
            {notif.type === 'error' && <XIcon className="w-5 h-5" />}
            {notif.type === 'warning' && <XIcon className="w-5 h-5 opacity-70" />}
            {notif.type === 'info' && <UploadIcon className="w-5 h-5" />}
            <span>{notif.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple Icons
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
