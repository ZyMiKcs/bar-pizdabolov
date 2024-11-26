"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const PORT = 3001;
// Подключаем CORS
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "..", "client", "dist")));
// Хранилище комнат и их участников
const rooms = {};
const participants = {};
// Создать комнату
app.post("/create-room", (req, res) => {
    const roomId = (0, uuid_1.v4)();
    rooms[roomId] = [];
    participants[roomId] = [];
    res.json({ roomId });
});
// WebSocket-сервер для работы с комнатами
const wss = new ws_1.WebSocket.Server({ noServer: true });
wss.on("connection", (ws, request) => {
    var _a;
    const roomId = (_a = request.url) === null || _a === void 0 ? void 0 : _a.slice(1);
    if (!roomId || !rooms[roomId]) {
        ws.send(JSON.stringify({ error: "Invalid room ID" }));
        ws.close();
        return;
    }
    if (rooms[roomId].length >= 4) {
        ws.send(JSON.stringify({ error: "Room is full" }));
        ws.close();
        return;
    }
    const userId = (0, uuid_1.v4)();
    rooms[roomId].push(ws);
    ws.send(JSON.stringify({
        type: "connected",
        userId,
    }));
    ws.on("message", (messageString) => {
        const message = JSON.parse(messageString);
        if (message.type === "join-room") {
            // Добавляем участника в массив комнаты
            participants[roomId].push({
                userId,
                nickname: message.nickname,
                shots: 0,
                isDead: false,
            });
            // Уведомляем всех участников комнаты о новом участнике
            rooms[roomId].forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({
                        type: "participant-joined",
                        participants: participants[roomId],
                    }));
                }
            });
        }
        if (message.type === "start-game") {
            // Создаем колоду карт с уникальными ID
            const deck = [
                ...Array(6).fill("queen"),
                ...Array(6).fill("king"),
                ...Array(6).fill("ace"),
                ...Array(2).fill("joker"),
            ].map((type, index) => ({ id: `${type}-${index + 1}`, type }));
            // Перемешиваем колоду
            const shuffledDeck = deck.sort(() => Math.random() - 0.5);
            const totalPlayers = participants[roomId].length;
            const cardsPerPlayer = 5;
            if (totalPlayers * cardsPerPlayer > shuffledDeck.length) {
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "error",
                            message: "Not enough cards for all players.",
                        }));
                    }
                });
                return;
            }
            // Раздаем карты
            const assigned = participants[roomId].reduce((acc, participant, index) => {
                acc[participant.userId] = shuffledDeck.slice(index * cardsPerPlayer, index * cardsPerPlayer + cardsPerPlayer);
                return acc;
            }, {});
            // Отправляем игрокам их карты
            rooms[roomId].forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({
                        type: "game-started",
                        cards: assigned,
                        currentTurn: participants[roomId][0].userId,
                    }));
                }
            });
        }
        if (message.type === "fold-cards") {
            const { cards, currentTurn, targetUserId } = message;
            const participant = participants[roomId].find((p) => p.userId === targetUserId);
            if (participant) {
                const currentIndex = participants[roomId].findIndex((p) => p.userId === currentTurn);
                let nextIndex = (currentIndex + 1) % participants[roomId].length;
                while (participants[roomId][nextIndex].isDead) {
                    nextIndex = (nextIndex + 1) % participants[roomId].length;
                }
                const nextTurn = participants[roomId][nextIndex].userId;
                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-turn",
                            currentTurn: nextTurn,
                        }));
                    }
                });
            }
        }
        if (message.type === "shot") {
            const { targetUserId, isDead, currentTurn } = message;
            // Находим участника
            const participant = participants[roomId].find((p) => p.userId === targetUserId);
            if (participant) {
                if (isDead) {
                    participant.isDead = true;
                }
                else {
                    participant.shots += 1;
                }
                const alivePlayers = participants[roomId].filter((p) => !p.isDead);
                if (alivePlayers.length === 1) {
                    rooms[roomId].forEach((client) => {
                        if (client.readyState === ws.OPEN) {
                            client.send(JSON.stringify({
                                type: "game-over",
                                winner: alivePlayers[0].nickname,
                            }));
                        }
                    });
                    return;
                }
                // Уведомляем всех игроков о новом состоянии
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-participant",
                            userId: targetUserId,
                            isDead,
                            shots: participant.shots,
                        }));
                    }
                });
                // Определяем следующего игрока
                const currentIndex = participants[roomId].findIndex((p) => p.userId === currentTurn);
                let nextIndex = (currentIndex + 1) % participants[roomId].length;
                while (participants[roomId][nextIndex].isDead) {
                    nextIndex = (nextIndex + 1) % participants[roomId].length;
                }
                const nextTurn = participants[roomId][nextIndex].userId;
                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-turn",
                            currentTurn: nextTurn,
                        }));
                    }
                });
            }
        }
    });
    ws.on("close", () => {
        // Удаляем соединение из комнаты
        rooms[roomId] = rooms[roomId].filter((client) => client !== ws);
        // Удаляем участника из списка
        participants[roomId] = participants[roomId].filter((participant) => participant.userId !== userId);
        // Уведомляем остальных участников
        rooms[roomId].forEach((client) => {
            if (client.readyState === ws.OPEN) {
                client.send(JSON.stringify({
                    type: "participant-left",
                    participants: participants[roomId],
                }));
            }
        });
    });
});
app.get("*", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "..", "client", "dist", "index.html"));
});
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});
