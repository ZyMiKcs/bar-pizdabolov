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
// Дополняем структуру участников и комнат
const gameStates = {};
// Создать комнату
app.post("/create-room", (req, res) => {
    const roomId = (0, uuid_1.v4)();
    rooms[roomId] = [];
    participants[roomId] = [];
    res.json({ roomId });
});
const handlePickCardType = () => {
    const targetTypes = ["queen", "king", "ace"];
    const targetType = targetTypes[Math.floor(Math.random() * targetTypes.length)];
    return targetType;
};
const shuffleDeck = () => {
    const deck = [
        ...Array(6).fill("queen"),
        ...Array(6).fill("king"),
        ...Array(6).fill("ace"),
        ...Array(2).fill("joker"),
    ].map((type, index) => ({ id: `${type}-${index + 1}`, type }));
    const shuffledDeck = deck.sort(() => Math.random() - 0.5);
    return shuffledDeck;
};
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
                isNoCards: false,
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
            const targetType = handlePickCardType();
            gameStates[roomId] = {
                currentType: targetType,
                currentTurn: participants[roomId][0].userId,
                prevTurn: participants[roomId][0].userId,
                tableCards: [],
            };
            // Перемешиваем колоду
            const shuffledDeck = shuffleDeck();
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
                        prevTurn: participants[roomId][0].userId,
                        targetType,
                    }));
                }
            });
        }
        if (message.type === "call-bluff") {
            const { currentTurn } = message;
            const lastTableCards = gameStates[roomId].tableCards;
            const prevTurn = gameStates[roomId].prevTurn;
            const targetType = gameStates[roomId].currentType;
            const shuffledDeck = shuffleDeck();
            const cardsPerPlayer = 5;
            const assigned = participants[roomId].reduce((acc, participant, index) => {
                acc[participant.userId] = shuffledDeck.slice(index * cardsPerPlayer, index * cardsPerPlayer + cardsPerPlayer);
                return acc;
            }, {});
            // Проверяем карты
            const isBluff = lastTableCards.some((card) => card !== targetType && card !== "joker");
            const newCardType = handlePickCardType();
            gameStates[roomId] = Object.assign(Object.assign({}, gameStates[roomId]), { currentType: newCardType });
            // Выбираем жертву
            const targetUserId = isBluff ? prevTurn : currentTurn;
            const participant = participants[roomId].find((p) => p.userId === targetUserId);
            if (participant) {
                if (Math.random() < 1 / (6 - participant.shots)) {
                    participant.isDead = true;
                }
                else {
                    participant.shots += 1;
                }
                // Проверяем оставшихся игроков
                const alivePlayers = participants[roomId].filter((p) => !p.isDead && !p.isNoCards);
                if (alivePlayers.length === 1) {
                    // Игра завершена
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
                participants[roomId] = participants[roomId].map((participant) => (Object.assign(Object.assign({}, participant), { isNoCards: false })));
                // Уведомляем игроков о состоянии
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-participant",
                            userId: targetUserId,
                            isDead: participant.isDead,
                            shots: participant.shots,
                        }));
                        client.send(JSON.stringify({
                            type: "start-round",
                            cards: assigned,
                            targetType: newCardType,
                        }));
                    }
                });
                // Передаем ход
                const currentIndex = alivePlayers.findIndex((p) => p.userId === currentTurn);
                let nextIndex = (currentIndex + 1) % alivePlayers.length;
                const nextTurn = alivePlayers[nextIndex].userId;
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-turn",
                            currentTurn: nextTurn,
                            prevTurn: nextTurn,
                        }));
                    }
                });
            }
        }
        if (message.type === "fold-cards") {
            const { cards, currentTurn, isNoCards } = message;
            const participant = participants[roomId].find((p) => p.userId === currentTurn);
            if (participant) {
                participants[roomId] = participants[roomId].map((participant) => {
                    if (participant.userId === currentTurn) {
                        return Object.assign(Object.assign({}, participant), { isNoCards });
                    }
                    return participant;
                });
                const alivePlayers = participants[roomId].filter((p) => !p.isDead && !p.isNoCards);
                const currentIndex = alivePlayers.findIndex((p) => p.userId === currentTurn);
                let nextIndex = (currentIndex + 1) % alivePlayers.length;
                const nextTurn = alivePlayers[nextIndex].userId;
                gameStates[roomId] = Object.assign(Object.assign({}, gameStates[roomId]), { prevTurn: currentTurn, currentTurn: nextTurn, tableCards: cards });
                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(JSON.stringify({
                            type: "update-turn",
                            currentTurn: nextTurn,
                            prevTurn: currentTurn,
                        }));
                        client.send(JSON.stringify({
                            type: "update-participant",
                            userId: participant.userId,
                            isDead: participant.isDead,
                            shots: participant.shots,
                            isNoCards,
                        }));
                        client.send(JSON.stringify({
                            type: "update-table-cards",
                            cardsCount: cards.length,
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
