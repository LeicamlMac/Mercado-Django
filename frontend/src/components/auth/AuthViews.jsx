import "./AuthViews.css";

export function AuthLoadingView() {
  return (
    <main className="layout auth-layout">
      <p>Validando sessão...</p>
    </main>
  );
}

export function LoginView({ loginForm, setLoginForm, handleLogin, loginLoading, authError }) {
  return (
    <main className="layout auth-layout">
      <header className="hero">
        <p className="eyebrow">Mercado Stack</p>
        <h1>Entrar</h1>
        <p>Use um usuário cadastrado para acessar o sistema.</p>
      </header>
      <section className="panel auth-card">
        <form className="form-grid" onSubmit={handleLogin}>
          <label>
            Usuário
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
          <div className="actions full-width">
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </form>
        {authError ? <p className="feedback error">{authError}</p> : null}
        <p className="hint">
          Usuários de teste: <code>manager / Manager@123</code> e <code>viewer / Viewer@123</code>
        </p>
      </section>
    </main>
  );
}
