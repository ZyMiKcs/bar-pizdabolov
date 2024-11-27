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
    updateCurrentTurn,
    foldCards,
    setCardType,
    setCardsOnTable,
    resetIsNoCards,
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
            isNoCards: boolean;
        }>
    >([]);
    const currentTurnRef = useRef<string>("");
    const cardsRef = useRef<{ id: string; type: string }[]>([]);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);

    const {
        nickname,
        participants,
        isStarted,
        userId,
        cards,
        cardType,
        currentTurn,
        prevTurn,
        cardsOnTable,
    } = useSelector((state: RootState) => state.game);

    userIdRef.current = userId;
    participantsRef.current = participants;
    currentTurnRef.current = currentTurn;
    cardsRef.current = cards;

    const socketRef = useRef<WebSocket | null>(null);

    const isDead =
        participants.find((participant) => participant.userId === userId)
            ?.isDead || false;

    const currentTurnName =
        participants.find((participant) => participant.userId === currentTurn)
            ?.nickname || "";

    const prevTurnName =
        participants.find((participant) => participant.userId === prevTurn)
            ?.nickname || "";

    const isNoCards =
        participants.find((participant) => participant.userId === userId)
            ?.isNoCards || false;

    const isOneAlive =
        participants.filter(
            (participant) => !participant.isDead && !participant.isNoCards
        ).length === 1;

    useEffect(() => {
        if (!roomId) {
            navigate("/");
        }
    }, [roomId]);

    useEffect(() => {
        if (!nickname || !roomId) return;

        const socket = new WebSocket(`ws://85.192.56.103:3001/${roomId}`);
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

            if (data.type === "update-table-cards")
                dispatch(setCardsOnTable(data.cardsCount));

            if (data.type === "game-started") {
                dispatch(updateCards(data.cards[userIdRef.current]));
                dispatch(
                    updateCurrentTurn({
                        currentTurn: data.currentTurn,
                        prevTurn: data.prevTurn,
                    })
                );
                dispatch(setCardType(data.targetType.toUpperCase()));
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
                                      isNoCards: data.isNoCards,
                                  }
                                : participant
                        )
                    )
                );
            }
            if (data.type === "update-turn") {
                dispatch(
                    updateCurrentTurn({
                        currentTurn: data.currentTurn,
                        prevTurn: data.prevTurn,
                    })
                );
            }

            if (data.type === "start-round") {
                dispatch(updateCards(data.cards[userIdRef.current]));
                dispatch(setCardType(data.targetType.toUpperCase()));
                dispatch(resetIsNoCards());
                dispatch(setCardsOnTable(0));
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

    const handleCardClick = (cardId: string) => {
        if (!isStarted || isDead || currentTurn !== userId) return;
        setSelectedCards((prev) => {
            if (prev.includes(cardId)) {
                return prev.filter((id) => id !== cardId); // Удалить карту
            }
            if (prev.length < 3) {
                return [...prev, cardId]; // Добавить карту, если их меньше 3
            }
            return prev; // Если уже выбрано 3, ничего не меняем
        });
    };

    const handleFoldCards = () => {
        socketRef.current?.send(
            JSON.stringify({
                type: "fold-cards",
                cards: selectedCards.map((cardId) => {
                    const cardType = cardId.split("-")[0];
                    return cardType;
                }),
                currentTurn: currentTurnRef.current,
                isNoCards: cardsRef.current.length - selectedCards.length === 0,
            })
        );
        dispatch(foldCards(selectedCards));
        setSelectedCards([]);
    };

    const handleBluff = () => {
        socketRef.current?.send(
            JSON.stringify({
                type: "call-bluff",
                currentTurn: currentTurnRef.current,
            })
        );
        setSelectedCards([]);
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
            {currentTurn && isStarted && (
                <Typography>Сейчас ходит: {currentTurnName}</Typography>
            )}
            {cardsOnTable > 0 && (
                <Typography>
                    {prevTurnName} скинул {cardsOnTable}{" "}
                    {cardsOnTable > 1 ? cardType + "S" : cardType}
                </Typography>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="h5">Players:</Typography>
                {isStarted && cardType && (
                    <Typography variant="h5">Card type: {cardType}</Typography>
                )}
            </div>

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

            {isStarted && !isDead && !isNoCards && (
                <div>
                    <Typography variant="h5">Your Cards</Typography>
                    <List sx={{ display: "flex" }}>
                        {cards.map((card) => (
                            <ListItem
                                key={card.id}
                                onClick={() => handleCardClick(card.id)}
                                sx={{
                                    cursor:
                                        currentTurn === userId
                                            ? "pointer"
                                            : "not-allowed",
                                    color: selectedCards.includes(card.id)
                                        ? "green"
                                        : "inherit",
                                }}
                            >
                                <ListItemText primary={card.type} />
                            </ListItem>
                        ))}
                    </List>
                </div>
            )}
            {!isDead && currentTurn === userId && isStarted && (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "10px",
                    }}
                >
                    <Button
                        variant="outlined"
                        color="error"
                        disabled={prevTurn === currentTurn}
                        onClick={handleBluff}
                    >
                        Пиздабол
                    </Button>
                    <Button
                        variant="outlined"
                        color="primary"
                        disabled={selectedCards.length === 0 || isOneAlive}
                        onClick={handleFoldCards}
                    >
                        Ход
                    </Button>
                </div>
            )}
        </Container>
    );
};

export default GameRoom;
