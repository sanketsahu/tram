import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

function Home() {
  return <div><h1>Home</h1><Link to="/about">Go to About</Link></div>
}

function About() {
  return <div><h1>About</h1><Link to="/">Go Home</Link></div>
}

export default function App() {
  return (
    <BrowserRouter>
      <nav><Link to="/">Home</Link> | <Link to="/about">About</Link></nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  )
}
