import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    setNickname,
    leaveRoom,
    RootState,
    joinRoom,
    updateCards,
    updateParticipants,
    startGame,
    kill,
    shot,
    updateCurrentTurn,
} from "../../store/store";
import { useNavigate, useParams } from "react-router-dom";
import {
    TextField,
    Button,
    Typography,
    Container,
    List,
    ListItem,
    ListItemText,
    Paper,
} from "@mui/material";

const GameRoom: React.FC = () => {
    const { roomId } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [nick, setNick] = useState("");
    const userIdRef = useRef<string>("");
    const participantsRef = useRef<
        Array<{
            nickname: string;
            shots: number;
            userId: string;
            isDead: boolean;
        }>
    >([]);
    const currentTurnRef = useRef<string>("");

    const {
        nickname,
        participants,
        isStarted,
        userId,
        cards,
        isDead,
        currentTurn,
    } = useSelector((state: RootState) => state.game);

    userIdRef.current = userId;
    participantsRef.current = participants;
    currentTurnRef.current = currentTurn;

    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!roomId) {
            navigate("/");
        }
    }, [roomId]);

    useEffect(() => {
        if (!nickname || !roomId) return;

        const socket = new WebSocket(`ws://localhost:3001/${roomId}`);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log("WebSocket connection opened");
        };

        socket.onmessage = async (event) => {
            let data;

            if (event.data instanceof Blob) {
                const text = await event.data.text();
                data = JSON.parse(text);
            } else {
                data = JSON.parse(event.data);
            }

            if (data.type === "connected") {
                dispatch(
                    joinRoom({
                        roomId: roomId || "",
                        isStarted: false,
                        userId: data.userId,
                        participants: data.participants || [],
                    })
                );

                socket.send(
                    JSON.stringify({
                        type: "join-room",
                        nickname,
                    })
                );
            }

            if (data.type === "participant-joined") {
                dispatch(updateParticipants(data.participants || []));
            }

            if (data.type === "game-started") {
                dispatch(updateCards(data.cards[userIdRef.current]));
                dispatch(updateCurrentTurn(data.currentTurn));
                dispatch(startGame());
            }

            if (data.type === "update-participant") {
                dispatch(
                    updateParticipants(
                        participantsRef.current.map((participant) =>
                            participant.userId === data.userId
                                ? {
                                      ...participant,
                                      isDead: data.isDead,
                                      shots: data.shots,
                                  }
                                : participant
                        )
                    )
                );
            }
            if (data.type === "update-turn") {
                dispatch(updateCurrentTurn(data.currentTurn));
            }

            if (data.type === "game-over") {
                alert(`Game over! Winner: ${data.winner}`);
                dispatch(leaveRoom()); // Возвращаем игрока в главное меню
                navigate("/");
            }
        };

        socket.onclose = () => {
            console.log("WebSocket connection closed");
        };

        return () => {
            // dispatch(leaveRoom());
            socket.close();
        };
    }, [roomId, nickname]);

    const handleStartGame = () => {
        socketRef.current?.send(
            JSON.stringify({
                type: "start-game",
            })
        );
    };

    const handleShot = (targetUserId: string) => {
        const participant = participants.find((p) => p.userId === targetUserId);
        if (!participant || participant.isDead) return;

        const chanceToDie = 100 / (6 - participant.shots); // Рассчитываем вероятность
        const isDead = Math.random() * 100 < chanceToDie;

        // Отправляем состояние на сервер
        socketRef.current?.send(
            JSON.stringify({
                type: "shot",
                targetUserId,
                isDead,
                currentTurn: currentTurnRef.current,
            })
        );

        // Обновляем локальное состояние (предполагаем успех)
        if (isDead) {
            dispatch(kill());
        } else {
            dispatch(shot());
        }
    };

    if (nickname === "") {
        return (
            <Container
                maxWidth="sm"
                sx={{ mt: 4 }}
            >
                <Paper
                    elevation={3}
                    sx={{ p: 4 }}
                >
                    <Typography
                        variant="h5"
                        gutterBottom
                    >
                        Enter your nickname
                    </Typography>
                    <TextField
                        value={nick}
                        onChange={(e) => setNick(e.target.value)}
                        fullWidth
                        label="Nickname"
                        sx={{ mb: 2 }}
                    />
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            dispatch(setNickname(nick));
                        }}
                    >
                        Set Nickname
                    </Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container
            maxWidth="sm"
            sx={{ mt: 4 }}
        >
            <Typography variant="h4">Room ID: {roomId}</Typography>

            <List>
                {participants.map((participant) => (
                    <ListItem
                        key={participant.userId}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <ListItemText
                            primary={participant.nickname}
                            secondary={
                                participant.isDead
                                    ? "Dead"
                                    : `Shots: ${participant.shots} / 6`
                            }
                        />
                        {!participant.isDead &&
                            participant.userId === userId &&
                            userId === currentTurn && ( // Кнопка активна только для текущего игрока
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() =>
                                        handleShot(participant.userId)
                                    }
                                    disabled={participant.shots >= 6}
                                >
                                    Shot
                                </Button>
                            )}
                    </ListItem>
                ))}
            </List>

            {!isStarted && participants.length >= 2 && (
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleStartGame}
                >
                    Start Game
                </Button>
            )}

            {isStarted && !isDead && (
                <div>
                    <Typography variant="h5">Your Cards</Typography>
                    <List sx={{ display: "flex" }}>
                        {cards.map((card) => (
                            <ListItem key={card.id}>
                                <ListItemText primary={card.type} />
                            </ListItem>
                        ))}
                    </List>
                </div>
            )}
        </Container>
    );
};

export default GameRoom;
