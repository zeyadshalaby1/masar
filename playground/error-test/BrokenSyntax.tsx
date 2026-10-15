// Broken on purpose for /errors: a syntax error Vite cannot compile. Outside src/, so tsc ignores it.
export default function BrokenSyntax() {
  return <div className="card">{items.map((item) => <span>{item}</span>}</div>
}
