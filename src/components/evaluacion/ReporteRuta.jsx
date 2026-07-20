import { AlertTriangle, Printer } from "lucide-react";
import { Card, Btn, SeqList } from "./ui";
import ScoreBadge from "./ScoreBadge";
import CriteriosBars from "./CriteriosBars";
import { fmtMin } from "./format";

const ESTADO_META = {
  entregado: { label: "Entregado", color: "text-rtb-teal-700" },
  recolectado: { label: "Recolectado", color: "text-sky-700" },
  no_se_pudo: { label: "No se pudo", color: "text-rose-700" },
};

/** Reporte de evaluación de un solo recorrido: cabecera, criterios,
 * orden real vs. óptimo y desglose por punto. `.print-area` es el gancho
 * para "Exportar PDF" (impresión del navegador, ver @media print en
 * src/index.css). */
export default function ReporteRuta({ ev, driverNombre }) {
  if (!ev) return null;
  const totalRuta = ev.realMeasured + ev.totalWait + ev.totalBreak;

  return (
    <Card className="print-area p-4">
      {/* Cabecera de marca — visible solo al imprimir/exportar PDF (el
          reporte es la "cara al exterior" del sistema, ver §2.1 del
          documento de mejoras transversales). En pantalla el reporte
          sigue en el tema oscuro habitual. */}
      <div className="print-brand-border mb-4 hidden items-center gap-3 border-b pb-3 print:flex">
        <img src="/logo-rtb.png" alt="" className="h-12 w-12 shrink-0" />
        <div>
          <p className="print-brand-navy font-display text-sm font-bold">Refacciones Tomás Badillo, S.A. de C.V.</p>
          <p className="print-brand-teal text-xs uppercase tracking-wider">Reporte de evaluación de ruta</p>
        </div>
        <div className="print-brand-navy ml-auto text-right text-xs">
          {ev.nombreRuta && <p className="font-semibold">{ev.nombreRuta}</p>}
          <p className={ev.nombreRuta ? "" : "font-semibold"}>{ev.date}</p>
          <p>{driverNombre || "Sin asignar"}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h3 className="text-sm font-semibold text-rtb-navy">{ev.nombreRuta ? `${ev.nombreRuta} · ` : ""}{ev.date} · {driverNombre || "Sin asignar"}</h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-rtb-navy-mid">
            {ev.n} paradas · ruta {ev.closed ? "cerrada" : "abierta"}
            {ev.estimado && (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <AlertTriangle size={12} /> baja confianza (tramos estimados)
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ScoreBadge score={ev.puntuacionFinal} etiqueta={ev.etiqueta} />
          <Btn variant="ghost" onClick={() => window.print()} className="text-xs">
            <Printer size={14} /> Exportar PDF
          </Btn>
        </div>
      </div>

      {/* Puntuación y metadatos — visibles siempre, pero solo llevan el
          acento dorado de marca dentro del PDF (catch-all de impresión). */}
      <div className="mb-4 hidden items-center justify-between print:flex">
        <p className="print-brand-navy text-xs">
          {ev.n} paradas · ruta {ev.closed ? "cerrada" : "abierta"}
          {ev.estimado && " · baja confianza (tramos estimados)"}
        </p>
        <ScoreBadge score={ev.puntuacionFinal} etiqueta={ev.etiqueta} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Manejo real</div>
          <div className="font-mono text-sm text-rtb-navy">{fmtMin(ev.realMeasured)}</div>
        </div>
        <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Espera total</div>
          <div className="font-mono text-sm text-sky-700">{fmtMin(ev.totalWait)}</div>
        </div>
        {ev.totalBreak > 0 && (
          <div className="rounded-lg border border-rtb-teal-100 bg-white px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Comida</div>
            <div className="font-mono text-sm text-orange-700">{fmtMin(ev.totalBreak)}</div>
          </div>
        )}
        <div className="rounded-lg border border-rtb-gold-300 bg-rtb-gold-50 px-2 py-2 print-brand-surface print-brand-border">
          <div className="text-[10px] uppercase tracking-wider text-rtb-navy-mid">Total ruta</div>
          <div className="font-mono text-sm text-violet-700">{fmtMin(totalRuta)}</div>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-rtb-navy-mid">Criterios</h4>
        <CriteriosBars criterios={ev.criterios} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-700">Orden que hizo</div>
          <SeqList names={ev.realNames} closed={ev.closed} />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-rtb-gold-700">Orden óptimo sugerido</div>
          <SeqList names={ev.optNames} closed={ev.closed} />
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-rtb-navy-mid">Desglose por punto</h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="text-rtb-navy-mid">
                <th className="pb-1.5 pr-2 font-medium">Punto</th>
                <th className="pb-1.5 pr-2 font-medium">Dirección</th>
                <th className="pb-1.5 pr-2 font-medium">Traslado (real / esperado)</th>
                <th className="pb-1.5 pr-2 font-medium">Espera (real / habitual)</th>
                <th className="pb-1.5 pr-2 font-medium">Estado</th>
                <th className="pb-1.5 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {ev.stops.map((st, i) => {
                const estado = st.estado ? ESTADO_META[st.estado] : null;
                return (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="py-1.5 pr-2 text-rtb-navy">{st.name}</td>
                    <td className="py-1.5 pr-2 text-rtb-navy-mid">{st.direccion || "—"}</td>
                    <td className="py-1.5 pr-2 font-mono text-rtb-navy-mid">
                      {st.legMinReal != null ? `${Math.round(st.legMinReal)}m` : "—"}
                      {st.legMinEsperado != null && (
                        <span className="text-slate-400"> / {Math.round(st.legMinEsperado)}m{!st.legLearned && "≈"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-rtb-navy-mid">
                      {st.waitMinReal != null ? `${Math.round(st.waitMinReal)}m` : "—"}
                      {st.waitHabitual != null && <span className="text-slate-400"> / {Math.round(st.waitHabitual)}m</span>}
                    </td>
                    <td className={`py-1.5 pr-2 ${estado?.color || "text-slate-400"}`}>{estado?.label || "—"}</td>
                    <td className="py-1.5 text-rtb-navy-mid">{st.nota || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
