import express from "express";
import cors from "cors";
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const app = express();
const PORT = 3001;

// Подключаем CORS
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "..", "client", "dist")));

// Хранилище комнат и их участников
const rooms: { [key: string]: WebSocket[] } = {};
const participants: {
    [roomId: string]: Array<{
        userId: string;
        nickname: string;
        shots: number;
        isDead: boolean;
        isNoCards: boolean;
    }>;
} = {};

// Дополняем структуру участников и комнат
const gameStates: {
    [roomId: string]: {
        currentType: string;
        currentTurn: string;
        prevTurn: string;
        tableCards: string[]; // Последние сброшенные карты
    };
} = {};

// Создать комнату
app.post("/create-room", (req, res) => {
    const roomId = uuidv4();
    rooms[roomId] = [];
    participants[roomId] = [];
    res.json({ roomId });
});

const handlePickCardType = () => {
    const targetTypes = ["queen", "king", "ace"];
    const targetType =
        targetTypes[Math.floor(Math.random() * targetTypes.length)];

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
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws, request) => {
    const roomId = request.url?.slice(1);

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

    const userId = uuidv4();
    rooms[roomId].push(ws);

    ws.send(
        JSON.stringify({
            type: "connected",
            userId,
        })
    );

    ws.on("message", (messageString: string) => {
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
                    client.send(
                        JSON.stringify({
                            type: "participant-joined",
                            participants: participants[roomId],
                        })
                    );
                }
            });
        }

        if (message.type === "start-game") {
            const targetType = handlePickCardType();

            gameStates[roomId] = {
                currentType: targetType,
                currentTurn:
                    participants[roomId][
                        Math.floor(Math.random() * participants[roomId].length)
                    ].userId,
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
                        client.send(
                            JSON.stringify({
                                type: "error",
                                message: "Not enough cards for all players.",
                            })
                        );
                    }
                });
                return;
            }

            // Раздаем карты
            const assigned = participants[roomId].reduce(
                (acc, participant, index) => {
                    acc[participant.userId] = shuffledDeck.slice(
                        index * cardsPerPlayer,
                        index * cardsPerPlayer + cardsPerPlayer
                    );
                    return acc;
                },
                {} as { [key: string]: { id: string; type: string }[] }
            );

            // Отправляем игрокам их карты
            rooms[roomId].forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(
                        JSON.stringify({
                            type: "game-started",
                            cards: assigned,
                            currentTurn: participants[roomId][0].userId,
                            prevTurn: participants[roomId][0].userId,
                            targetType,
                        })
                    );
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

            const assigned = participants[roomId].reduce(
                (acc, participant, index) => {
                    acc[participant.userId] = shuffledDeck.slice(
                        index * cardsPerPlayer,
                        index * cardsPerPlayer + cardsPerPlayer
                    );
                    return acc;
                },
                {} as { [key: string]: { id: string; type: string }[] }
            );

            // Проверяем карты
            const isBluff = lastTableCards.some(
                (card) => card !== targetType && card !== "joker"
            );

            const newCardType = handlePickCardType();

            gameStates[roomId] = {
                ...gameStates[roomId],
                currentType: newCardType,
            };

            // Выбираем жертву
            const targetUserId = isBluff ? prevTurn : currentTurn;

            const participant = participants[roomId].find(
                (p) => p.userId === targetUserId
            );

            if (participant) {
                if (Math.random() < 1 / (6 - participant.shots)) {
                    participant.isDead = true;
                } else {
                    participant.shots += 1;
                }

                // Проверяем оставшихся игроков
                const alivePlayers = participants[roomId].filter(
                    (p) => !p.isDead && !p.isNoCards
                );
                if (alivePlayers.length === 1) {
                    // Игра завершена
                    rooms[roomId].forEach((client) => {
                        if (client.readyState === ws.OPEN) {
                            client.send(
                                JSON.stringify({
                                    type: "game-over",
                                    winner: alivePlayers[0].nickname,
                                })
                            );
                        }
                    });
                    return;
                }

                participants[roomId] = participants[roomId].map(
                    (participant) => ({
                        ...participant,
                        isNoCards: false,
                    })
                );

                // Уведомляем игроков о состоянии
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-participant",
                                userId: targetUserId,
                                isDead: participant.isDead,
                                shots: participant.shots,
                            })
                        );
                        client.send(
                            JSON.stringify({
                                type: "start-round",
                                cards: assigned,
                                targetType: newCardType,
                            })
                        );
                    }
                });

                // Передаем ход
                const currentIndex = alivePlayers.findIndex(
                    (p) => p.userId === currentTurn
                );
                let nextIndex = (currentIndex + 1) % alivePlayers.length;
                const nextTurn = alivePlayers[nextIndex].userId;

                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-turn",
                                currentTurn: nextTurn,
                                prevTurn: nextTurn,
                            })
                        );
                    }
                });
            }
        }

        if (message.type === "fold-cards") {
            const { cards, currentTurn, isNoCards } = message;

            const participant = participants[roomId].find(
                (p) => p.userId === currentTurn
            );

            if (participant) {
                participants[roomId] = participants[roomId].map(
                    (participant) => {
                        if (participant.userId === currentTurn) {
                            return {
                                ...participant,
                                isNoCards,
                            };
                        }
                        return participant;
                    }
                );

                const alivePlayers = participants[roomId].filter(
                    (p) => !p.isDead && !p.isNoCards
                );

                const currentIndex = alivePlayers.findIndex(
                    (p) => p.userId === currentTurn
                );

                let nextIndex = (currentIndex + 1) % alivePlayers.length;
                const nextTurn = alivePlayers[nextIndex].userId;

                gameStates[roomId] = {
                    ...gameStates[roomId],
                    prevTurn: currentTurn,
                    currentTurn: nextTurn,
                    tableCards: cards,
                };

                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-turn",
                                currentTurn: nextTurn,
                                prevTurn: currentTurn,
                            })
                        );
                        client.send(
                            JSON.stringify({
                                type: "update-participant",
                                userId: participant.userId,
                                isDead: participant.isDead,
                                shots: participant.shots,
                                isNoCards,
                            })
                        );
                        client.send(
                            JSON.stringify({
                                type: "update-table-cards",
                                cardsCount: cards.length,
                            })
                        );
                    }
                });
            }
        }
    });
    ws.on("close", () => {
        // Удаляем соединение из комнаты
        rooms[roomId] = rooms[roomId].filter((client) => client !== ws);

        // Удаляем участника из списка
        participants[roomId] = participants[roomId].filter(
            (participant) => participant.userId !== userId
        );

        // Уведомляем остальных участников
        rooms[roomId].forEach((client) => {
            if (client.readyState === ws.OPEN) {
                client.send(
                    JSON.stringify({
                        type: "participant-left",
                        participants: participants[roomId],
                    })
                );
            }
        });
    });
});

app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "..", "client", "dist", "index.html")
    );
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});
