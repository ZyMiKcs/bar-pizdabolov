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
    }>;
} = {};

// Создать комнату
app.post("/create-room", (req, res) => {
    const roomId = uuidv4();
    rooms[roomId] = [];
    participants[roomId] = [];
    res.json({ roomId });
});

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
                        })
                    );
                }
            });
        }

        if (message.type === "fold-cards") {
            const { cards, currentTurn, targetUserId } = message;

            const participant = participants[roomId].find(
                (p) => p.userId === targetUserId
            );

            if (participant) {
                const currentIndex = participants[roomId].findIndex(
                    (p) => p.userId === currentTurn
                );

                let nextIndex =
                    (currentIndex + 1) % participants[roomId].length;
                while (participants[roomId][nextIndex].isDead) {
                    nextIndex = (nextIndex + 1) % participants[roomId].length;
                }

                const nextTurn = participants[roomId][nextIndex].userId;

                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-turn",
                                currentTurn: nextTurn,
                            })
                        );
                    }
                });
            }
        }

        if (message.type === "shot") {
            const { targetUserId, isDead, currentTurn } = message;

            // Находим участника
            const participant = participants[roomId].find(
                (p) => p.userId === targetUserId
            );

            if (participant) {
                if (isDead) {
                    participant.isDead = true;
                } else {
                    participant.shots += 1;
                }

                const alivePlayers = participants[roomId].filter(
                    (p) => !p.isDead
                );

                if (alivePlayers.length === 1) {
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

                // Уведомляем всех игроков о новом состоянии
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-participant",
                                userId: targetUserId,
                                isDead,
                                shots: participant.shots,
                            })
                        );
                    }
                });

                // Определяем следующего игрока
                const currentIndex = participants[roomId].findIndex(
                    (p) => p.userId === currentTurn
                );

                let nextIndex =
                    (currentIndex + 1) % participants[roomId].length;
                while (participants[roomId][nextIndex].isDead) {
                    nextIndex = (nextIndex + 1) % participants[roomId].length;
                }

                const nextTurn = participants[roomId][nextIndex].userId;

                // Обновляем очередь и уведомляем всех игроков
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws.OPEN) {
                        client.send(
                            JSON.stringify({
                                type: "update-turn",
                                currentTurn: nextTurn,
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
