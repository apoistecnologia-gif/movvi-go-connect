import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico — MOVVI" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: DiagnosticoPage,
});

function DiagnosticoPage() {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
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
    const t = new Date().toISOString().slice(11, 23);
    setEvents((prev) => [`${t} ${msg}`, ...prev].slice(0, 30));
  }

  useEffect(() => {
    function refresh() {
      const vv = window.visualViewport;
      setViewport({
        innerH: window.innerHeight,
        innerW: window.innerWidth,
        visualH: vv ? Math.round(vv.height) : 0,
        visualOffsetTop: vv ? Math.round(vv.offsetTop) : 0,
      });
    }
    refresh();
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, []);

  // Heurística: se visualViewport.height < innerHeight * 0.8, teclado provavelmente aberto.
  const keyboardLikelyOpen =
    viewport.visualH > 0 && viewport.visualH < viewport.innerH * 0.8;
  const keyboardHeight = keyboardLikelyOpen
    ? viewport.innerH - viewport.visualH
    : 0;

  // Modo de ajuste: com adjustPan o innerHeight NÃO muda quando o teclado abre;
  // com adjustResize o innerHeight ENCOLHE. Comparamos com a altura inicial.
  const [initialInnerH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const heightShrunk = viewport.innerH < initialInnerH - 40;
  const adjustMode = keyboardLikelyOpen
    ? heightShrunk
      ? "adjustResize (innerHeight encolheu)"
      : "adjustPan (innerHeight estável, visualViewport encolheu)"
    : "sem teclado";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0b0b0d",
        color: "#f4f4f5",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Diagnóstico do teclado</h1>

      <section style={card}>
        <label style={label} htmlFor="diag-email">
          E-mail (digite aqui)
        </label>
        <input
          id="diag-email"
          ref={inputRef}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            log(`input len=${e.target.value.length}`);
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
        <button
          type="button"
          onClick={() => programaticFill(inputRef.current, setEmail, log, setFillReport)}
          style={btnStyle}
        >
          Preencher com “teste123” e manter foco
        </button>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
          <div>
            valor atual:{" "}
            <code style={code}>{email || "(vazio)"}</code>{" "}
            <span style={{ opacity: 0.6 }}>({email.length} chars)</span>
          </div>
          <div>foco: <code style={code}>{focus}</code></div>
          <div>cursor: <code style={code}>{fillReport}</code></div>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>Modo de ajuste</h2>
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

      <section style={card}>
        <h2 style={h2}>Viewport</h2>
        <div style={row}><span>innerWidth × innerHeight:</span><b>{viewport.innerW} × {viewport.innerH}</b></div>
        <div style={row}><span>innerHeight inicial:</span><b>{initialInnerH}</b></div>
        <div style={row}><span>visualViewport.height:</span><b>{viewport.visualH}</b></div>
        <div style={row}><span>visualViewport.offsetTop:</span><b>{viewport.visualOffsetTop}</b></div>
        <div style={row}><span>devicePixelRatio:</span><b>{typeof window !== "undefined" ? window.devicePixelRatio : "-"}</b></div>
      </section>

      <section style={card}>
        <h2 style={h2}>Eventos recentes</h2>
        <pre style={{
          margin: 0,
          fontSize: 12,
          maxHeight: 200,
          overflow: "auto",
          background: "#000",
          padding: 8,
          borderRadius: 6,
          whiteSpace: "pre-wrap",
        }}>
          {events.length ? events.join("\n") : "(nenhum evento)"}
        </pre>
      </section>

      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>
        Rota isolada de diagnóstico. Não usa Supabase, roteamento aninhado ou componentes do app.
      </p>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#141418",
  border: "1px solid #26262b",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
};
const h2: React.CSSProperties = { fontSize: 14, margin: "0 0 8px", opacity: 0.9 };
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
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
  height: 44,
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
};
const btnStyle: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  height: 40,
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
 * (para React "ver" a mudança via evento 'input'), mantém o foco no campo e
 * amostra por 2s se document.activeElement continua sendo o input — proxy
 * para "cursor continua piscando" (o caret só pisca em elemento focado e
 * editável).
 */
function programaticFill(
  el: HTMLInputElement | null,
  setEmail: (v: string) => void,
  log: (m: string) => void,
  setFillReport: (m: string) => void,
) {
  if (!el) {
    setFillReport("input ausente");
    log("fill: input ausente");
    return;
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
  } catch { /* type=email: setSelectionRange pode lançar em alguns browsers */ }
  setEmail(el.value);
  log(`fill: valor="${el.value}" foco=${document.activeElement === el}`);

  const start = performance.now();
  let ticks = 0;
  let stillFocused = 0;
  const iv = window.setInterval(() => {
    ticks++;
    if (document.activeElement === el) stillFocused++;
    if (performance.now() - start >= 2000) {
      window.clearInterval(iv);
      const ratio = stillFocused / ticks;
      const blinking = ratio >= 0.9; // manteve foco em ≥90% das amostras
      setFillReport(
        blinking
          ? `piscando (foco mantido em ${stillFocused}/${ticks} amostras)`
          : `foco perdido (${stillFocused}/${ticks} amostras)`,
      );
      log(`fill.check: foco ${stillFocused}/${ticks} → ${blinking ? "piscando" : "não piscando"}`);
    }
  }, 200);
}
