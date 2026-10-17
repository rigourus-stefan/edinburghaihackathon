export default function Scanning({ photo }) {
  return (
    <div className="card scanning">
      <div className="scan-frame">
        {photo && <img src={photo} alt="" />}
        <div className="scan-line" />
      </div>
      <h2 className="pulse">The book is reading you…</h2>
      <p className="muted">Looking at your glasses, hair, expression and clothes</p>
    </div>
  )
}
