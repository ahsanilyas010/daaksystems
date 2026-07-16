import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Track } from "./pages/Track";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Track />} />
        <Route path="/:trackingNo" element={<Track />} />
      </Routes>
    </Router>
  );
}
