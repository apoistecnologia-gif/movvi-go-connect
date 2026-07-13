import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/passageiro/login")({
  head: () => ({ meta: [{ title: "Entrar — Passageiro MOVVI DRIVE" }, { name: "robots", content: "noindex" }] }),
  component: PassengerLoginPage,
});

function PassengerLoginPage() {
  const log = (event: string, target: HTMLInputElement) => {
    console.log(`[minimal-login] ${event}`, {
      id: target.id,
      value: target.value,
      length: target.value.length,
      active: document.activeElement === target,
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#111111", padding: 24 }}>
      <h1 style={{ margin: "0 0 16px", fontSize: 22, fontFamily: "Arial, sans-serif" }}>
        Teste mínimo de digitação
      </h1>
      <label htmlFor="email-test" style={{ display: "block", marginBottom: 6, fontFamily: "Arial, sans-serif" }}>
        E-mail teste
      </label>
      <input
        id="email-test"
        name="email-test"
        type="text"
        onFocus={(event) => log("email onFocus", event.currentTarget)}
        onBeforeInput={(event) => log(`email onBeforeInput:${event.nativeEvent.inputType}`, event.currentTarget)}
        onInput={(event) => log("email onInput", event.currentTarget)}
        onChange={(event) => log("email onChange", event.currentTarget)}
        onKeyDown={(event) => console.log("[minimal-login] email onKeyDown", { key: event.key, code: event.code })}
        style={{ boxSizing: "border-box", display: "block", width: "100%", height: 48, marginBottom: 16, border: "1px solid #999", borderRadius: 0, padding: "0 12px", color: "#111", background: "#fff", fontSize: 18, fontFamily: "Arial, sans-serif" }}
      />
      <label htmlFor="password-test" style={{ display: "block", marginBottom: 6, fontFamily: "Arial, sans-serif" }}>
        Senha teste
      </label>
      <input
        id="password-test"
        name="password-test"
        type="password"
        onFocus={(event) => log("password onFocus", event.currentTarget)}
        onBeforeInput={(event) => log(`password onBeforeInput:${event.nativeEvent.inputType}`, event.currentTarget)}
        onInput={(event) => log("password onInput", event.currentTarget)}
        onChange={(event) => log("password onChange", event.currentTarget)}
        onKeyDown={(event) => console.log("[minimal-login] password onKeyDown", { key: event.key, code: event.code })}
        style={{ boxSizing: "border-box", display: "block", width: "100%", height: 48, border: "1px solid #999", borderRadius: 0, padding: "0 12px", color: "#111", background: "#fff", fontSize: 18, fontFamily: "Arial, sans-serif" }}
      />
    </div>
  );
}
