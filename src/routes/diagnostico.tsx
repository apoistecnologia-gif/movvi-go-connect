import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DevOrAdminGuard } from "@/components/DevOrAdminGuard";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico — APOIS" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: () => (
    <DevOrAdminGuard>
      <DiagnosticoPage />
    </DevOrAdminGuard>
  ),
});

function DiagnosticoPage() {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fillIntervalRef = useRef<number | null>(null);
  const [fillReport, setFillReport] = useState<string>("(sem preenchimento)");
  const [viewport, setViewport] = useState({
    innerH: 0,
    innerW: 0,
    visualH: 0,
    visualOffsetTop: 0,
  });
  const [focus, setFocus] = useState<string>("(nenhum)");
  const [events, setEvents] = useState<string[]>([]);

  function log(msg: string) {
    const safeMessage = String(msg ?? "").slice(0, 200);
    const t = new Date().toISOString().slice(11, 23);
    setEvents((prev) => [`${t} ${safeMessage}`, ...prev].slice(0, 30));
  }

  useEffect(() => {
    function refresh() {
      const vv = window.visualViewport;
      setViewport({
        innerH: Math.max(0, Math.round(window.innerHeight || 0)),
        innerW: Math.max(0, Math.round(window.innerWidth || 0)),
        visualH: vv ? Math.max(0, Math.round(vv.height || 0)) : 0,
        visualOffsetTop: vv ? Math.max(0, Math.round(vv.offsetTop || 0)) : 0,
      });
    }
    refresh();
    window.addEventListener("resize", refresh, { passive: true });
    window.visualViewport?.addEventListener("resize", refresh, { passive: true });
    window.visualViewport?.addEventListener("scroll", refresh, { passive: true });
    return () => {
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
      if (fillIntervalRef.current != null) {
        window.clearInterval(fillIntervalRef.current);
        fillIntervalRef.current = null;
      }
    };
  }, []);

  const keyboardLikelyOpen =
    viewport.innerH > 0 && viewport.visualH > 0 && viewport.visualH < viewport.innerH * 0.8;
  const keyboardHeight = keyboardLikelyOpen
    ? Math.max(0, viewport.innerH - viewport.visualH)
    : 0;

  const [initialInnerH] = useState(() =>
    typeof window !== "undefined" ? Math.max(0, Math.round(window.innerHeight || 0)) : 0,
  );
  const heightShrunk = initialInnerH > 0 && viewport.innerH < initialInnerH - 40;
  const adjustMode = keyboardLikelyOpen
    ? heightShrunk
      ? "adjustResize (innerHeight encolheu)"
      : "adjustPan (innerHeight estável, visualViewport encolheu)"
    : "sem teclado";

  function runFillDiagnostic() {
    if (fillIntervalRef.current != null) {
      window.clearInterval(fillIntervalRef.current);
      fillIntervalRef.current = null;
    }
    fillIntervalRef.current = programmaticFill(inputRef.current, setEmail, log, setFillReport);
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        minWidth: 0,
        overflowX: "hidden",
        background: "#0b0b0d",
        color: "#f4f4f5",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Diagnóstico do teclado</h1>

      <section style={card} aria-labelledby="diag-input-title">
        <h2 id="diag-input-title" style={h2}>Campo de teste</h2>
        <label style={label} htmlFor="diag-email">
          E-mail (digite aqui)
        </label>
        <input
          id="diag-email"
          ref={inputRef}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-form-type="other"
          value={email}
          maxLength={254}
          onChange={(event) => {
            const next = event.target.value.slice(0, 254);
            setEmail(next);
            log(`input len=${next.length}`);
          }}
          onFocus={() => {
            setFocus("email");
            log("focus email");
          }}
          onBlur={() => {
            setFocus("(nenhum)");
            log("blur email");
          }}
          placeholder="voce@exemplo.com"
          style={inputStyle}
        />
        <button type="button" onClick={runFillDiagnostic} style={btnStyle}>
          Preencher com “teste123” e manter foco
        </button>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }} aria-live="polite">
          <div>
            valor atual: <code style={code}>{email || "(vazio)"}</code>{" "}
            <span style={{ opacity: 0.7 }}>({email.length} chars)</span>
          </div>
          <div>foco: <code style={code}>{focus}</code></div>
          <div>cursor: <code style={code}>{fillReport}</code></div>
        </div>
      </section>

      <section style={card} aria-labelledby="diag-adjust-title">
        <h2 id="diag-adjust-title" style={h2}>Modo de ajuste</h2>
        <div style={row}><span>Estado:</span><b>{adjustMode}</b></div>
        <div style={row}>
          <span>Teclado provavelmente aberto:</span>
          <b>{keyboardLikelyOpen ? "sim" : "não"}</b>
        </div>
        <div style={row}>
          <span>Altura estimada do teclado:</span>
          <b>{keyboardHeight}px</b>
        </div>
      </section>

      <section style={card} aria-labelledby="diag-viewport-title">
        <h2 id="diag-viewport-title" style={h2}>Viewport</h2>
        <div style={row}><span>innerWidth × innerHeight:</span><b>{viewport.innerW} × {viewport.innerH}</b></div>
        <div style={row}><span>innerHeight inicial:</span><b>{initialInnerH}</b></div>
        <div style={row}><span>visualViewport.height:</span><b>{viewport.visualH}</b></div>
        <div style={row}><span>visualViewport.offsetTop:</span><b>{viewport.visualOffsetTop}</b></div>
        <div style={row}>
          <span>devicePixelRatio:</span>
          <b>{typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : "-"}</b>
        </div>
      </section>

      <section style={card} aria-labelledby="diag-events-title">
        <h2 id="diag-events-title" style={h2}>Eventos recentes</h2>
        <pre
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: 12,
            maxHeight: 200,
            maxWidth: "100%",
            overflow: "auto",
            background: "#000",
            padding: 8,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {events.length ? events.join("\n") : "(nenhum evento)"}
        </pre>
      </section>

      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 16, lineHeight: 1.5 }}>
        Rota isolada de diagnóstico. Não usa Supabase, roteamento aninhado ou componentes operacionais do app.
      </p>
    </main>
  );
}

