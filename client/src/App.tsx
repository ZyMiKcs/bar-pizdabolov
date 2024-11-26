import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import GameRoom from "./pages/GameRoom/GameRoom";
import Home from "./pages/Home/Home";

const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route
                    path="/"
                    element={<Home />}
                />
                <Route
                    path="/room/:roomId"
                    element={<GameRoom />}
                />
            </Routes>
        </Router>
    );
};

export default App;
