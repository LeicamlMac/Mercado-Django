import "./SectorsSection.css";

export function SectorsSection({ setorAtivoId, setorAtivoNome, setores, onSetorTodos, onSetorSelect, corrigirOrtografiaUI }) {
  return (
    <section className="panel">
      <h2>Setores</h2>
      <p className="hint">
        Setor ativo: <strong>{corrigirOrtografiaUI(setorAtivoNome)}</strong>
      </p>
      <div className="tabs-setores">
        <button
          type="button"
          className={setorAtivoId === "all" ? "tab-setor ativo" : "tab-setor"}
          onClick={onSetorTodos}
        >
          Todos
        </button>
        {setores.map((setor) => (
          <button
            key={setor.id}
            type="button"
            className={String(setor.id) === String(setorAtivoId) ? "tab-setor ativo" : "tab-setor"}
            onClick={() => onSetorSelect(setor.id)}
          >
            {corrigirOrtografiaUI(setor.name)}
          </button>
        ))}
      </div>
    </section>
  );
}