const card: React.CSSProperties = {
  background: "#141418",
  border: "1px solid #26262b",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  minWidth: 0,
};
const h2: React.CSSProperties = { fontSize: 14, margin: "0 0 8px", opacity: 0.9 };
const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  fontSize: 13,
  lineHeight: 1.5,
  padding: "2px 0",
  gap: 12,
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  marginBottom: 6,
  opacity: 0.85,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #3a3a42",
  background: "#0b0b0d",
  color: "#f4f4f5",
  outline: "none",
  boxSizing: "border-box",
};
const code: React.CSSProperties = {
  background: "#000",
  padding: "1px 6px",
  borderRadius: 4,
  fontFamily: "ui-monospace, Menlo, monospace",
  overflowWrap: "anywhere",
};
const btnStyle: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  minHeight: 44,
  padding: "8px 12px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid #b91c1c",
  background: "#dc2626",
  color: "#fff",
  cursor: "pointer",
};

/**
 * Preenche o campo com "teste123" usando o setter nativo do HTMLInputElement
 * e amostra por 2s se document.activeElement continua sendo o input.
 */
function programmaticFill(
  el: HTMLInputElement | null,
  setEmail: (value: string) => void,
  log: (message: string) => void,
  setFillReport: (message: string) => void,
): number | null {
  if (!el) {
    setFillReport("input ausente");
    log("fill: input ausente");
    return null;
  }
  const proto = window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  if (nativeSetter) nativeSetter.call(el, "teste123");
  else el.value = "teste123";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  try {
    el.setSelectionRange(el.value.length, el.value.length);
  } catch {
    // Alguns tipos de input não aceitam setSelectionRange.
  }
  setEmail(el.value);
  log(`fill: valor="${el.value}" foco=${document.activeElement === el}`);

  const start = performance.now();
  let ticks = 0;
  let stillFocused = 0;
  const intervalId = window.setInterval(() => {
    ticks += 1;
    if (document.activeElement === el) stillFocused += 1;
    if (performance.now() - start >= 2000) {
      window.clearInterval(intervalId);
      const ratio = ticks > 0 ? stillFocused / ticks : 0;
      const blinking = ratio >= 0.9;
      setFillReport(
        blinking
          ? `piscando (foco mantido em ${stillFocused}/${ticks} amostras)`
          : `foco perdido (${stillFocused}/${ticks} amostras)`,
      );
      log(`fill.check: foco ${stillFocused}/${ticks} → ${blinking ? "piscando" : "não piscando"}`);
    }
  }, 200);
  return intervalId;
}
