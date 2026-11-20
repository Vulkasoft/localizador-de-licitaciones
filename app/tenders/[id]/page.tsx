'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Euro, Calendar, MapPin, FileText, Tag, Target, ExternalLink, Star, Heart, Award, Download, ScrollText, AlertTriangle, Loader2, Search, RefreshCw, FolderOpen, Trash2, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CLASSIFICATION_LABELS } from '@/lib/scoring';
import { getScoreColor } from '@/lib/spain-geo';
import { Button } from '@/components/ui/button';
import { TenderTracking } from '@/components/tender-tracking';
import { TenderCustomerAssign } from '@/components/tender-customer-assign';
import { TenderBudgets } from '@/components/tender-budgets';

export default function TenderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dismissingDetail, setDismissingDetail] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisLabel, setAnalysisLabel] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const analyzeDoc = useCallback(async (tenderId: string, doc: 'technical' | 'admin', label: string) => {
    setAnalyzing(label);
    setAnalysisError(null);
    setAnalysisResult(null);
    setAnalysisLabel(doc === 'technical' ? 'Pliego de Prescripciones Técnicas' : 'Pliego de Cláusulas Administrativas');
    setAnalysisOpen(true);
    try {
      const res = await fetch(`/api/tenders/${encodeURIComponent(tenderId)}/analyze-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnalysisError(j?.error || 'No se pudo analizar el documento. Inténtalo de nuevo.');
      } else {
        setAnalysisResult(j?.analysis || '');
        if (j?.docLabel) setAnalysisLabel(j.docLabel);
      }
    } catch {
      setAnalysisError('Error de conexión al analizar el documento.');
    }
    setAnalyzing(null);
  }, []);

  const downloadDoc = useCallback(async (tenderId: string, doc: 'technical' | 'admin', fallbackUrl: string, label: string) => {
    setDownloading(label);
    setDocError(null);
    try {
      const res = await fetch(`/api/proxy-doc?tenderId=${encodeURIComponent(tenderId)}&doc=${doc}`, { redirect: 'follow' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDocError(j?.error || 'No se pudo descargar el documento. Abriendo en PLACSP...');
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      } else {
        // Got the PDF (signed URL was followed) — turn into blob download
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${label}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      setDocError('Error de conexión. Abriendo en PLACSP...');
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
    setTimeout(() => setDownloading(null), 800);
  }, []);

  const downloadDirect = useCallback((url: string, label: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const enrichDocs = useCallback(async (tenderId: string) => {
    setEnriching(true);
    setEnrichResult(null);
    setDocError(null);
    try {
      const res = await fetch('/api/enrich-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setDocError(j?.error || 'Error al buscar documentos');
      } else {
        const r = j.results?.[0];
        if (r && r.docsFound > 0) {
          setEnrichResult(`Se encontraron ${r.docsFound} documento(s). Recargando...`);
          // Reload tender data
          setTimeout(() => {
            fetch(`/api/tenders/${tenderId}`).then(r => r.json()).then(d => {
              setData(d);
              setEnrichResult(`${r.docsFound} documento(s) indexados correctamente`);
            });
          }, 500);
        } else {
          setEnrichResult('No se encontraron documentos adicionales en la ficha PLACSP');
        }
      }
    } catch {
      setDocError('Error de conexión al buscar documentos');
    }
    setEnriching(false);
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/tenders/${params.id}`)
      .then((r: any) => r?.json?.())
      .then((d: any) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params?.id]);

  if (loading) return <div className="space-y-4 max-w-[1000px] mx-auto">{[1,2,3].map((i: number) => <div key={i} className="h-32 bg-muted/50 rounded-xl animate-pulse" />)}</div>;
  if (!data?.tender) return <div className="text-center py-20"><p className="text-muted-foreground">Licitación no encontrada</p><Link href="/tenders" className="text-sky-500 text-sm mt-2 inline-block">Volver a licitaciones</Link></div>;

  const t = data?.tender;
  const bd = data?.breakdown;
  const lots = (() => { try { return JSON.parse(t?.lotsJson ?? '[]'); } catch { return []; } })();
  const allDocs: any[] = (() => { try { return JSON.parse(t?.documentsJson ?? '[]'); } catch { return []; } })();
  const additionalDocs = allDocs.filter((d: any) => d?.url !== t?.technicalDocUrl && d?.url !== t?.adminDocUrl);
  const hasAnyDocs = !!(t?.technicalDocUrl || t?.adminDocUrl || allDocs.length > 0);

  // Categorize documents
  const docCategories: Record<string, any[]> = {};
  for (const doc of additionalDocs) {
    const cat = doc?.category || 'otro';
    if (!docCategories[cat]) docCategories[cat] = [];
    docCategories[cat].push(doc);
  }
  const CATEGORY_COLORS: Record<string, string> = {
    adjudicacion: 'text-orange-500', formalizacion: 'text-green-500', memoria: 'text-blue-500',
    informe: 'text-purple-500', especificaciones: 'text-teal-500', resolucion: 'text-red-500',
    acta: 'text-indigo-500', otro: 'text-gray-500',
  };
  const CATEGORY_LABELS: Record<string, string> = {
    pliego_tecnico: 'Pliego Técnico', pliego_admin: 'Pliego Administrativo',
    adjudicacion: 'Adjudicación', formalizacion: 'Formalización', memoria: 'Memoria',
    informe: 'Informe', especificaciones: 'Especificaciones Técnicas', resolucion: 'Resolución',
    acta: 'Acta', otro: 'Documento',
  };

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/tenders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="w-4 h-4" /> Volver a licitaciones
        </Link>
        <button
          onClick={async () => {
            if (!confirm('¿Descartar esta licitación? No volverá a aparecer en las búsquedas.')) return;
            setDismissingDetail(true);
            try {
              const res = await fetch('/api/tenders/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenderId: params?.id }) });
              if (res.ok) { toast.success('Licitación descartada'); router.push('/tenders'); }
              else toast.error('Error al descartar');
            } catch { toast.error('Error al descartar'); }
            setDismissingDetail(false);
          }}
          disabled={dismissingDetail}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-500/10 transition disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" /> Descartar
        </button>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center font-mono font-bold text-xl text-white flex-shrink-0" style={{ backgroundColor: getScoreColor(t?.score ?? 0) }}>
            {t?.score ?? 0}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-display font-bold tracking-tight">{t?.title ?? ''}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {t?.classification && <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-medium">{CLASSIFICATION_LABELS[t.classification] ?? t.classification}</span>}
              {t?.isMinorContract && <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 text-xs font-medium">Contrato Menor</span>}
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-medium">{t?.status ?? 'active'}</span>
            </div>
          </div>
        </div>
        {t?.sourceUrl && <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 mt-4 text-sm text-sky-600 hover:underline"><ExternalLink className="w-4 h-4" /> Ver en fuente original</a>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-sky-500" /> Descripción</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t?.description ?? 'Sin descripción disponible'}</p>
          </div>

          {/* Documentación Oficial */}
          <div className="bg-card rounded-xl p-5 border-2 border-sky-500/20" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-sky-500" /> Documentación Oficial
              </h2>
              <span className="text-xs bg-sky-500/10 text-sky-600 px-2 py-0.5 rounded-full font-medium">
                {allDocs.length > 0 ? `${allDocs.length} doc${allDocs.length > 1 ? 's' : ''}` : 'Sin indexar'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Documentos extraídos de la Plataforma de Contratación del Sector Público</p>

            {/* Status messages */}
            {docError && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{docError}</span>
              </div>
            )}
            {enrichResult && (
              <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{enrichResult}</span>
              </div>
            )}

            {/* Search documents button — always shown when docs are missing */}
            {allDocs.length === 0 && t?.sourceUrl && (
              <button
                onClick={() => enrichDocs(t.id)}
                disabled={enriching}
                className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 disabled:opacity-70 text-white text-sm font-semibold transition shadow-lg shadow-sky-500/20"
              >
                {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {enriching ? 'Buscando documentos en PLACSP...' : 'Buscar todos los documentos en PLACSP'}
              </button>
            )}

            <div className="space-y-3">
              {/* Pliego Técnico */}
              <div className={`rounded-xl p-4 flex items-center gap-4 transition ${t?.technicalDocUrl ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-muted/50 border border-border/60'}`}>
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${t?.technicalDocUrl ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  <FileText className={`w-5 h-5 sm:w-6 sm:h-6 ${t?.technicalDocUrl ? 'text-emerald-600' : 'text-muted-foreground/50'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Pliego de Prescripciones Técnicas</p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Especificaciones técnicas, requisitos y criterios</p>
                </div>
                {t?.technicalDocUrl ? (
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <button onClick={() => downloadDoc(t.id, 'technical', t.technicalDocUrl!, 'Pliego_Tecnico')} disabled={downloading === 'Pliego_Tecnico'} className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition">
                      {downloading === 'Pliego_Tecnico' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} <span className="hidden sm:inline">Descargar</span> PDF
                    </button>
                    <button onClick={() => analyzeDoc(t.id, 'technical', 'Pliego_Tecnico')} disabled={analyzing === 'Pliego_Tecnico'} className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-600 hover:from-indigo-600 hover:to-fuchsia-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition">
                      {analyzing === 'Pliego_Tecnico' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analizar<span className="hidden sm:inline"> con IA</span>
                    </button>
                  </div>
                ) : t?.sourceUrl ? (
                  <button onClick={() => enrichDocs(t.id)} disabled={enriching} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition flex-shrink-0">
                    {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground italic flex-shrink-0">No disponible</span>
                )}
              </div>

              {/* Pliego Administrativo */}
              <div className={`rounded-xl p-4 flex items-center gap-4 transition ${t?.adminDocUrl ? 'bg-violet-500/5 border border-violet-500/20' : 'bg-muted/50 border border-border/60'}`}>
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${t?.adminDocUrl ? 'bg-violet-500/10' : 'bg-muted'}`}>
                  <ScrollText className={`w-5 h-5 sm:w-6 sm:h-6 ${t?.adminDocUrl ? 'text-violet-600' : 'text-muted-foreground/50'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Pliego de Cláusulas Administrativas</p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Condiciones contractuales, plazos y garantías</p>
                </div>
                {t?.adminDocUrl ? (
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <button onClick={() => downloadDoc(t.id, 'admin', t.adminDocUrl!, 'Pliego_Administrativo')} disabled={downloading === 'Pliego_Administrativo'} className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition">
                      {downloading === 'Pliego_Administrativo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} <span className="hidden sm:inline">Descargar</span> PDF
                    </button>
                    <button onClick={() => analyzeDoc(t.id, 'admin', 'Pliego_Administrativo')} disabled={analyzing === 'Pliego_Administrativo'} className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-600 hover:from-indigo-600 hover:to-fuchsia-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition">
                      {analyzing === 'Pliego_Administrativo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analizar<span className="hidden sm:inline"> con IA</span>
                    </button>
                  </div>
                ) : t?.sourceUrl ? (
                  <button onClick={() => enrichDocs(t.id)} disabled={enriching} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-70 text-white text-xs sm:text-sm font-medium transition flex-shrink-0">
                    {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground italic flex-shrink-0">No disponible</span>
                )}
              </div>
            </div>

            {/* All additional documents by category */}
            {additionalDocs.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-sky-500" />
                  <p className="text-sm font-semibold">Todos los documentos ({additionalDocs.length})</p>
                </div>
                {Object.entries(docCategories).map(([cat, docs]) => (
                  <div key={cat}>
                    <p className={`text-xs font-medium mb-1.5 ${CATEGORY_COLORS[cat] || 'text-muted-foreground'}`}>
                      {CATEGORY_LABELS[cat] || cat} ({docs.length})
                    </p>
                    <div className="space-y-1.5">
                      {docs.map((doc: any, i: number) => (
                        <button key={i} onClick={() => downloadDirect(doc?.url || doc, doc?.name || `Doc_${i}`)} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50 border border-border/60 hover:bg-muted hover:border-sky-500/30 transition text-sm w-full text-left group">
                          <FileText className={`w-4 h-4 flex-shrink-0 ${CATEGORY_COLORS[cat] || 'text-muted-foreground'}`} />
                          <div className="flex-1 min-w-0">
                            <span className="truncate block text-xs sm:text-sm">{doc?.name || `Documento ${i + 1}`}</span>
                            {doc?.date && <span className="text-[10px] text-muted-foreground">{doc.date}</span>}
                          </div>
                          <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-sky-500 transition ml-auto flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Re-scan button if docs already loaded */}
            {allDocs.length > 0 && t?.sourceUrl && (
              <button
                onClick={() => enrichDocs(t.id)}
                disabled={enriching}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition"
              >
                {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Volver a escanear documentos
              </button>
            )}

            {/* PLACSP link */}
            {t?.sourceUrl && (
              <div className="mt-3 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20 flex items-start gap-2">
                <ExternalLink className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-sky-700 dark:text-sky-400">
                  <p className="font-medium">Ficha oficial en PLACSP</p>
                  <p className="mt-0.5">Verifica siempre los documentos en la <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline font-semibold hover:text-sky-600">fuente oficial</a> antes de preparar ofertas.</p>
                </div>
              </div>
            )}
          </div>

          {/* Score Breakdown */}
          <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-sky-500" /> Desglose de Puntuación</h2>
            <div className="space-y-2">
              {[
                { label: 'CPV drones (34711200/35613000)', value: bd?.cpvMatch ?? 0, max: 30 },
                { label: 'Palabras clave en título', value: bd?.keywordTitle ?? 0, max: 25 },
                { label: 'Palabras clave en descripción', value: bd?.keywordDescription ?? 0, max: 20 },
                { label: 'Formación + dron/UAS', value: bd?.formacionDron ?? 0, max: 25 },
                { label: 'Sensores (térmica/RTK/LiDAR)', value: bd?.sensorKeyword ?? 0, max: 20 },
                { label: 'Tipo comprador (seguridad)', value: bd?.buyerType ?? 0, max: 20 },
                { label: 'Lotes formación/mantenimiento', value: bd?.lotsFormacion ?? 0, max: 15 },
                { label: 'Presupuesto DJI Enterprise', value: bd?.budgetRange ?? 0, max: 10 },
                { label: 'Plazo > 7 días', value: bd?.deadlineOk ?? 0, max: 10 },
              ].map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-52 flex-shrink-0">{item?.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${((item?.value ?? 0) / (item?.max ?? 1)) * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">{item?.value > 0 ? `+${item.value}` : '0'}/{item?.max}</span>
                </div>
              ))}
              {(bd?.espectaculoPenalty ?? 0) < 0 && <div className="text-xs text-red-500">Penalización espectáculo/ocio: {bd?.espectaculoPenalty}</div>}
              {(bd?.cuasPenalty ?? 0) < 0 && <div className="text-xs text-red-500">Penalización C-UAS: {bd?.cuasPenalty}</div>}
              <div className="pt-2 border-t mt-2 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-mono font-bold" style={{ color: getScoreColor(bd?.total ?? 0) }}>{bd?.total ?? 0}/100</span>
              </div>
            </div>
          </div>

          {/* Lots */}
          {(lots ?? []).length > 0 && (
            <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-sky-500" /> Lotes</h2>
              <div className="space-y-2">
                {(lots ?? []).map((lot: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm">{lot?.title ?? `Lote ${i + 1}`}</span>
                    {lot?.budget && <span className="text-sm font-mono text-muted-foreground">{Number(lot.budget).toLocaleString('es-ES')}€</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related */}
          {(data?.relatedTenders ?? []).length > 0 && (
            <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <h2 className="font-display font-semibold mb-3">Licitaciones Relacionadas</h2>
              <div className="space-y-2">
                {(data?.relatedTenders ?? []).map((r: any) => (
                  <Link key={r?.id} href={`/tenders/${r?.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs text-white" style={{ backgroundColor: getScoreColor(r?.score ?? 0) }}>{r?.score ?? 0}</div>
                    <span className="text-sm truncate">{r?.title ?? ''}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Cliente asignado */}
          <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <TenderCustomerAssign tenderId={t.id} initialCustomer={t?.customer ?? null} />
          </div>

          {/* Presupuestos vinculados */}
          <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <TenderBudgets tenderId={t.id} tenderTitle={t?.title ?? undefined} />
          </div>

          <div className="bg-card rounded-xl p-5 space-y-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <InfoRow icon={Building2} label="Organismo" value={t?.contractingBody ?? ''} />
            <InfoRow icon={Tag} label="Tipo comprador" value={t?.buyerType ?? 'N/D'} />
            <InfoRow icon={Euro} label="Presupuesto" value={`${(t?.budgetAmount ?? 0).toLocaleString('es-ES')} ${t?.budgetCurrency ?? 'EUR'}`} />
            <InfoRow icon={Calendar} label="Plazo" value={t?.deadline ? new Date(t.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/D'} />
            <InfoRow icon={Calendar} label="Publicación" value={t?.publicationDate ? new Date(t.publicationDate).toLocaleDateString('es-ES') : 'N/D'} />
            <InfoRow icon={MapPin} label="Ubicación" value={[t?.municipality, t?.province, t?.regionCcaa].filter(Boolean).join(', ')} />
            <InfoRow icon={FileText} label="CPV" value={t?.cpvCodes ?? 'N/D'} />
            <InfoRow icon={FileText} label="Fuente" value={t?.source === 'PLACSP_ATOM' ? 'PLACSP (Datos Oficiales)' : t?.source === 'LLM_SEARCH' ? 'Búsqueda IA' : t?.source ?? 'PLACSP'} />
          </div>

          {/* Buyer Profile */}
          {data?.buyer && (
            <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-sky-500" /> Perfil del Comprador</h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{data.buyer?.name ?? ''}</p>
                <p className="text-muted-foreground">Tipo: {data.buyer?.type ?? 'N/D'}</p>
                <p className="text-muted-foreground">Región: {data.buyer?.region ?? 'N/D'}</p>
                <p className="text-muted-foreground">Licitaciones históricas: {data.buyer?.tenderCount ?? 0}</p>
              </div>
            </div>
          )}

          {/* Seguimiento y Alarmas */}
          <div className="bg-card rounded-xl p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <TenderTracking tenderId={t.id} tenderTitle={t?.title ?? undefined} />
          </div>
        </div>
      </div>

      {/* Modal de análisis con IA */}
      {analysisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm" onClick={() => setAnalysisOpen(false)}>
          <div className="bg-card w-full max-w-3xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Análisis con IA</p>
                <p className="text-xs text-muted-foreground truncate">{analysisLabel ?? ''}</p>
              </div>
              <button onClick={() => setAnalysisOpen(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {analyzing ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-muted-foreground">Analizando el documento con IA...<br/>Esto puede tardar hasta un par de minutos.</p>
                </div>
              ) : analysisError ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                  <p className="text-sm text-muted-foreground max-w-sm">{analysisError}</p>
                </div>
              ) : (
                <SimpleMarkdown text={analysisResult ?? ''} />
              )}
            </div>
            {!analyzing && !analysisError && (
              <div className="px-5 py-3 border-t border-border flex-shrink-0 text-[11px] text-muted-foreground italic">
                Resumen generado por IA a partir del documento. Verifica siempre los datos con el pliego original.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let key = 0;

  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
    );
  };

  const flushList = () => {
    if (listItems.length) {
      elements.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1 my-2 text-sm">
          {listItems.map((li, i) => <li key={i}>{renderInline(li)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const content = line.replace(/^#{1,3}\s/, '');
      elements.push(<h3 key={`h-${key++}`} className="font-semibold text-base mt-4 mb-1.5">{renderInline(content)}</h3>);
    } else if (/^[-*]\s/.test(line)) {
      listItems.push(line.replace(/^[-*]\s/, ''));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={`p-${key++}`} className="text-sm my-1.5 leading-relaxed">{renderInline(line)}</p>);
    }
  }
  flushList();
  return <div className="text-foreground">{elements}</div>;
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || 'N/D'}</p>
      </div>
    </div>
  );
}
