import "./ThemeToggleButton.css";

export function ThemeToggleButton({ theme, onToggle }) {
  return (
    <button type="button" className="theme-toggle" onClick={onToggle}>
      {theme === "dark" ? "Claro" : "Escuro"}
    </button>
  );
}
