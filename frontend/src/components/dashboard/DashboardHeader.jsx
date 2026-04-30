import "./DashboardHeader.css";

export function DashboardHeader({ username, canWrite, onLogout }) {
  return (
    <header className="hero topbar">
      <div>
        <p className="eyebrow">Mercado Stack</p>
        <h1>Gestao de estoque</h1>
        <p>Cadastro por categoria e movimentação por embalagem (fardo, caixa, unidade).</p>
      </div>
      <div className="session-box">
        <strong>{username}</strong>
        <span>{canWrite ? "Gerente de catálogo" : "Visualizador"}</span>
        <button type="button" className="ghost" onClick={onLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}
